// Our Wallet: one shared money pool for two people.
const OUT_CATS = [
  { name: 'Food', icon: '🍜' }, { name: 'Groceries', icon: '🛒' }, { name: 'Rent', icon: '🏠' }, { name: 'Bills', icon: '💡' },
  { name: 'Transport', icon: '🚗' }, { name: 'Shopping', icon: '🛍️' }, { name: 'Travel', icon: '✈️' }, { name: 'Fun', icon: '🎬' },
  { name: 'Health', icon: '💊' }, { name: 'Gifts', icon: '🎁' }, { name: 'Pets', icon: '🐾' }, { name: 'Other', icon: '📦' },
];
const IN_CATS = [
  { name: 'Top-up', icon: '💰' }, { name: 'Salary', icon: '💼' }, { name: 'Gift', icon: '🎀' }, { name: 'Refund', icon: '↩️' },
];
const icon = (name) => [...OUT_CATS, ...IN_CATS].find((c) => c.name === name)?.icon || '📦';

const S = {
  session: null, wallet: null, entries: [], invites: [], myInvites: [],
  tab: 'dash', period: 'month', anchor: today(), filter: 'all',
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
  try {
    Api.init();
    Api.onAuth(async (s) => {
      const changed = s?.user?.id !== S.session?.user?.id;
      S.session = s;
      if (changed) await loadWallet();
    });
    S.session = await Api.session();
  } catch (e) {
    S.msg = 'Could not reach the sign-in service. You can still use "Try it without signing in" below.';
    return render();
  }
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
  // The add sheet draws separately, so this never wipes a half-filled form.
  if (S.tab !== 'settings') render();
}

// ---------- screens ----------
function go(tab) { S.tab = tab; S.msg = ''; render(); window.scrollTo(0, 0); }
function render() {
  const nav = $('nav');
  let html;
  if (!Api.configured()) html = setupScreen();
  else if (!S.session) html = loginScreen();
  else if (!S.wallet) html = Api.local ? localSetupScreen() : joinScreen();
  else html = { dash, tx: transactions, settings }[S.tab]();
  const inApp = !!S.wallet;
  nav.classList.toggle('hidden', !inApp);
  $('#fab').classList.toggle('hidden', !inApp || S.tab === 'settings');
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  $('#title').textContent = !inApp ? 'Our Wallet' : { dash: 'Dashboard', tx: 'Transactions', settings: 'Settings' }[S.tab];
  const err = S.msg && !S.form ? `<div class="card err">${esc(S.msg)}</div>` : '';
  $('#app').innerHTML = err + html;
}

function setupScreen() {
  return `<div class="card"><h2>Connect to Supabase</h2>
    <p class="mute">In Supabase, open <b>Project Settings → API Keys</b> (or <b>Data API</b>). Copy the <b>Project URL</b>, which ends in <b>.supabase.co</b>, and the <b>publishable</b> key. This is not the address of this app.</p>
    <label>Project URL</label><input id="cUrl" placeholder="https://abcdefghijklmnopqrst.supabase.co" autocapitalize="off" autocorrect="off" spellcheck="false">
    <label>Publishable key</label><input id="cKey" placeholder="sb_publishable_…" autocapitalize="off" autocorrect="off" spellcheck="false">
    <div class="err" id="cfgErr"></div>
    <button style="margin-top:6px" onclick="saveConfig()">Continue</button></div>
    <div class="card"><div class="ctitle">Just want to try it?</div>
      <p class="mute">Test every feature on this computer or phone without signing in. Data is saved in this browser only.</p>
      <button class="ghost" onclick="startTestMode()">Try it without signing in</button></div>`;
}
function saveConfig() {
  const url = Api.cleanUrl($('#cUrl').value), key = $('#cKey').value.trim();
  const bad = !url ? 'That is not a Supabase Project URL. It should look like https://abcdefghijklmnopqrst.supabase.co' : Api.keyProblem(key);
  if (bad) { $('#cfgErr').textContent = bad; return; }
  Api.saveConfig(url, key);
  location.reload();
}
function changeConnection() {
  if (!confirm('Forget this Supabase connection and enter it again?')) return;
  Api.resetConfig();
  location.reload();
}
const changeLink = () => (Api.fromFile() ? '' : `<button class="link" style="margin-top:14px" onclick="changeConnection()">Change Supabase connection</button>`);

