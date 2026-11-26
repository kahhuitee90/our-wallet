// Our Wallet: shared expenses for two people. Data is kept in localStorage.
const KEY = 'our-wallet-v1';
const defaults = { names: { A: 'Me', B: 'Partner' }, currency: 'RM', settingsAt: 0, txs: [], cloud: null };
let db = load();
let tab = 'home';
let editing = null; // id of the transaction being edited

function load() {
  try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY))); }
  catch { return structuredClone(defaults); }
}
function save() { localStorage.setItem(KEY, JSON.stringify(db)); }
// Entries that are not deleted. Deleted ones are kept as markers so the delete syncs.
const live = () => db.txs.filter((t) => !t.deleted);

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const name = (p) => esc(db.names[p]);
const other = (p) => (p === 'A' ? 'B' : 'A');
const money = (c) => `${esc(db.currency)} ${(c / 100).toFixed(2)}`;
const toCents = (v) => Math.round(parseFloat(v || '0') * 100) || 0;
const today = () => new Date().toISOString().slice(0, 10);
const month = (d) => d.slice(0, 7);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function render() {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('#app').innerHTML = { home, add, history: historyTab, settings }[tab]();
  if (tab === 'add') wireAdd();
}

// ---------- Home ----------
function home() {
  const bal = Split.balance(live());
  const m = month(today());
  const t = Split.totals(live().filter((x) => month(x.date) === m));
  const owe = bal === 0 ? 'You are all settled up 🎉'
    : bal > 0 ? `${name('B')} owes ${name('A')} <b>${money(bal)}</b>`
    : `${name('A')} owes ${name('B')} <b>${money(-bal)}</b>`;
  const recent = live().slice().sort(byDate).slice(0, 5).map(txRow).join('') || '<p class="mute">No entries yet. Tap Add.</p>';
  return `
    <div class="card"><div class="mute">Balance</div><div class="big">${owe}</div>
      ${bal ? `<button class="ghost" style="margin-top:10px" onclick="settleUp()">Record settle up</button>` : ''}</div>
    <div class="card"><div class="mute">This month</div>
      <div class="row" style="margin-top:8px">
        ${['A', 'B'].map((p) => `<div><b>${name(p)}</b><br>
          <span class="in">In ${money(t['in' + p])}</span><br>
          <span class="out">Spent ${money(t['spent' + p])}</span></div>`).join('')}
      </div></div>
    <div class="card"><div class="mute">Recent</div>${recent}</div>`;
}

function byDate(a, b) { return b.date.localeCompare(a.date) || b.id.localeCompare(a.id); }

function txRow(x) {
  let left, right, sub;
  if (x.type === 'expense') {
    const sh = Split.shares(x);
    const how = { even: 'Split evenly', percent: `Split ${x.split.percentA}/${100 - x.split.percentA}`, items: 'Split by item' }[x.split.mode];
    left = esc(x.desc || 'Expense');
    sub = `${name(x.paidBy)} paid · ${how} · ${name('A')} ${money(sh.A)}, ${name('B')} ${money(sh.B)}`;
    right = `<span class="out">−${money(x.amount)}</span>`;
  } else if (x.type === 'income') {
    left = esc(x.desc || 'Income'); sub = `To ${name(x.person)}`;
    right = `<span class="in">+${money(x.amount)}</span>`;
  } else {
    left = 'Settle up'; sub = `${name(x.from)} paid ${name(x.to)}`;
    right = money(x.amount);
  }
  return `<div class="tx" onclick="editTx('${x.id}')"><div>${left}<div class="mute">${esc(x.date)} · ${sub}</div></div><div>${right}</div></div>`;
}

function settleUp() {
  const bal = Split.balance(live());
  const from = bal > 0 ? 'B' : 'A';
  if (!confirm(`Record that ${db.names[from]} paid ${db.names[other(from)]} ${db.currency} ${(Math.abs(bal) / 100).toFixed(2)}?`)) return;
  db.txs.push({ id: uid(), type: 'settle', date: today(), from, to: other(from), amount: Math.abs(bal), updatedAt: Date.now() });
  save(); render(); sync();
}

// ---------- Add / edit ----------
let form; // working copy of the form state
function blankForm() {
  return { type: 'expense', date: today(), desc: '', amount: '', paidBy: 'A', person: 'A', from: 'A',
    mode: 'even', percentA: 50, items: [{ name: '', amount: '', owner: 'both' }] };
}
function editTx(id) {
  const x = db.txs.find((t) => t.id === id);
  if (!x) return;
  editing = id;
  form = Object.assign(blankForm(), x, { amount: (x.amount / 100).toFixed(2) });
  if (x.split) {
    form.mode = x.split.mode;
    form.percentA = x.split.percentA ?? 50;
    if (x.split.items) form.items = x.split.items.map((i) => ({ ...i, amount: (i.amount / 100).toFixed(2) }));
  }
  tab = 'add'; render();
sync();
}

