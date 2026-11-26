// Our Wallet: one shared money pool for two people.
const CATEGORIES = ['Food', 'Groceries', 'Rent', 'Bills', 'Transport', 'Shopping', 'Travel', 'Fun', 'Health', 'Gifts', 'Other'];

const S = {
  session: null, wallet: null, entries: [], invites: [], myInvites: [],
  tab: 'dash', period: 'month', anchor: today(),
  form: null, loginEmail: '', codeSent: false, busy: false, msg: '',
};

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function today() { const d = new Date(); return ymd(d); }
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const toCents = (v) => Math.round(parseFloat(v || '0') * 100) || 0;
const money = (c) => `${esc(S.wallet?.currency || '')} ${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const me = () => S.session?.user?.id;
const people = () => (S.wallet?.members || []).map((m) => m.user_id);
const nameOf = (id) => esc(S.wallet?.members.find((m) => m.user_id === id)?.display_name || 'Someone');
const other = (id) => people().find((p) => p !== id);
const paired = () => people().length >= 2;

async function run(fn) {
  S.busy = true; S.msg = ''; render();
  try { await fn(); } catch (e) { S.msg = e.message || String(e); }
  S.busy = false; render();
}

// ---------- start up ----------
async function start() {
  Charts.enableTips();
  if (!Api.configured()) return render();
  Api.init();
  Api.onAuth(async (s) => {
    const changed = s?.user?.id !== S.session?.user?.id;
    S.session = s;
    if (changed) await loadWallet();
  });
  S.session = await Api.session();
  await loadWallet();
  window.addEventListener('focus', () => S.wallet && refresh());
}

async function loadWallet() {
  S.wallet = null; S.entries = [];
  if (!S.session) return render();
  try {
    S.wallet = await Api.myWallet(me());
    if (!S.wallet) S.myInvites = await Api.myInvites();
    else {
      await refresh();
      Api.listen(S.wallet.id, () => refresh());
    }
  } catch (e) { S.msg = e.message; }
  render();
}

async function refresh() {
  try {
    const [entries, wallet, invites] = await Promise.all([Api.entries(S.wallet.id), Api.myWallet(me()), Api.invites(S.wallet.id)]);
    S.entries = entries; S.wallet = wallet; S.invites = invites;
  } catch (e) { S.msg = e.message; }
  // Do not redraw over a form someone is filling in.
  if (S.tab === 'dash') render();
}

// ---------- screens ----------
function render() {
  const nav = $('nav');
  let html;
  if (!Api.configured()) html = setupScreen();
  else if (!S.session) html = loginScreen();
  else if (!S.wallet) html = joinScreen();
  else html = { dash, add, settings }[S.tab]();
  nav.classList.toggle('hidden', !S.wallet);
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  $('#title').textContent = S.wallet?.name || 'Our Wallet';
  const err = S.msg ? `<div class="card err">${esc(S.msg)}</div>` : '';
  $('#app').innerHTML = err + html;
  if (S.wallet && S.tab === 'add') wireAdd();
}

function setupScreen() {
  return `<div class="card"><h2>Connect to Supabase</h2>
    <p class="mute">Paste the Project URL and publishable key from your Supabase project. See the README for the steps.</p>
    <label>Project URL</label><input id="cUrl" placeholder="https://xxxx.supabase.co">
    <label>Publishable key</label><input id="cKey">
    <button style="margin-top:14px" onclick="saveConfig()">Continue</button></div>`;
}
function saveConfig() {
  const url = $('#cUrl').value.trim(), key = $('#cKey').value.trim();
  if (!/^https:\/\//.test(url) || !key) return alert('Enter both values.');
  Api.saveConfig(url, key);
  start();
}

function loginScreen() {
  if (!S.codeSent) {
    return `<div class="card"><h2>Sign in</h2>
      <p class="mute">Enter your email. We'll send you a sign-in code, no password needed.</p>
      <label>Email</label><input id="email" type="email" autocomplete="email" value="${esc(S.loginEmail)}">
      <button style="margin-top:14px" ${S.busy ? 'disabled' : ''} onclick="sendCode()">${S.busy ? 'Sending…' : 'Send code'}</button></div>`;
  }
  return `<div class="card"><h2>Check your email</h2>
    <p class="mute">We sent a code to <b>${esc(S.loginEmail)}</b>. Type it here, or tap the link in the email.</p>
    <label>Code</label><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10">
    <button style="margin-top:14px" ${S.busy ? 'disabled' : ''} onclick="verifyCode()">Sign in</button>
    <button class="ghost" style="margin-top:8px" onclick="S.codeSent=false;render()">Use another email</button></div>`;
}
function sendCode() {
  S.loginEmail = $('#email').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(S.loginEmail)) return alert('Enter a valid email.');
  run(async () => { await Api.sendCode(S.loginEmail); S.codeSent = true; });
}
function verifyCode() {
  const code = $('#code').value.trim();
  run(async () => { await Api.verifyCode(S.loginEmail, code); S.codeSent = false; });
}

function joinScreen() {
  const inv = S.myInvites[0];
  const nameField = `<label>Your name</label><input id="myName" placeholder="e.g. Tee">`;
  if (inv) {
    return `<div class="card"><h2>You're invited</h2>
      <p>${esc(inv.invited_by_name || 'Your partner')} invited you to <b>${esc(inv.wallet_name)}</b>.</p>
      ${nameField}<button style="margin-top:14px" ${S.busy ? 'disabled' : ''} onclick="joinWallet()">Join wallet</button></div>
      <div class="card"><button class="ghost" onclick="Api.signOut()">Sign out</button></div>`;
  }
  return `<div class="card"><h2>Create your shared wallet</h2>
      <p class="mute">Signed in as ${esc(S.session.user.email)}. Waiting for an invite instead? Ask your partner to invite this email, then pull to refresh.</p>
      ${nameField}
      <label>Wallet name</label><input id="wName" value="Our Wallet">
      <label>Currency</label><input id="wCur" value="RM">
      <button style="margin-top:14px" ${S.busy ? 'disabled' : ''} onclick="createWallet()">Create wallet</button></div>
    <div class="card"><button class="ghost" onclick="Api.signOut()">Sign out</button></div>`;
}
function joinWallet() {
  const n = $('#myName').value.trim();
  if (!n) return alert('Enter your name.');
  run(async () => { await Api.acceptInvites(n); await loadWallet(); });
}
function createWallet() {
  const n = $('#myName').value.trim();
  if (!n) return alert('Enter your name.');
  run(async () => { await Api.createWallet($('#wName').value.trim() || 'Our Wallet', $('#wCur').value.trim(), n); await loadWallet(); });
}

// ---------- dashboard ----------
function periodRange() {
  const [y, m, d] = S.anchor.split('-').map(Number);
  if (S.period === 'day') return { from: S.anchor, to: S.anchor, label: new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) };
  if (S.period === 'month') return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)), label: new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
}
function shift(n) {
  const [y, m, d] = S.anchor.split('-').map(Number);
  const dt = S.period === 'day' ? new Date(y, m - 1, d + n) : S.period === 'month' ? new Date(y, m - 1 + n, 1) : new Date(y + n, 0, 1);
  S.anchor = ymd(dt); render();
}
function setPeriod(p) { S.period = p; render(); }

function buckets(list) {
  const [y, m] = S.anchor.split('-').map(Number);
  let keys;
  if (S.period === 'month') {
    const days = new Date(y, m, 0).getDate();
    keys = Array.from({ length: days }, (_, i) => {
      const dt = new Date(y, m - 1, i + 1);
      return { key: ymd(dt), label: String(i + 1), long: dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) };
    });
  } else {
    keys = Array.from({ length: 12 }, (_, i) => {
      const dt = new Date(y, i, 1);
      return { key: `${y}-${String(i + 1).padStart(2, '0')}`, label: dt.toLocaleDateString(undefined, { month: 'narrow' }), long: dt.toLocaleDateString(undefined, { month: 'long' }) };
    });
  }
  const len = S.period === 'month' ? 10 : 7;
  const map = Object.fromEntries(keys.map((k) => [k.key, { ...k, in: 0, out: 0 }]));
  for (const e of list) {
    const b = map[e.date.slice(0, len)];
    if (!b || e.type === 'settle') continue;
    b[e.type === 'in' ? 'in' : 'out'] += e.amount;
  }
  return Object.values(map);
}

function dash() {
  const all = S.entries;
  const r = periodRange();
  const list = all.filter((e) => e.date >= r.from && e.date <= r.to);
  const sum = Money.summary(list);
  const pool = Money.poolBalance(all);
  const owe = paired() ? Money.owed(all, people()) : 0;
  const [a, b] = people();
  const oweLine = !owe ? '' : `<div class="owe">${owe > 0 ? `${nameOf(b)} owes ${nameOf(a)}` : `${nameOf(a)} owes ${nameOf(b)}`} <b>${money(Math.abs(owe))}</b> for own-pocket costs
      <button class="ghost small" onclick="startSettle()">Settle up</button></div>`;
  const cats = Object.entries(sum.byCategory).map(([label, value]) => ({ label, value })).sort((x, y) => y.value - x.value);
  const ppl = (S.wallet.members || []).map((m) => ({ name: m.display_name, ...(sum.byPerson[m.user_id] || { in: 0, out: 0 }) }));

  return `
    <div class="card hero"><div class="mute">Money in the pool</div>
      <div class="big ${pool < 0 ? 'neg' : ''}">${money(pool)}</div>${oweLine}</div>
    <div class="seg">${[['day', 'Day'], ['month', 'Month'], ['year', 'Year']].map(([v, l]) => `<button class="${S.period === v ? 'on' : ''}" onclick="setPeriod('${v}')">${l}</button>`).join('')}</div>
    <div class="pnav"><button class="ghost small" onclick="shift(-1)" aria-label="Previous">‹</button><b>${r.label}</b><button class="ghost small" onclick="shift(1)" aria-label="Next">›</button></div>
    <div class="tiles">
      <div class="card tile"><div class="mute">Money in</div><div class="mid">${money(sum.in)}</div></div>
      <div class="card tile"><div class="mute">Money out</div><div class="mid">${money(sum.out)}</div></div>
      <div class="card tile"><div class="mute">Net</div><div class="mid ${sum.in - sum.out < 0 ? 'neg' : ''}">${money(sum.in - sum.out)}</div></div>
    </div>
    ${S.period !== 'day' ? `<div class="card"><div class="ctitle">In and out by ${S.period === 'month' ? 'day' : 'month'}</div>${Charts.inOut(buckets(list), money)}</div>` : ''}
    <div class="card"><div class="ctitle">Spending by category</div>${Charts.hbars(cats, money)}</div>
    <div class="card"><div class="ctitle">Who added and who spent</div>${Charts.people(ppl, money)}</div>
    <div class="card"><div class="ctitle">Records</div>${list.length ? list.map(row).join('') : '<p class="mute">No records in this period.</p>'}</div>`;
}

function row(e) {
  let title, sub, amt;
  const when = new Date(e.date + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (e.type === 'in') {
    title = e.note || 'Added money'; sub = `${nameOf(e.person)} added to pool`;
    amt = `<span class="pos">+${money(e.amount)}</span>`;
  } else if (e.type === 'out') {
    title = e.note || e.category || 'Spent';
    sub = `${esc(e.category || 'Other')} · ${nameOf(e.person)} ${e.paid_from === 'own' ? 'paid own pocket' : 'spent from pool'}`;
    if (e.paid_from === 'own' && paired()) {
      const sh = Money.shares(e, people());
      sub += ` · ${people().map((p) => `${nameOf(p)} ${money(sh[p])}`).join(', ')}`;
    }
    amt = `<span>−${money(e.amount)}</span>`;
  } else {
    title = 'Settle up'; sub = `${nameOf(e.person)} paid back ${nameOf(e.to_person)}`; amt = money(e.amount);
  }
  return `<div class="tx" onclick="editEntry('${e.id}')"><div><div>${esc(title)}</div><div class="mute">${when} · ${sub}</div></div><div class="amt">${amt}</div></div>`;
}

// ---------- add / edit ----------
function blank(type = 'out') {
  const p = people();
  return { type, amount: '', date: today(), person: me(), paid_from: 'pool', category: 'Food', note: '',
    mode: 'even', pctA: 50, items: [{ name: '', amount: '', owner: 'both' }], id: null, _p: p };
}
function editEntry(id) {
  const e = S.entries.find((x) => x.id === id);
  if (!e) return;
  const f = { ...blank(e.type), ...e, amount: (e.amount / 100).toFixed(2) };
  if (e.split) {
    f.mode = e.split.mode;
    f.pctA = e.split.pct?.[people()[0]] ?? 50;
    if (e.split.items) f.items = e.split.items.map((i) => ({ ...i, amount: (i.amount / 100).toFixed(2) }));
  }
  S.form = f; S.tab = 'add'; render();
}
function startSettle() {
  const owe = Money.owed(S.entries, people());
  const [a, b] = people();
  S.form = { ...blank('settle'), person: owe > 0 ? b : a, amount: (Math.abs(owe) / 100).toFixed(2), note: '' };
  S.tab = 'add'; render();
}

function seg(field, opts) {
  return `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-seg="${field}" data-v="${esc(v)}" class="${String(S.form[field]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
