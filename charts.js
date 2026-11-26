// Small SVG charts. Money in is series 1 (blue), money out is series 2 (orange).
const Charts = (() => {
  const W = 340;

  // Grouped columns: money in and out for each day (month view) or month (year view).
  function inOut(buckets, fmt) {
    const H = 150, top = 8, bottom = 22, left = 4;
    const max = Math.max(1, ...buckets.map((b) => Math.max(b.in, b.out)));
    const slot = (W - left) / buckets.length;
    const bw = Math.max(2, Math.min(12, (slot - 4) / 2));
    const y = (v) => top + (H - top - bottom) * (1 - v / max);
    const base = H - bottom;
    const every = buckets.length > 12 ? 5 : 1;
    let s = `<line x1="0" x2="${W}" y1="${base}" y2="${base}" class="axis"/>`;
    buckets.forEach((b, i) => {
      const cx = left + slot * i + slot / 2;
      const tip = `${b.long}: in ${fmt(b.in)}, out ${fmt(b.out)}`;
      s += `<rect x="${cx - slot / 2}" y="0" width="${slot}" height="${H}" fill="transparent" data-tip="${esc(tip)}"/>`;
      if (b.in) s += bar(cx - bw - 1, y(b.in), bw, base - y(b.in), 's1', tip);
      if (b.out) s += bar(cx + 1, y(b.out), bw, base - y(b.out), 's2', tip);
      if (i % every === 0 || i === buckets.length - 1) s += `<text x="${cx}" y="${H - 6}" text-anchor="middle" class="tick">${esc(b.label)}</text>`;
    });
    return `<div class="legend"><span><i class="s1"></i>Money in</span><span><i class="s2"></i>Money out</span></div>
      <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Money in and out over time">${s}</svg>`;
  }

  // Vertical bar with a rounded top and a square base.
  function bar(x, y, w, h, cls, tip) {
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    const d = `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
    return `<path d="${d}" class="${cls}" data-tip="${esc(tip)}"/>`;
  }

  // Horizontal bars, largest first, each labelled with its value.
  function hbars(rows, fmt, cls = 's2') {
    if (!rows.length) return '<p class="mute">Nothing spent yet.</p>';
    const max = Math.max(...rows.map((r) => r.value));
    return `<div class="hbars">${rows.map((r) => `
      <div class="hrow" data-tip="${esc(`${r.label}: ${fmt(r.value)}`)}">
        <div class="hlabel">${esc(r.label)}</div>
        <div class="htrack"><div class="hfill ${cls}" style="width:${Math.max(2, (r.value / max) * 100)}%"></div></div>
        <div class="hval">${fmt(r.value)}</div>
      </div>`).join('')}</div>`;
  }

  // Each person: how much they added and how much they spent.
  function people(rows, fmt) {
    const max = Math.max(1, ...rows.flatMap((r) => [r.in, r.out]));
    return `<div class="legend"><span><i class="s1"></i>Added</span><span><i class="s2"></i>Spent</span></div>
      <div class="hbars">${rows.map((r) => `
      <div class="pgroup"><div class="hlabel"><b>${esc(r.name)}</b></div>
        ${[['in', 's1', 'added'], ['out', 's2', 'spent']].map(([k, c, word]) => `
        <div class="hrow" data-tip="${esc(`${r.name} ${word} ${fmt(r[k])}`)}">
          <div class="htrack"><div class="hfill ${c}" style="width:${r[k] ? Math.max(2, (r[k] / max) * 100) : 0}%"></div></div>
          <div class="hval">${fmt(r[k])}</div></div>`).join('')}
      </div>`).join('')}</div>`;
  }

  // One tooltip for every chart: hover on desktop, tap on phones.
  function enableTips() {
    const tip = document.createElement('div');
    tip.className = 'tip';
    document.body.appendChild(tip);
    const show = (e) => {
      const t = e.target.closest?.('[data-tip]');
      if (!t) { tip.style.display = 'none'; return; }
      tip.textContent = t.getAttribute('data-tip');
      tip.style.display = 'block';
      const x = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, e.clientX - tip.offsetWidth / 2));
      tip.style.left = x + 'px';
      tip.style.top = Math.max(8, e.clientY - tip.offsetHeight - 14) + 'px';
    };
    document.addEventListener('pointermove', show);
    document.addEventListener('pointerdown', show);
    document.addEventListener('scroll', () => (tip.style.display = 'none'), true);
  }

  return { inOut, hbars, people, enableTips };
})();