function seg(field, opts) {
  return `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-seg="${field}" data-v="${v}" class="${form[field] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
const people = (field) => seg(field, [['A', name('A')], ['B', name('B')]]);

function add() {
  if (!form) form = blankForm();
  const f = form;
  let body = '';
  if (f.type === 'expense') {
    body = `
      <label>Paid by</label>${people('paidBy')}
      <label>Split</label>${seg('mode', [['even', 'Evenly'], ['percent', 'Percentage'], ['items', 'Per item']])}
      <div class="${f.mode === 'percent' ? '' : 'hidden'}">
        <label>${name('A')} pays <b id="pctA">${f.percentA}</b>% · ${name('B')} pays <b id="pctB">${100 - f.percentA}</b>%</label>
        <input type="range" min="0" max="100" step="5" name="percentA" value="${f.percentA}">
      </div>
      <div class="${f.mode === 'items' ? '' : 'hidden'}">
        <label>Items (leftover like tax or tip is split evenly)</label>
        ${f.items.map((it, i) => `<div class="item">
          <input placeholder="Item" data-item="${i}" data-k="name" value="${esc(it.name)}">
          <input placeholder="0.00" inputmode="decimal" data-item="${i}" data-k="amount" value="${esc(it.amount)}">
          <select data-item="${i}" data-k="owner">
            ${[['both', 'Both'], ['A', db.names.A], ['B', db.names.B]].map(([v, l]) => `<option value="${v}" ${it.owner === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select>
          <button type="button" class="x" data-del="${i}">×</button></div>`).join('')}
        <button type="button" class="ghost small" id="addItem">+ Add item</button>
        <button type="button" class="ghost small" id="fillTotal">Total = items</button>
      </div>
      <div class="mute" id="preview" style="margin-top:10px"></div>`;
  } else if (f.type === 'income') {
    body = `<label>Who received it</label>${people('person')}`;
  } else {
    body = `<label>Who paid</label>${people('from')}<div class="mute" style="margin-top:6px">They paid the other person back.</div>`;
  }
  return `<div class="card">
    ${seg('type', [['expense', 'Expense'], ['income', 'Money in'], ['settle', 'Settle up']])}
    <label>Amount</label><input name="amount" inputmode="decimal" placeholder="0.00" value="${esc(f.amount)}">
    <label>Description</label><input name="desc" placeholder="${f.type === 'income' ? 'Salary' : 'Groceries'}" value="${esc(f.desc)}">
    <label>Date</label><input type="date" name="date" value="${esc(f.date)}">
    ${body}
    <div class="row" style="margin-top:14px">
      ${editing ? '<button type="button" class="ghost" id="delTx">Delete</button>' : ''}
      <button type="button" id="saveTx">${editing ? 'Save changes' : 'Add'}</button>
    </div></div>`;
}

function buildTx() {
  const f = form;
  const base = { id: editing || uid(), type: f.type, date: f.date || today(), desc: f.desc.trim(), amount: toCents(f.amount) };
  if (f.type === 'income') return { ...base, person: f.person };
  if (f.type === 'settle') return { ...base, from: f.from, to: other(f.from) };
  const split = { mode: f.mode };
  if (f.mode === 'percent') split.percentA = Number(f.percentA);
  if (f.mode === 'items') split.items = f.items.filter((i) => toCents(i.amount)).map((i) => ({ name: i.name.trim(), amount: toCents(i.amount), owner: i.owner }));
  // Per item with no total typed: the total is the sum of the items.
  if (f.mode === 'items' && !base.amount) base.amount = split.items.reduce((s, i) => s + i.amount, 0);
  return { ...base, paidBy: f.paidBy, split };
}

function updatePreview() {
  const p = $('#preview');
  if (!p) return;
  const tx = buildTx();
  if (tx.split.mode === 'items') {
    const sum = tx.split.items.reduce((s, i) => s + i.amount, 0);
    if (sum > tx.amount) { p.innerHTML = `<span class="out">Items add up to ${money(sum)}, more than the total.</span>`; return; }
  }
  const sh = Split.shares(tx);
  p.innerHTML = `${name('A')} share: <b>${money(sh.A)}</b> · ${name('B')} share: <b>${money(sh.B)}</b>`;
}

function wireAdd() {
  const app = $('#app');
  app.oninput = (e) => {
    const el = e.target;
    if (el.dataset.item !== undefined) form.items[el.dataset.item][el.dataset.k] = el.value;
    else if (el.name) form[el.name] = el.value;
    if (el.name === 'percentA') { $('#pctA').textContent = el.value; $('#pctB').textContent = 100 - el.value; }
    updatePreview();
  };
  app.onclick = (e) => {
    const el = e.target.closest('button');
    if (!el) return;
    if (el.dataset.seg) { form[el.dataset.seg] = el.dataset.v; render(); }
    else if (el.dataset.del !== undefined) { form.items.splice(+el.dataset.del, 1); if (!form.items.length) form.items.push({ name: '', amount: '', owner: 'both' }); render(); }
    else if (el.id === 'addItem') { form.items.push({ name: '', amount: '', owner: 'both' }); render(); }
    else if (el.id === 'fillTotal') { form.amount = (form.items.reduce((s, i) => s + toCents(i.amount), 0) / 100).toFixed(2); render(); }
    else if (el.id === 'delTx') { if (confirm('Delete this entry?')) { db.txs = db.txs.map((t) => (t.id === editing ? { id: t.id, deleted: true, updatedAt: Date.now() } : t)); finish(); } }
    else if (el.id === 'saveTx') saveTx();
  };
  updatePreview();
}

function saveTx() {
  const tx = buildTx();
  if (tx.amount <= 0) return alert('Enter an amount.');
  if (tx.type === 'expense' && tx.split.mode === 'items') {
    const sum = tx.split.items.reduce((s, i) => s + i.amount, 0);
    if (!tx.split.items.length) return alert('Add at least one item.');
    if (sum > tx.amount) return alert('Items add up to more than the total.');
  }
  tx.updatedAt = Date.now();
  db.txs = db.txs.filter((t) => t.id !== tx.id).concat(tx);
  finish();
}
function finish() { save(); editing = null; form = null; tab = 'home'; render(); sync(); }

// ---------- History ----------
function historyTab() {
  const groups = {};
  live().slice().sort(byDate).forEach((x) => (groups[month(x.date)] ||= []).push(x));
  const keys = Object.keys(groups);
  if (!keys.length) return '<div class="card mute">No entries yet.</div>';
  return keys.map((m) => {
    const t = Split.totals(groups[m]);
    const label = new Date(m + '-01T00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return `<div class="card"><div class="row"><b>${label}</b>
      <span class="mute" style="text-align:right">In ${money(t.inA + t.inB)} · Spent ${money(t.spentA + t.spentB)}</span></div>
      ${groups[m].map(txRow).join('')}</div>`;
  }).join('');
}

// ---------- Settings ----------
function settings() {
  return `<div class="card">
      <label>Person 1</label><input id="nA" value="${name('A')}">
      <label>Person 2</label><input id="nB" value="${name('B')}">
      <label>Currency symbol</label><input id="cur" value="${esc(db.currency)}">
      <button style="margin-top:14px" onclick="saveSettings()">Save</button></div>
    ${syncCard()}
    <div class="card"><div class="mute">Backup to a file</div>
      <div class="row" style="margin-top:10px">
        <button class="ghost" onclick="exportData()">Export</button>
        <button class="ghost" onclick="$('#imp').click()">Import</button></div>
      <input type="file" id="imp" accept="application/json" class="hidden" onchange="importData(this.files[0])"></div>`;
}
function saveSettings() {
  db.names = { A: $('#nA').value.trim() || 'Me', B: $('#nB').value.trim() || 'Partner' };
  db.currency = $('#cur').value.trim();
  db.settingsAt = Date.now();
  save(); tab = 'home'; render(); sync();
}
function exportData() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wallet-${today()}.json`;
  a.click();
}
async function importData(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.txs)) throw new Error();
    if (!confirm(`Replace current data with ${data.txs.length} entries from this file?`)) return;
    db = Object.assign({}, defaults, data, { cloud: db.cloud, settingsAt: Date.now() }); db.txs.forEach((t) => (t.updatedAt = Date.now())); save(); sync(); tab = 'home'; render();
sync();
  } catch { alert('That file is not a wallet backup.'); }
}

document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => {
  tab = b.dataset.tab;
  if (tab === 'add' && !editing) form = blankForm();
  if (tab !== 'add') editing = null;
  render();
sync();
}));
window.addEventListener('focus', () => sync());
setInterval(() => document.visibilityState === 'visible' && sync(), 20000);
readSetupLink();
window.addEventListener('hashchange', () => { readSetupLink(); render(); sync(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
render();
sync();
