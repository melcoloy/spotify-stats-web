import { DB, trackLifecycles, dailySeries } from '../data.js';
import { esc, fmt, kpi, dateFr, link, thumb, href } from '../ui.js';
import { section } from './common.js';

const PEAK_MIN = 10;      // au moins 10 écoutes en 7 jours
const SHARE_MIN = 0.3;    // et au moins 30 % de toutes les écoutes du titre

export function render(root, ctx) {
  const { range } = ctx;
  const all = trackLifecycles(15);
  const inRange = x => x >= range.from && x <= range.to;
  const obs = all.filter(t => t.peak >= PEAK_MIN && t.peakShare >= SHARE_MIN && inRange(t.peakStart)).sort((a, b) => b.peak - a.peak);
  const classics = all.filter(t => t.total >= 30 && (inRange(t.first) || inRange(t.last) || (t.first < range.from && t.last > range.to))).sort((a, b) => b.span - a.span).slice(0, 12);
  const pool = all.filter(t => t.total >= 25 && (inRange(t.first) || inRange(t.last)));
  const halfMed = median(pool.map(t => t.halfLife));

  root.innerHTML = `<div class="page">
    <header class="page-h"><div class="eyebrow">${esc(ctx.periodLabel)}</div><h1>Obsessions et classiques</h1>
      <p class="lede">Une obsession, c'est un titre que tu as écouté au moins ${PEAK_MIN} fois en une semaine, avec au moins ${Math.round(SHARE_MIN * 100)} % de toutes ses écoutes concentrées sur ces sept jours. Un classique, c'est l'inverse : il revient pendant des années.</p></header>
    <div class="kpis">
      ${kpi(fmt(obs.length), 'Obsessions repérées')}
      ${kpi(obs[0] ? `${obs[0].peak}×` : '—', 'Record en une semaine', obs[0] ? esc(DB.tracks[obs[0].id]) : '')}
      ${kpi(halfMed != null ? `${fmt(halfMed)} j` : '—', 'Demi-vie médiane', 'Jours pour atteindre la moitié des écoutes d\'un titre')}
      ${kpi(classics[0] ? `${fmt(classics[0].span / 365, 1)} ans` : '—', 'Plus long classique', classics[0] ? esc(DB.tracks[classics[0].id]) : '')}
    </div>
    ${section('Tes obsessions', obs.length ? `<div class="obs">${obs.slice(0, 24).map(t => card(t)).join('')}</div>${obs.length > 24 ? `<p class="note">${obs.length - 24} autres obsessions non affichées.</p>` : ''}` : '<p class="empty">Aucune obsession dont la semaine record tombe dans cette période.</p>', { eyebrow: 'Classées par écoutes sur leur semaine record' })}
    ${section('Feux de paille ou classiques ?', `<div class="chart">${scatter(pool)}</div>
      <p class="note">Chaque point est un titre écouté au moins 25 fois. À gauche, ceux dont la moitié des écoutes est tombée en quelques jours ; à droite, ceux qui ont mis des mois ou des années. Clique sur un point pour ouvrir le titre.</p>`, { eyebrow: 'Demi-vie et nombre d\'écoutes' })}
    ${section('Tes classiques', `<div class="obs">${classics.map(t => card(t, true)).join('')}</div>`, { eyebrow: 'Écoutés sur la plus longue durée' })}
  </div>`;
  const svg = root.querySelector('.scatter');
  if (svg) svg.addEventListener('click', e => { const c = e.target.closest('[data-id]'); if (c) location.hash = href('track', +c.dataset.id); });
}

