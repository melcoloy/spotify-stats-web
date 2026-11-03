import { DB } from './data.js';
import { esc, fmt, dur, monthLabel, dateFr, JOURS, JOURS_LONG, eraColor } from './ui.js';

// ---------- infobulle partagée ----------
let tip;
export function setupTooltips() {
  tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  const show = (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tip.hidden = true; return; }
    tip.innerHTML = t.getAttribute('data-tip');
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tip.style.transform = `translate(${x}px, ${y}px)`;
  };
  document.addEventListener('mousemove', show);
  document.addEventListener('scroll', () => { tip.hidden = true; }, true);
}

const niceStep = (max, ticks = 4) => {
  const raw = max / ticks, p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};

// Histogramme temporel : par jour si la plage est courte, par semaine si moyenne, sinon par mois.
// Avec eras=true, chaque mois prend la couleur de l'artiste dominant.
export function timeChart(st, { eras = false, color = 'var(--coral)', height = 240 } = {}) {
  const span = st.range.to - st.range.from + 1;
  let bins = [];
  if (span <= 120) {
    for (let d = st.range.from; d <= st.range.to; d++) {
      const s = st.days.get(d) || 0;
      bins.push({ v: s / 3600, label: dateFr(d, true), tick: tickDay(d, span), tip: `${dateFr(d)}<br><b>${dur(s)}</b>` });
    }
  } else if (span <= 400) {
    for (let d = st.range.from; d <= st.range.to; d += 7) {
      let s = 0;
      for (let k = d; k < d + 7 && k <= st.range.to; k++) s += st.days.get(k) || 0;
      bins.push({ v: s / 3600, tick: tickWeek(d), tip: `Semaine du ${dateFr(d, true)}<br><b>${dur(s)}</b>` });
    }
  } else {
    const d0 = new Date(st.range.from * 86400000), d1 = new Date(st.range.to * 86400000);
    const m0 = d0.getUTCFullYear() * 12 + d0.getUTCMonth(), m1 = d1.getUTCFullYear() * 12 + d1.getUTCMonth();
    for (let m = m0; m <= m1; m++) {
      const s = st.months.get(m) || 0;
      let c = color, who = '';
      if (eras && st.monthArtist && st.monthArtist.get(m)) {
        let best = -1, bs = 0;
        for (const [a, v] of st.monthArtist.get(m)) if (v > bs) { bs = v; best = a; }
        c = eraColor(best);
        who = `<br>N°1 : ${esc(DB.artists[best])} (${dur(bs)})`;
      }
      bins.push({ v: s / 3600, c, tick: m % 12 === 0 || m === m0 ? String(Math.floor(m / 12)) : '', tip: `${monthLabel(m)}<br><b>${dur(s)}</b>${who}` });
    }
  }
  return bars(bins, { color, height, unit: 'h' });
}
function tickDay(d, span) {
  const dt = new Date(d * 86400000);
  if (span <= 31) return dt.getUTCDay() === 1 ? `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}` : '';
  return dt.getUTCDate() === 1 ? `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}` : '';
}
function tickWeek(d) {
  const dt = new Date(d * 86400000);
  return dt.getUTCDate() <= 7 ? `${dt.getUTCMonth() + 1}/${String(dt.getUTCFullYear()).slice(2)}` : '';
}

// Barres verticales génériques. bins : [{v, c?, tick?, tip?}]
export function bars(bins, { color = 'var(--coral)', height = 240, unit = '', yFmt = null } = {}) {
  const W = 900, H = height, L = 46, B = 24, T = 12, R = 6;
  const max = Math.max(1e-9, ...bins.map(b => b.v));
  const step = niceStep(max), top = Math.ceil(max / step) * step || 1;
  const y = v => T + (H - T - B) * (1 - v / top);
  const n = bins.length, bw = (W - L - R) / n, gap = n > 200 ? 0 : n > 80 ? 1 : Math.min(4, bw * 0.25);
  const yf = yFmt || (v => fmt(v, step < 1 ? 1 : 0) + (unit ? ' ' + unit : ''));
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img">`;
  for (let v = 0; v <= top + 1e-9; v += step) {
    s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${yf(v)}</text>`;
  }
  bins.forEach((b, i) => {
    const x = L + i * bw, hgt = Math.max(0, y(0) - y(b.v));
    s += `<rect x="${(x + gap / 2).toFixed(2)}" y="${(y(0) - hgt).toFixed(2)}" width="${Math.max(0.6, bw - gap).toFixed(2)}" height="${hgt.toFixed(2)}" rx="${bw > 6 ? 2 : 0}" fill="${b.c || color}"/>`;
    s += `<rect x="${x.toFixed(2)}" y="${T}" width="${bw.toFixed(2)}" height="${H - T - B}" fill="transparent" data-tip="${esc(b.tip || '')}"/>`;
    if (b.tick) s += `<text x="${(x + 1).toFixed(1)}" y="${H - 6}">${esc(b.tick)}</text>`;
  });
  return s + '</svg>';
}

// Carte de chaleur jour × heure (heat : 168 valeurs en secondes, lundi d'abord).
export function heatmap(heat) {
  const max = Math.max(1, ...heat);
  let g = '<div class="hgrid"><div></div>';
  for (let h = 0; h < 24; h++) g += `<div class="hl">${h % 3 === 0 ? h + ' h' : ''}</div>`;
  for (let d = 0; d < 7; d++) {
    g += `<div class="lab">${JOURS[d]}</div>`;
    for (let h = 0; h < 24; h++) {
      const v = heat[d * 24 + h];
      const o = v ? 0.08 + 0.92 * Math.pow(v / max, 0.75) : 0.03;
      g += `<div class="hc" style="opacity:${o.toFixed(3)}" data-tip="${JOURS_LONG[d]}, ${h} h – ${h + 1} h<br><b>${dur(v)}</b>"></div>`;
    }
  }
  return g + '</div>';
}

// Répartition horaire sur 24 h (somme des 7 jours).
export function hourProfile(heat) {
  const bins = [];
  for (let h = 0; h < 24; h++) {
    let s = 0; for (let d = 0; d < 7; d++) s += heat[d * 24 + h];
    bins.push({ v: s / 3600, tick: h % 3 === 0 ? `${h} h` : '', tip: `${h} h – ${h + 1} h<br><b>${dur(s)}</b>` });
  }
  return bars(bins, { color: 'var(--butter)', height: 180, unit: 'h' });
}

// Barre empilée horizontale (plateformes, etc.). items : [{label, v, c}]
export function stackBar(items) {
  const tot = items.reduce((s, x) => s + x.v, 0) || 1;
  return `<div class="stack">${items.map(x => `<span style="width:${(100 * x.v / tot).toFixed(2)}%;background:${x.c}" data-tip="${esc(x.label)}<br><b>${fmt(100 * x.v / tot)} %</b>"></span>`).join('')}</div>`;
}
