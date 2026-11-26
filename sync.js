// Cloud sync through Supabase. Both phones use the same project URL, key and
// wallet code. Each entry is one row; the newest edit of a row wins.
let syncing = false;
let syncStatus = '';

function cloudHeaders(c) {
  const h = { apikey: c.key, 'x-wallet': c.wallet, 'Content-Type': 'application/json' };
  if (c.key.startsWith('eyJ')) h.Authorization = `Bearer ${c.key}`; // older "anon" keys
  return h;
}

async function sync() {
  const c = db.cloud;
  if (!c || syncing || !navigator.onLine) return;
  syncing = true;
  try {
    const base = `${c.url.replace(/\/+$/, '')}/rest/v1/entries`;
    const res = await fetch(`${base}?select=id,data,updated_at`, { headers: cloudHeaders(c) });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const remote = new Map((await res.json()).map((r) => [r.id, r]));

    // Take anything newer from the cloud.
    let changed = false;
    const local = new Map(db.txs.map((t) => [t.id, t]));
    for (const [id, r] of remote) {
      if (id === '_settings') {
        if (r.updated_at > (db.settingsAt || 0)) {
          Object.assign(db, { names: r.data.names, currency: r.data.currency, settingsAt: r.updated_at });
          changed = true;
        }
      } else if (!local.has(id) || r.updated_at > (local.get(id).updatedAt || 0)) {
        local.set(id, r.data);
        changed = true;
      }
    }
    db.txs = [...local.values()];

    // Send anything newer from this phone.
    const up = db.txs
      .filter((t) => !remote.has(t.id) || (t.updatedAt || 0) > remote.get(t.id).updated_at)
      .map((t) => ({ wallet: c.wallet, id: t.id, data: t, updated_at: t.updatedAt || 0 }));
    const rs = remote.get('_settings');
    if (db.settingsAt && (!rs || db.settingsAt > rs.updated_at)) {
      up.push({ wallet: c.wallet, id: '_settings', data: { names: db.names, currency: db.currency }, updated_at: db.settingsAt });
    }
    if (up.length) {
      const p = await fetch(base, {
        method: 'POST',
        headers: { ...cloudHeaders(c), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(up),
      });
      if (!p.ok) throw new Error(`${p.status} ${await p.text()}`);
    }
    save();
    syncStatus = `Synced ${new Date().toLocaleTimeString()}`;
    // Do not redraw over a form someone is filling in.
    if (changed && tab !== 'add' && tab !== 'settings') render();
  } catch (e) {
    syncStatus = `Sync failed: ${e.message.slice(0, 120)}`;
  } finally {
    syncing = false;
    const el = document.getElementById('syncStatus');
    if (el) el.textContent = syncStatus;
  }
}

function syncCard() {
  const c = db.cloud || { url: '', key: '', wallet: '' };
  return `<div class="card"><div class="mute">Cloud sync (Supabase)</div>
    <label>Project URL</label><input id="cUrl" placeholder="https://xxxx.supabase.co" value="${esc(c.url)}">
    <label>Publishable (anon) key</label><input id="cKey" value="${esc(c.key)}">
    <label>Wallet code (a long secret you both share)</label>
    <div class="row"><input id="cWallet" value="${esc(c.wallet)}" style="flex:3">
      <button class="ghost small" onclick="$('#cWallet').value = randomCode()">New</button></div>
    <div class="row" style="margin-top:12px">
      <button onclick="connectCloud()">${db.cloud ? 'Save and sync' : 'Connect'}</button>
      ${db.cloud ? '<button class="ghost" onclick="shareSetup()">Invite partner</button>' : ''}</div>
    ${db.cloud ? '<button class="ghost small" style="margin-top:8px" onclick="disconnectCloud()">Turn off sync on this phone</button>' : ''}
    <div class="mute" id="syncStatus" style="margin-top:8px">${esc(syncStatus)}</div></div>`;
}

function randomCode() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function connectCloud() {
  const url = $('#cUrl').value.trim(), key = $('#cKey').value.trim(), wallet = $('#cWallet').value.trim();
  if (!/^https:\/\//.test(url) || !key) return alert('Enter the project URL and key from Supabase.');
  if (wallet.length < 12) return alert('Use a wallet code of at least 12 characters. Tap New to make one.');
  db.cloud = { url, key, wallet };
  save();
  syncStatus = 'Syncing…';
  render();
  sync();
}

function disconnectCloud() {
  if (!confirm('Stop syncing on this phone? Entries already here stay here.')) return;
  db.cloud = null; syncStatus = ''; save(); render();
}

// The invite link carries the sync details after "#", which is never sent to a server.
function shareSetup() {
  const link = `${location.origin}${location.pathname}#setup=${btoa(JSON.stringify(db.cloud))}`;
  if (navigator.share) navigator.share({ title: 'Our Wallet', text: 'Join our shared wallet', url: link }).catch(() => {});
  else navigator.clipboard.writeText(link).then(() => alert('Invite link copied. Send it to your partner.'));
}

function readSetupLink() {
  const m = location.hash.match(/^#setup=(.+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname);
  try {
    const c = JSON.parse(atob(m[1]));
    if (c.url && c.key && c.wallet && confirm('Join this shared wallet on this phone?')) {
      db.cloud = { url: c.url, key: c.key, wallet: c.wallet };
      save();
    }
  } catch { /* ignore a broken link */ }
}