function loginScreen() {
  if (!S.codeSent) {
    return `<div class="card"><h2>Sign in</h2>
      <p class="mute">Enter your email. We'll send you a sign-in code, no password needed.</p>
      <label>Email</label><input id="email" type="email" autocomplete="email" value="${esc(S.loginEmail)}">
      <button style="margin-top:14px" ${S.busy ? 'disabled' : ''} onclick="sendCode()">${S.busy ? 'Sending…' : 'Send code'}</button>
      ${changeLink()}</div>
    <div class="card"><div class="ctitle">Just want to try it?</div>
      <p class="mute">Test every feature on this computer or phone without signing in. Data is saved in this browser only.</p>
      <button class="ghost" onclick="startTestMode()">Try it without signing in</button></div>`;
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

function localSetupScreen() {
  return `<div class="card"><h2>Test mode</h2>
    <p class="mute">No sign-in needed. Everything is saved in this browser only, so you can try every feature. You can record transactions for either of you.</p>
    <label>Your name</label><input id="myName" placeholder="e.g. Tee">
    <label>Partner's name</label><input id="pName" placeholder="e.g. Mei">
    <label>Currency</label><input id="wCur" value="RM">
    <button style="margin-top:14px" onclick="createLocal()">Start</button>
    <button class="ghost" style="margin-top:8px" onclick="leaveTestMode()">Back to sign in</button></div>`;
}
function createLocal() {
  const a = $('#myName').value.trim(), b = $('#pName').value.trim();
  if (!a || !b) return alert('Enter both names.');
  run(async () => { await Api.createLocal('Our Wallet', $('#wCur').value.trim() || 'RM', a, b); await loadWallet(); });
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
  if (S.period === 'day') return { from: S.anchor, to: S.anchor, label: new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) };
  if (S.period === 'month') return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)), label: new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
}
function shift(n) {
  const [y, m, d] = S.anchor.split('-').map(Number);
  const dt = S.period === 'day' ? new Date(y, m - 1, d + n) : S.period === 'month' ? new Date(y, m - 1 + n, 1) : new Date(y + n, 0, 1);
  S.anchor = ymd(dt); render();
}
function setPeriod(p) { S.period = p; render(); }
const inPeriod = () => { const r = periodRange(); return S.entries.filter((e) => e.date >= r.from && e.date <= r.to); };