function median(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

function card(t, classic = false) {
  const a = DB.trackArtist[t.id];
  const meta = classic
    ? `${fmt(t.total)} écoutes de ${dateFr(t.first, true)} à ${dateFr(t.last, true)}`
    : `<b class="num">${t.peak}×</b> la semaine du ${dateFr(t.peakStart, true)}, soit ${Math.round(100 * t.peakShare)} % de ses ${fmt(t.total)} écoutes`;
  return `<article class="obs-c">
    <div class="obs-h">${thumb('track', t.id, 'md')}<div class="ent">${link('track', t.id, 'ent-name')}<small>${link('artist', a)}</small></div></div>
    <p class="obs-m">${meta}</p>
    ${spark(t)}
  </article>`;
}

// Écoutes par semaine sur toute la vie du titre, semaine record en couleur.
function spark(t) {
  const days = dailySeries(t.id);
  const from = t.first, to = Math.max(t.last, t.first + 7 * 12);
  const weeks = Math.ceil((to - from + 1) / 7);
  const n = Math.min(weeks, 160), per = Math.ceil(weeks / n);
  const binsN = Math.ceil(weeks / per);
  const bins = new Array(binsN).fill(0);
  for (const d of days) bins[Math.min(binsN - 1, Math.floor((d - from) / 7 / per))]++;
  const peakBin = Math.floor((t.peakStart - from) / 7 / per);
  const max = Math.max(...bins) || 1, W = 300, H = 46, bw = W / binsN;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${bins.map((v, i) => {
    const h = Math.max(v ? 1.5 : 0, (H - 2) * v / max);
    return `<rect x="${(i * bw).toFixed(2)}" y="${(H - h).toFixed(2)}" width="${Math.max(0.8, bw - (bw > 3 ? 1 : 0)).toFixed(2)}" height="${h.toFixed(2)}" fill="${Math.abs(i - peakBin) <= 0 ? 'var(--butter)' : 'var(--coral)'}"/>`;
  }).join('')}</svg>`;
}

function scatter(pool) {
  if (!pool.length) return '<p class="empty">Pas assez de titres sur cette période.</p>';
  const W = 900, H = 340, L = 54, B = 34, T = 12, R = 12;
  const maxX = Math.max(...pool.map(t => t.halfLife)) + 1, maxY = Math.max(...pool.map(t => t.total));
  const x = v => L + (W - L - R) * Math.log10(1 + v) / Math.log10(1 + maxX);
  const minY = Math.min(...pool.map(t => t.total));
  const y = v => T + (H - T - B) * (1 - (Math.log10(v) - Math.log10(minY)) / Math.max(1e-9, Math.log10(maxY) - Math.log10(minY)));
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg scatter" role="img" aria-label="Demi-vie et nombre d'écoutes par titre">`;
  for (const v of [0, 1, 7, 30, 90, 365, 1000].filter(v => v <= maxX)) s += `<line x1="${x(v)}" x2="${x(v)}" y1="${T}" y2="${H - B}" class="grid"/><text x="${x(v)}" y="${H - 16}" text-anchor="middle">${v === 0 ? '0' : v < 365 ? v + ' j' : fmt(v / 365, 1) + ' an' + (v >= 730 ? 's' : '')}</text>`;
  for (const v of [25, 50, 100, 250, 500, 1000].filter(v => v <= maxY && v >= minY)) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  s += `<text x="${W - R}" y="${H - 2}" text-anchor="end">demi-vie (échelle log) →</text>`;
  for (const t of pool) {
    const c = t.halfLife <= 14 ? 'var(--coral)' : t.halfLife >= 365 ? 'var(--e-mint)' : 'var(--butter)';
    s += `<circle cx="${x(t.halfLife).toFixed(1)}" cy="${y(t.total).toFixed(1)}" r="${t.total > 200 ? 5 : 3.5}" fill="${c}" fill-opacity="0.75" data-id="${t.id}" data-tip="${esc(DB.tracks[t.id])}<br>${esc(DB.artists[DB.trackArtist[t.id]])}<br><b>${fmt(t.total)} écoutes</b> · demi-vie ${fmt(t.halfLife)} j" style="cursor:pointer"/>`;
  }
  return s + '</svg>';
}