const whoSeg = (field) => seg(field, S.wallet.members.map((m) => [m.user_id, esc(m.display_name)]));

function add() {
  if (!S.form) S.form = blank();
  const f = S.form;
  const [a, b] = people();
  let body = '';
  if (f.type === 'in') {
    body = `<label>Who added it</label>${whoSeg('person')}
      <label>What for</label><input name="note" placeholder="e.g. Salary, monthly top-up" value="${esc(f.note)}">`;
  } else if (f.type === 'out') {
    body = `<label>Who spent it</label>${whoSeg('person')}
      <label>Category</label><div class="chips">${CATEGORIES.map((c) => `<button type="button" data-seg="category" data-v="${c}" class="chip ${f.category === c ? 'on' : ''}">${c}</button>`).join('')}</div>
      <label>What for</label><input name="note" placeholder="e.g. Dinner at Nando's" value="${esc(f.note)}">
      ${paired() ? `<label>Paid from</label>${seg('paid_from', [['pool', 'The pool'], ['own', 'Own pocket']])}` : ''}
      <div class="${f.paid_from === 'own' && paired() ? '' : 'hidden'}">
        <label>Split the cost</label>${seg('mode', [['even', 'Evenly'], ['percent', 'Percentage'], ['items', 'Per item']])}
        <div class="${f.mode === 'percent' ? '' : 'hidden'}">
          <label>${nameOf(a)} <b id="pctA">${f.pctA}</b>% · ${nameOf(b)} <b id="pctB">${100 - f.pctA}</b>%</label>
          <input type="range" min="0" max="100" step="5" name="pctA" value="${f.pctA}">
        </div>
        <div class="${f.mode === 'items' ? '' : 'hidden'}">
          <label>Items (anything left over, like tax or tip, is split evenly)</label>
          ${f.items.map((it, i) => `<div class="item">
            <input placeholder="Item" data-item="${i}" data-k="name" value="${esc(it.name)}">
            <input placeholder="0.00" inputmode="decimal" data-item="${i}" data-k="amount" value="${esc(it.amount)}">
            <select data-item="${i}" data-k="owner">
              ${[['both', 'Both'], [a, S.wallet.members[0].display_name], [b, S.wallet.members[1]?.display_name]].map(([v, l]) => `<option value="${esc(v)}" ${it.owner === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
            </select>
            <button type="button" class="x" data-del="${i}" aria-label="Remove item">×</button></div>`).join('')}
          <button type="button" class="ghost small" id="addItem">+ Add item</button>
        </div>
        <div class="mute" id="preview" style="margin-top:10px"></div>
      </div>`;
  } else {
    body = `<label>Who paid back</label>${whoSeg('person')}
      <div class="mute" style="margin-top:6px">Paying the other person back for own-pocket costs.</div>`;
  }
  const types = [['in', 'Add money'], ['out', 'Spend']].concat(paired() ? [['settle', 'Pay back']] : []);
  return `<div class="card">
    ${seg('type', types)}
    <label>Amount</label><input name="amount" inputmode="decimal" placeholder="${f.type === 'out' && f.paid_from === 'own' && f.mode === 'items' ? 'Leave empty to use item total' : '0.00'}" value="${esc(f.amount)}">
    <label>Date</label><input type="date" name="date" value="${esc(f.date)}">
    ${body}
    <div class="row" style="margin-top:16px">
      ${f.id ? '<button type="button" class="ghost" id="delEntry">Delete</button>' : ''}
      <button type="button" id="saveEntry" ${S.busy ? 'disabled' : ''}>${f.id ? 'Save changes' : 'Save'}</button>
    </div></div>`;
}

function buildEntry() {
  const f = S.form;
  const [a, b] = people();
  const e = { id: f.id || undefined, wallet_id: S.wallet.id, type: f.type, amount: toCents(f.amount), date: f.date || today(),
    person: f.person, to_person: null, paid_from: 'pool', category: '', note: (f.note || '').trim(), split: null };
  if (f.type === 'settle') { e.to_person = other(f.person); return e; }
  if (f.type === 'in') return e;
  e.category = f.category;
  e.paid_from = paired() ? f.paid_from : 'pool';
  if (e.paid_from === 'own') {
    const split = { mode: f.mode };
    if (f.mode === 'percent') split.pct = { [a]: Number(f.pctA), [b]: 100 - Number(f.pctA) };
    if (f.mode === 'items') {
      split.items = f.items.filter((i) => toCents(i.amount)).map((i) => ({ name: i.name.trim(), amount: toCents(i.amount), owner: i.owner }));
      if (!e.amount) e.amount = split.items.reduce((s, i) => s + i.amount, 0);
    }
    e.split = split;
  }
  return e;
}

function updatePreview() {
  const p = $('#preview');
  if (!p || !paired()) return;
  const e = buildEntry();
  if (!e.split) return;
  if (e.split.items && e.split.items.reduce((s, i) => s + i.amount, 0) > e.amount) {
    p.innerHTML = '<span class="neg">The items add up to more than the amount.</span>'; return;
  }
  const sh = Money.shares(e, people());
  p.innerHTML = people().map((x) => `${nameOf(x)} pays <b>${money(sh[x])}</b>`).join(' · ');
}

function wireAdd() {
  const app = $('#app');
  app.oninput = (ev) => {
    const el = ev.target;
    if (el.dataset.item !== undefined) S.form.items[el.dataset.item][el.dataset.k] = el.value;
    else if (el.name) S.form[el.name] = el.value;
    if (el.name === 'pctA') { $('#pctA').textContent = el.value; $('#pctB').textContent = 100 - el.value; }
    updatePreview();
  };
  app.onclick = (ev) => {
    const el = ev.target.closest('button');
    if (!el) return;
    if (el.dataset.seg) { S.form[el.dataset.seg] = el.dataset.v; render(); }
    else if (el.dataset.del !== undefined) { S.form.items.splice(+el.dataset.del, 1); if (!S.form.items.length) S.form.items.push({ name: '', amount: '', owner: 'both' }); render(); }
    else if (el.id === 'addItem') { S.form.items.push({ name: '', amount: '', owner: 'both' }); render(); }
    else if (el.id === 'delEntry') { if (confirm('Delete this record?')) run(async () => { await Api.deleteEntry(S.form.id); done(); }); }
    else if (el.id === 'saveEntry') saveEntry();
  };
  updatePreview();
}

function saveEntry() {
  const e = buildEntry();
  if (e.amount <= 0) return alert('Enter an amount.');
  if (e.split?.items) {
    if (!e.split.items.length) return alert('Add at least one item.');
    if (e.split.items.reduce((s, i) => s + i.amount, 0) > e.amount) return alert('The items add up to more than the amount.');
  }
  run(async () => { await Api.saveEntry(e); done(); });
}
async function done() {
  S.form = null; S.tab = 'dash';
  await refresh();
}

// ---------- settings ----------
function settings() {
  const mine = S.wallet.members.find((m) => m.user_id === me());
  return `
    <div class="card"><div class="ctitle">Members</div>
      ${S.wallet.members.map((m) => `<div class="tx"><div>${esc(m.display_name)}<div class="mute">${esc(m.email)}</div></div></div>`).join('')}
      ${S.invites.map((i) => `<div class="tx"><div>${esc(i.email)}<div class="mute">Invited, not joined yet</div></div>
        <button class="ghost small" onclick="cancelInvite('${esc(i.email)}')">Cancel</button></div>`).join('')}
      ${paired() ? '' : `<label>Invite your partner by email</label>
        <div class="row"><input id="invEmail" type="email" placeholder="partner@email.com" style="flex:3">
        <button class="small" ${S.busy ? 'disabled' : ''} onclick="invite()">Invite</button></div>
        <p class="mute">They get an email with a sign-in link and code. When they open this app and sign in with that email, they join this wallet.</p>`}
    </div>
    <div class="card"><div class="ctitle">Wallet</div>
      <label>Your name</label><input id="myName" value="${esc(mine?.display_name)}">
      <label>Wallet name</label><input id="wName" value="${esc(S.wallet.name)}">
      <label>Currency</label><input id="wCur" value="${esc(S.wallet.currency)}">
      <button style="margin-top:14px" onclick="saveSettings()">Save</button></div>
    <div class="card"><div class="mute">Signed in as ${esc(S.session.user.email)}</div>
      <button class="ghost" style="margin-top:10px" onclick="Api.signOut()">Sign out</button></div>`;
}
function invite() {
  const email = $('#invEmail').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return alert('Enter a valid email.');
  run(async () => { await Api.invite(S.wallet.id, email); S.invites = await Api.invites(S.wallet.id); alert(`Invite sent to ${email}.`); });
}
function cancelInvite(email) { run(async () => { await Api.cancelInvite(S.wallet.id, email); S.invites = await Api.invites(S.wallet.id); }); }
function saveSettings() {
  run(async () => {
    await Api.updateMyName(S.wallet.id, me(), $('#myName').value.trim() || 'Me');
    await Api.updateWallet(S.wallet.id, { name: $('#wName').value.trim() || 'Our Wallet', currency: $('#wCur').value.trim() });
    S.tab = 'dash'; await refresh();
  });
}

document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => {
  S.tab = b.dataset.tab; S.msg = '';
  if (S.tab === 'add') S.form = blank();
  render();
}));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
start();