function periodBar() {
  const r = periodRange();
  return `<div class="seg">${[['day', 'Day'], ['month', 'Month'], ['year', 'Year']].map(([v, l]) => `<button class="${S.period === v ? 'on' : ''}" onclick="setPeriod('${v}')">${l}</button>`).join('')}</div>
    <div class="pnav"><button class="icon" onclick="shift(-1)" aria-label="Previous">‹</button><b>${r.label}</b><button class="icon" onclick="shift(1)" aria-label="Next">›</button></div>`;
}

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
  const list = inPeriod();
  const sum = Money.summary(list);
  const all = Money.summary(S.entries);
  const pool = Money.poolBalance(S.entries);
  const fromPool = S.entries.filter((e) => e.type === 'out' && e.paid_from !== 'own').reduce((t, e) => t + e.amount, 0);
  const cats = Object.entries(sum.byCategory).map(([label, value]) => ({ label: `${icon(label)} ${label}`, value })).sort((x, y) => y.value - x.value);
  const ppl = (S.wallet.members || []).map((m) => ({ name: m.display_name, ...(sum.byPerson[m.user_id] || { in: 0, out: 0 }) }));
  const recent = S.entries.slice(0, 5);

  return `
    <h3 class="sect">Account overview</h3>
    <section class="balance">
      <div class="mute">Total balance in the wallet</div>
      <div class="big ${pool < 0 ? 'neg' : ''}">${money(pool)}</div>
      <div class="split2">
        <div><div class="mute">Added in total</div><b>${money(all.in)}</b></div>
        <div><div class="mute">Spent from wallet</div><b>${money(fromPool)}</b></div>
      </div>
      <div class="quick">
        <button onclick="openSheet('in')"><span class="qi">＋</span>Add money</button>
        <button onclick="openSheet('out')"><span class="qi">−</span>Spend</button>
      </div>
    </section>

    ${paired() ? debtOverview() : ''}

    <h3 class="sect">Expenses overview</h3>
    ${periodBar()}
    <div class="tiles">
      <div class="tile"><div class="mute">In</div><div class="mid">${money(sum.in)}</div></div>
      <div class="tile"><div class="mute">Out</div><div class="mid">${money(sum.out)}</div></div>
      <div class="tile"><div class="mute">Net</div><div class="mid ${sum.in - sum.out < 0 ? 'neg' : ''}">${money(sum.in - sum.out)}</div></div>
    </div>
    ${S.period !== 'day' ? `<section class="card"><div class="ctitle">In and out by ${S.period === 'month' ? 'day' : 'month'}</div>${Charts.inOut(buckets(list), money)}</section>` : ''}
    <section class="card"><div class="ctitle">Spending by category</div>${Charts.hbars(cats, money)}</section>
    <section class="card"><div class="ctitle">Who added and who spent</div>${Charts.people(ppl, money)}</section>
    <section class="card"><div class="ctitle row"><span>Recent transactions</span><button class="link" onclick="go('tx')">See all ›</button></div>
      ${recent.length ? recent.map(row).join('') : `<p class="mute">No transactions yet. Tap <b>Add money</b> to start.</p>`}</section>`;
}

// Own-pocket spends and pay-backs between the two of you.
function debtOverview() {
  const owe = Money.owed(S.entries, people());
  const [a, b] = people();
  const ownBy = (p) => S.entries.filter((e) => e.type === 'out' && e.paid_from === 'own' && e.person === p).reduce((t, e) => t + e.amount, 0);
  const paidBack = S.entries.filter((e) => e.type === 'settle').reduce((t, e) => t + e.amount, 0);
  const head = !owe
    ? `<div class="debt-ok">✓ All square. Nobody owes anything.</div>`
    : `<div class="debt"><div><div class="mute">${owe > 0 ? `${nameOf(b)} owes ${nameOf(a)}` : `${nameOf(a)} owes ${nameOf(b)}`}</div>
        <div class="mid2">${money(Math.abs(owe))}</div></div><button class="small" onclick="startSettle()">Settle up</button></div>`;
  return `<h3 class="sect">Debt overview</h3>
    <section class="card">${head}
      <div class="split2 top">
        <div><div class="mute">${nameOf(a)} paid own pocket</div><b>${money(ownBy(a))}</b></div>
        <div><div class="mute">${nameOf(b)} paid own pocket</div><b>${money(ownBy(b))}</b></div>
      </div>
      <div class="mute small-note">Paid back so far: ${money(paidBack)}</div>
    </section>`;
}

// ---------- transactions ----------
function transactions() {
  const list = inPeriod().filter((e) => S.filter === 'all' || (S.filter === 'in' ? e.type === 'in' : S.filter === 'out' ? e.type === 'out' : e.category === S.filter));
  const groups = {};
  list.forEach((e) => (groups[e.date] ||= []).push(e));
  const filters = [['all', 'All'], ['in', 'Money in'], ['out', 'Money out']].concat(OUT_CATS.map((c) => [c.name, `${c.icon} ${c.name}`]));
  const body = Object.keys(groups).sort().reverse().map((d) => {
    const net = groups[d].reduce((s, e) => s + (e.type === 'in' ? e.amount : e.type === 'out' ? -e.amount : 0), 0);
    const label = new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    return `<div class="dayhead"><span>${label}</span><span>${net ? `${net > 0 ? '+' : '−'}${money(Math.abs(net))}` : ''}</span></div>
      <section class="card list">${groups[d].map(row).join('')}</section>`;
  }).join('');
  return `${periodBar()}
    <div class="chips scroll">${filters.map(([v, l]) => `<button class="chip ${S.filter === v ? 'on' : ''}" onclick="S.filter='${esc(v)}';render()">${l}</button>`).join('')}</div>
    ${body || '<p class="mute center">No transactions here.</p>'}`;
}

