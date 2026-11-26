// Split and balance math. All money is stored in cents (integers).
(function (root) {
  // Returns { A: cents, B: cents } that each person owes for an expense.
  function shares(tx) {
    const total = tx.amount;
    const s = tx.split || { mode: 'even' };
    if (s.mode === 'percent') {
      const a = Math.round((total * (Number(s.percentA) || 0)) / 100);
      return { A: a, B: total - a };
    }
    if (s.mode === 'items') {
      let a = 0, b = 0, both = 0;
      for (const it of s.items || []) {
        if (it.owner === 'A') a += it.amount;
        else if (it.owner === 'B') b += it.amount;
        else both += it.amount;
      }
      // Anything not covered by items (tax, tip) is shared evenly.
      both += total - (a + b + both);
      const half = Math.round(both / 2);
      return { A: a + half, B: b + (both - half) };
    }
    const half = Math.round(total / 2);
    return { A: half, B: total - half };
  }

  // Positive result: B owes A that many cents. Negative: A owes B.
  function balance(txs) {
    let netA = 0;
    for (const tx of txs) {
      if (tx.type === 'expense') {
        const sh = shares(tx);
        if (tx.paidBy === 'A') netA += sh.B;
        else netA -= sh.A;
      } else if (tx.type === 'settle') {
        netA += tx.from === 'A' ? tx.amount : -tx.amount;
      }
    }
    return netA;
  }

  // Money in and out per person for a list of transactions.
  function totals(txs) {
    const t = { inA: 0, inB: 0, spentA: 0, spentB: 0 };
    for (const tx of txs) {
      if (tx.type === 'income') t[tx.person === 'A' ? 'inA' : 'inB'] += tx.amount;
      if (tx.type === 'expense') {
        const sh = shares(tx);
        t.spentA += sh.A;
        t.spentB += sh.B;
      }
    }
    return t;
  }

  const api = { shares, balance, totals };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Split = api;
})(this);
