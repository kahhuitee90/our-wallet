// Money math for the shared pool. All amounts are in cents (integers).
// people is the wallet's two member ids, in join order.
(function (root) {
  // How an own-pocket spend is shared: { [personId]: cents }.
  function shares(e, people) {
    const [a, b] = people;
    const total = e.amount;
    const s = e.split || { mode: 'even' };
    let shareA;
    if (s.mode === 'percent') {
      shareA = Math.round((total * (Number(s.pct?.[a]) || 0)) / 100);
    } else if (s.mode === 'items') {
      let onlyA = 0, onlyB = 0, both = 0;
      for (const it of s.items || []) {
        if (it.owner === a) onlyA += it.amount;
        else if (it.owner === b) onlyB += it.amount;
        else both += it.amount;
      }
      // Anything not covered by items (tax, tip) is shared evenly.
      both += total - (onlyA + onlyB + both);
      shareA = onlyA + Math.round(both / 2);
    } else {
      shareA = Math.round(total / 2);
    }
    return { [a]: shareA, [b]: total - shareA };
  }

  // Money in the pool: everything added minus everything spent from the pool.
  function poolBalance(entries) {
    let bal = 0;
    for (const e of entries) {
      if (e.type === 'in') bal += e.amount;
      else if (e.type === 'out' && e.paid_from !== 'own') bal -= e.amount;
    }
    return bal;
  }

  // Own-pocket costs. Positive: people[1] owes people[0]. Negative: the reverse.
  function owed(entries, people) {
    const [a, b] = people;
    if (!b) return 0;
    let netA = 0;
    for (const e of entries) {
      if (e.type === 'out' && e.paid_from === 'own') {
        const sh = shares(e, people);
        if (e.person === a) netA += sh[b];
        else if (e.person === b) netA -= sh[a];
      } else if (e.type === 'settle') {
        if (e.person === a) netA += e.amount;
        else if (e.person === b) netA -= e.amount;
      }
    }
    return netA;
  }

  // Totals for a list of entries: money in, money out, per person and per category.
  function summary(entries) {
    const s = { in: 0, out: 0, byPerson: {}, byCategory: {} };
    for (const e of entries) {
      if (e.type === 'settle') continue;
      const p = (s.byPerson[e.person] ||= { in: 0, out: 0 });
      if (e.type === 'in') { s.in += e.amount; p.in += e.amount; }
      else {
        s.out += e.amount; p.out += e.amount;
        const c = e.category || 'Other';
        s.byCategory[c] = (s.byCategory[c] || 0) + e.amount;
      }
    }
    return s;
  }

  const api = { shares, poolBalance, owed, summary };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Money = api;
})(this);