function row(e) {
  let title, sub, amt, ic;
  const when = new Date(e.date + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (e.type === 'in') {
    ic = icon(e.category || 'Top-up'); title = e.note || e.category || 'Added money';
    sub = `${nameOf(e.person)} added`;
    amt = `<span class="pos">+${money(e.amount)}</span>`;
  } else if (e.type === 'out') {
    ic = icon(e.category); title = e.note || e.category || 'Spent';
    sub = `${nameOf(e.person)} · ${e.paid_from === 'own' ? 'own pocket' : 'from pool'}`;
    if (e.paid_from === 'own' && paired()) {
      const sh = Money.shares(e, people());
      sub += ` · ${people().map((p) => `${nameOf(p)} ${money(sh[p])}`).join(', ')}`;
    }
    amt = `−${money(e.amount)}`;
  } else {
    ic = '🤝'; title = 'Pay back'; sub = `${nameOf(e.person)} paid ${nameOf(e.to_person)}`; amt = money(e.amount);
  }
  return `<div class="tx" onclick="editEntry('${e.id}')"><div class="ic">${ic}</div>
    <div class="txt"><div class="t">${esc(title)}</div><div class="mute">${when} · ${sub}</div></div><div class="amt">${amt}</div></div>`;
}

// ---------- add / edit sheet ----------
function blank(type = 'out') {
  return { type, amount: '', date: today(), person: me(), paid_from: 'pool', category: type === 'in' ? 'Top-up' : '', note: '',
    mode: 'even', pctA: 50, items: [{ name: '', amount: '', owner: 'both' }], id: null };
}
function openSheet(type) { S.form = blank(type); renderSheet(); setTimeout(() => $('#sheet [name=amount]')?.focus(), 50); }
function closeSheet() { S.form = null; renderSheet(); }
function editEntry(id) {
  const e = S.entries.find((x) => x.id === id);
  if (!e) return;
  const f = { ...blank(e.type), ...e, amount: (e.amount / 100).toFixed(2) };
  if (e.split) {
    f.mode = e.split.mode;
    f.pctA = e.split.pct?.[people()[0]] ?? 50;
    if (e.split.items) f.items = e.split.items.map((i) => ({ ...i, amount: (i.amount / 100).toFixed(2) }));
  }
  S.form = f; renderSheet();
}
function startSettle() {
  const owe = Money.owed(S.entries, people());
  const [a, b] = people();
  S.form = { ...blank('settle'), person: owe > 0 ? b : a, amount: (Math.abs(owe) / 100).toFixed(2) };
  renderSheet();
}

function seg(field, opts) {
  return `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-seg="${field}" data-v="${esc(v)}" class="${String(S.form[field]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
const whoSeg = (field) => seg(field, S.wallet.members.map((m) => [m.user_id, esc(m.display_name)]));

function sheetHtml() {
  const f = S.form;
  const [a, b] = people();
  const cats = f.type === 'in' ? IN_CATS : OUT_CATS;
  const types = [['out', 'Spend'], ['in', 'Add money']].concat(paired() ? [['settle', 'Pay back']] : []);
  const own = f.type === 'out' && f.paid_from === 'own' && paired();
  return `<div class="sheet-bg" data-close="1"></div>
  <div class="sheet" role="dialog" aria-label="Transaction">
    <div class="sheet-head"><b>${f.id ? 'Edit transaction' : 'New transaction'}</b><button type="button" class="icon" data-close="1" aria-label="Close">✕</button></div>
    ${seg('type', types)}
    <div class="amount-in"><span>${esc(S.wallet.currency)}</span><input name="amount" inputmode="decimal" placeholder="0.00" value="${esc(f.amount)}" autocomplete="off"></div>
    ${f.type === 'settle' ? '' : `<div class="catgrid">${cats.map((c) => `<button type="button" data-seg="category" data-v="${c.name}" class="cat ${f.category === c.name ? 'on' : ''}"><span>${c.icon}</span>${c.name}</button>`).join('')}</div>`}
    <label>${f.type === 'in' ? 'Added by' : f.type === 'out' ? 'Spent by' : 'Paid back by'}</label>${whoSeg('person')}
    <div class="row2">
      ${f.type === 'settle' ? '' : `<div><label>Note</label><input name="note" placeholder="${f.type === 'in' ? 'e.g. March salary' : 'e.g. Dinner'}" value="${esc(f.note)}"></div>`}
      <div><label>Date</label><input type="date" name="date" value="${esc(f.date)}"></div>
    </div>
    ${f.type === 'out' && paired() ? `
      <label class="switch"><input type="checkbox" id="ownToggle" ${own ? 'checked' : ''}><span>Paid from own pocket (split it)</span></label>
      <div class="${own ? '' : 'hidden'}">
        ${seg('mode', [['even', 'Evenly'], ['percent', 'Percentage'], ['items', 'Per item']])}
        <div class="${f.mode === 'percent' ? '' : 'hidden'}">
          <label>${nameOf(a)} <b id="pctA">${f.pctA}</b>% · ${nameOf(b)} <b id="pctB">${100 - f.pctA}</b>%</label>
          <input type="range" min="0" max="100" step="5" name="pctA" value="${f.pctA}">
        </div>
        <div class="${f.mode === 'items' ? '' : 'hidden'}">
          <label>Items (leftover like tax or tip is split evenly)</label>
          ${f.items.map((it, i) => `<div class="item">
            <input placeholder="Item" data-item="${i}" data-k="name" value="${esc(it.name)}">
            <input placeholder="0.00" inputmode="decimal" data-item="${i}" data-k="amount" value="${esc(it.amount)}">
            <select data-item="${i}" data-k="owner">
              ${[['both', 'Both'], [a, S.wallet.members[0].display_name], [b, S.wallet.members[1]?.display_name]].map(([v, l]) => `<option value="${esc(v)}" ${it.owner === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
            </select>
            <button type="button" class="x" data-del="${i}" aria-label="Remove item">✕</button></div>`).join('')}
          <button type="button" class="link" id="addItem">＋ Add item</button>
        </div>
        <div class="preview" id="preview"></div>
      </div>` : ''}
    ${S.msg ? `<div class="err">${esc(S.msg)}</div>` : ''}
    <div class="sheet-actions">
      ${f.id ? '<button type="button" class="ghost" id="delEntry">Delete</button>' : ''}
      <button type="button" id="saveEntry" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Saving…' : 'Save'}</button>
    </div>
  </div>`;
}

function renderSheet() {
  const el = $('#sheet');
  if (!S.form) { el.innerHTML = ''; document.body.classList.remove('locked'); return; }
  const scroll = el.querySelector('.sheet')?.scrollTop || 0;
  el.innerHTML = sheetHtml();
  el.querySelector('.sheet').scrollTop = scroll;
  document.body.classList.add('locked');
  updatePreview();
}

function buildEntry() {
  const f = S.form;
  const [a, b] = people();
  const e = { id: f.id || undefined, wallet_id: S.wallet.id, type: f.type, amount: toCents(f.amount), date: f.date || today(),
    person: f.person, to_person: null, paid_from: 'pool', category: '', note: (f.note || '').trim(), split: null };
  if (f.type === 'settle') { e.to_person = other(f.person); e.note = ''; return e; }
  e.category = f.category;
  if (f.type === 'in') return e;
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

function wireSheet() {
  const el = $('#sheet');
  el.oninput = (ev) => {
    const t = ev.target;
    if (t.id === 'ownToggle') { S.form.paid_from = t.checked ? 'own' : 'pool'; renderSheet(); return; }
    if (t.dataset.item !== undefined) S.form.items[t.dataset.item][t.dataset.k] = t.value;
    else if (t.name) S.form[t.name] = t.value;
    if (t.name === 'pctA') { $('#pctA').textContent = t.value; $('#pctB').textContent = 100 - t.value; }
    updatePreview();
  };
  el.onclick = (ev) => {
    if (ev.target.dataset?.close) return closeSheet();
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.close) closeSheet();
    else if (t.dataset.seg) {
      S.form[t.dataset.seg] = t.dataset.v;
      if (t.dataset.seg === 'type') S.form.category = t.dataset.v === 'in' ? 'Top-up' : '';
      renderSheet();
    }
    else if (t.dataset.del !== undefined) { S.form.items.splice(+t.dataset.del, 1); if (!S.form.items.length) S.form.items.push({ name: '', amount: '', owner: 'both' }); renderSheet(); }
    else if (t.id === 'addItem') { S.form.items.push({ name: '', amount: '', owner: 'both' }); renderSheet(); }
    else if (t.id === 'delEntry') { if (confirm('Delete this transaction?')) sheetRun(async () => { await Api.deleteEntry(S.form.id); }); }
    else if (t.id === 'saveEntry') saveEntry();
  };
}

function saveEntry() {
  const e = buildEntry();
  if (e.amount <= 0) return alert('Enter an amount.');
  if (e.type === 'out' && !e.category) return alert('Pick a category.');
  if (e.split?.items) {
    if (!e.split.items.length) return alert('Add at least one item.');
    if (e.split.items.reduce((s, i) => s + i.amount, 0) > e.amount) return alert('The items add up to more than the amount.');
  }
  sheetRun(async () => { await Api.saveEntry(e); });
}
async function sheetRun(fn) {
  S.busy = true; S.msg = ''; renderSheet();
  try { await fn(); S.form = null; await refresh(); } catch (e) { S.msg = e.message || String(e); }
  S.busy = false; renderSheet(); render();
}

// ---------- settings ----------
function settings() {
  if (Api.local) return localSettings();
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
      <button class="ghost" style="margin-top:10px" onclick="Api.signOut()">Sign out</button>${changeLink()}</div>`;
}
function localSettings() {
  const [a, b] = S.wallet.members;
  return `<div class="card"><div class="ctitle">Test mode</div>
      <p class="mute">Everything is saved in this browser only. Nothing is shared with your partner's phone yet.</p>
      <label>Your name</label><input id="nA" value="${esc(a.display_name)}">
      <label>Partner's name</label><input id="nB" value="${esc(b.display_name)}">
      <label>Wallet name</label><input id="wName" value="${esc(S.wallet.name)}">
      <label>Currency</label><input id="wCur" value="${esc(S.wallet.currency)}">
      <button style="margin-top:14px" onclick="saveLocalSettings()">Save</button></div>
    <div class="card">
      <button class="ghost" onclick="eraseTestData()">Delete all test data</button>
      <button class="ghost" style="margin-top:8px" onclick="leaveTestMode()">Leave test mode</button></div>`;
}
function saveLocalSettings() {
  const [a, b] = S.wallet.members;
  run(async () => {
    await Api.updateName(a.user_id, $('#nA').value.trim() || a.display_name);
    await Api.updateName(b.user_id, $('#nB').value.trim() || b.display_name);
    await Api.updateWallet(S.wallet.id, { name: $('#wName').value.trim() || 'Our Wallet', currency: $('#wCur').value.trim() });
    S.tab = 'dash'; await refresh();
  });
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

document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => go(b.dataset.tab)));
$('#fab').onclick = () => openSheet('out');
wireSheet();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
start();
