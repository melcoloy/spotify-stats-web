import { DB, fullRange, yearRange, years, ranking, discoveries, computeStats, byArtist, isoToDay } from '../data.js';
import { esc, fmt, dur, MOIS, eraColor, eraLegend, link, delta, dateFr, entityCell, daysShort } from '../ui.js';
import { timeChart } from '../charts.js';
import { section } from './common.js';
import { loc } from '../i18n.js';

export function render(root, ctx) {
  const full = ctx.statsFor(fullRange(), { eras: true });
  const ys = years();
  const yearStats = ys.map(y => ({ y, st: ctx.statsFor(yearRange(y)) }));

  const cards = yearStats.map(({ y, st }, i) => {
    if (!st.plays) return '';
    const a = ranking(st, 'artist', 'sec', 1)[0];
    const t = ranking(st, 'track', 'streams', 1)[0];
    const al = ranking(st, 'album', 'sec', 1)[0];
    const disc = discoveries(st).length;
    const prev = i ? yearStats[i - 1].st.sec : 0;
    const partial = y === ys[0] || y === ys[ys.length - 1];
    return `<article class="year" style="--c:${eraColor(a.id)}">
      <div class="year-h"><span class="year-y num">${y}</span><span class="num">${dur(st.sec)} ${prev && !partial ? delta(st.sec, prev) : ''}</span></div>
      <dl>
        <dt>${loc`Artiste`}</dt><dd>${link('artist', a.id)} <span class="num">${dur(a.sec)}</span></dd>
        <dt>${loc`Titre`}</dt><dd>${link('track', t.id)} <span class="num">${fmt(t.streams)}×</span></dd>
        <dt>${loc`Album`}</dt><dd>${link('album', al.id)}</dd>
        <dt>${loc`Nouveaux`}</dt><dd>${loc`${fmt(disc)} artistes découverts`}</dd>
      </dl>
      <div class="year-a"><button type="button" class="btn small" data-year="${y}">${loc`Explorer ${y}`}</button><a class="btn small ghost" href="#/wrapped/${y}">${loc`Wrapped ${y}`}</a></div>
      ${partial ? `<p class="note">${loc`Année incomplète dans l'historique.`}</p>` : ''}
    </article>`;
  }).join('');

  // Grille : n°1 de chaque mois.
  const grid = `<div class="mgrid-wrap"><div class="mgrid"><div></div>${MOIS.map(m => `<div class="mh">${m}</div>`).join('')}
    ${ys.map(y => `<div class="my num">${y}</div>` + MOIS.map((_, mi) => {
      const mk = y * 12 + mi, mm = full.monthArtist.get(mk);
      if (!mm) return '<div class="mc none"></div>';
      let best = -1, bs = 0, tot = 0;
      for (const [a, v] of mm) { tot += v; if (v > bs) { bs = v; best = a; } }
      return `<button type="button" class="mc${eraColor(best).startsWith('var') ? ' other' : ''}" style="--c:${eraColor(best)}" data-month="${mk}" data-tip="${MOIS[mi]} ${y}<br><b>${esc(DB.artists[best])}</b> · ${dur(bs)}<br>${dur(tot)} au total"><span>${esc(DB.artists[best])}</span></button>`;
    }).join('')).join('')}</div></div>`;

  root.innerHTML = `<div class="page">
    <header class="page-h"><div class="eyebrow">${loc`Tout l'historique`}</div><h1>${loc`Ta chronologie`}</h1>
      <p class="lede">${loc`Tes années, tes ères et la course entre tes artistes favoris depuis ${ys[0]}. Clique sur une année ou un mois pour explorer cette période.`}</p></header>
    ${section(loc`Tes ères`, `<div class="chart">${timeChart(full, { eras: true })}</div><div class="legend">${eraLegend()}</div>`, { eyebrow: loc`Heures par mois` })}
    ${section(loc`Année par année`, `<div class="years">${cards}</div>`, { eyebrow: loc`${ys.length} années` })}
    ${projection(ctx)}
    ${section(loc`Ton n°1, mois par mois`, grid, { eyebrow: loc`Grille` })}
    ${section(loc`La course`, `<div class="chart">${race()}</div><p class="note">${loc`Temps d'écoute cumulé de tes huit artistes les plus écoutés. Survole une courbe pour la mettre en avant.`}</p>`, { eyebrow: loc`Cumul depuis le début` })}
  </div>`;

  root.firstElementChild.addEventListener('click', e => {
    const yb = e.target.closest('[data-year]');
    if (yb) { ctx.setPeriod({ preset: 'y' + yb.dataset.year }); location.hash = '#/'; return; }
    const mb = e.target.closest('[data-month]');
    if (mb) {
      const mk = +mb.dataset.month, y = Math.floor(mk / 12), m = mk % 12;
      const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      ctx.setPeriod({ preset: 'custom', from, to: `${y}-${String(m + 1).padStart(2, '0')}-${last}` });
      location.hash = '#/';
    }
  });
  const svg = root.querySelector('.race');
  if (svg) svg.addEventListener('mouseover', e => {
    const g = e.target.closest('g[data-a]');
    svg.querySelectorAll('g[data-a]').forEach(x => x.classList.toggle('dim', !!g && x !== g));
  });
  if (svg) svg.addEventListener('mouseleave', () => svg.querySelectorAll('g[data-a]').forEach(x => x.classList.remove('dim')));
}

const RACE_FALLBACK = ['#5EE6A8', '#FF9F43', '#F78FB3', '#9AD0EC'];
function race() {
  const top = ranking(DB.global, 'artist', 'sec', 8);
  const d0 = new Date(DB.firstDay * 86400000), d1 = new Date(DB.lastDay * 86400000);
  const k0 = d0.getUTCFullYear() * 12 + d0.getUTCMonth(), k1 = d1.getUTCFullYear() * 12 + d1.getUTCMonth();
  const n = k1 - k0 + 1;
  const series = top.map(e => {
    const st = computeStats(fullRange(), byArtist(e.id));
    let acc = 0; const pts = [];
    for (let k = k0; k <= k1; k++) { acc += (st.months.get(k) || 0) / 3600; pts.push(acc); }
    return { id: e.id, pts };
  });
  const W = 900, H = 320, L = 46, R = 130, T = 12, B = 24;
  const max = Math.max(...series.map(s => s.pts[n - 1]));
  const step = max > 400 ? 100 : max > 150 ? 50 : 25, topV = Math.ceil(max / step) * step;
  const x = i => L + (W - L - R) * i / Math.max(1, n - 1), y = v => T + (H - T - B) * (1 - v / topV);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg race" role="img" aria-label="${loc`Temps cumulé par artiste`}">`;
  for (let v = 0; v <= topV; v += step) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v} h</text>`;
  for (let k = k0; k <= k1; k++) if (k % 12 === 0) s += `<text x="${x(k - k0)}" y="${H - 6}">${k / 12}</text>`;
  // Étiquettes de fin sans chevauchement.
  const ends = series.map(se => ({ se, yy: y(se.pts[n - 1]) })).sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 14) ends[i].yy = ends[i - 1].yy + 14;
  ends.forEach(({ se, yy }) => {
    const c = eraColor(se.id).startsWith('var') ? RACE_FALLBACK[se.id % RACE_FALLBACK.length] : eraColor(se.id);
    const d = se.pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    s += `<g data-a="${se.id}" data-tip="${esc(DB.artists[se.id])}<br><b>${fmt(se.pts[n - 1])} h</b>"><path d="${d}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="transparent" stroke-width="12"/>
      <text x="${W - R + 8}" y="${yy + 4}" class="race-l" style="fill:${c}">${esc(DB.artists[se.id])}</text></g>`;
  });
  return s + '</svg>';
}

// ---------- projection de l'année en cours ----------
// Total : on suppose que la fin d'année pèsera comme les années précédentes (saisonnalité).
// Classement : chaque artiste garde son rythme des 90 derniers jours.
function projection(ctx) {
  const y = new Date(DB.lastDay * 86400000).getUTCFullYear();
  const jan1 = isoToDay(`${y}-01-01`), dec31 = isoToDay(`${y}-12-31`);
  const remaining = dec31 - DB.lastDay;
  if (remaining < 7) return '';
  const cur = ctx.statsFor({ from: Math.max(jan1, DB.firstDay), to: DB.lastDay });
  const doy = DB.lastDay - jan1; // jours écoulés - 1
  const ratios = [];
  for (const py of years()) {
    if (py >= y) continue;
    const pj = isoToDay(`${py}-01-01`), pd = isoToDay(`${py}-12-31`);
    if (pj < DB.firstDay) continue; // année incomplète
    const before = ctx.statsFor({ from: pj, to: pj + doy }).sec, after = ctx.statsFor({ from: pj + doy + 1, to: pd }).sec;
    if (before > 0) ratios.push(after / before);
  }
  const elapsed = doy + 1;
  const ratio = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : remaining / elapsed;
  const projSec = cur.sec * (1 + ratio);
  const recentFrom = Math.max(jan1, DB.lastDay - 89);
  const recent = ctx.statsFor({ from: recentFrom, to: DB.lastDay });
  const recentDays = DB.lastDay - recentFrom + 1;
  const scale = (cur.sec * ratio) / Math.max(1, recent.sec); // ajuste le rythme récent à la saisonnalité
  const proj = kind => ranking(cur, kind, 'sec', 200).map(e => ({ ...e, proj: e.sec + recent[kind].sec[e.id] * scale })).sort((a, b) => b.proj - a.proj);
  const rows = (list, kind) => `<ol class="rank">${list.slice(0, 5).map((e, i) => {
    const now = ranking(cur, kind, 'sec', 200).findIndex(x => x.id === e.id);
    const mv = now === i ? '<span class="mv">=</span>' : `<span class="mv ${now > i ? 'up' : 'down'}">${now > i ? '▲' : '▼'} ${Math.abs(now - i)}</span>`;
    return `<li><span class="rk num">${i + 1}</span>${entityCell(kind, e.id)}<span class="rv num">${loc`${dur(e.proj)}<small>aujourd'hui ${dur(e.sec)}</small>${mv}`}</span></li>`;
  }).join('')}</ol>`;
  return section(loc`Projection de ton Wrapped ${y}`, `
    <div class="kpis">
      <div class="kpi"><div class="kpi-v num">${fmt(cur.sec / 3600)} h</div><div class="kpi-k">${loc`Au ${dateFr(DB.lastDay, true)}`}</div></div>
      <div class="kpi"><div class="kpi-v num">≈ ${fmt(projSec / 3600)} h</div><div class="kpi-k">${loc`Estimation au 31 décembre`}</div></div>
      <div class="kpi"><div class="kpi-v num">≈ ${fmt(projSec / 60)}</div><div class="kpi-k">${loc`Minutes, comme sur le vrai Wrapped`}</div></div>
      <div class="kpi"><div class="kpi-v num">${daysShort(remaining)}</div><div class="kpi-k">${loc`Restants dans l'année`}</div></div>
    </div>
    <div class="cols2">${section(loc`Artistes`, rows(proj('artist'), 'artist'), { eyebrow: loc`Top 5 estimé` })}${section(loc`Titres`, rows(proj('track'), 'track'), { eyebrow: loc`Top 5 estimé` })}</div>
    <p class="note">${loc`Le total suppose que ta fin d'année ressemblera à celle des ${ratios.length} années complètes précédentes (en moyenne, elles ont ajouté ${fmt(100 * ratio)} % après le ${dateFr(DB.lastDay, true).replace(/ \d{4}$/, '')}). Le classement prolonge le rythme de chaque artiste et titre sur les ${recentDays} derniers jours. Spotify arrête de compter vers la mi-novembre pour son Wrapped officiel, donc ses chiffres seront un peu plus bas.`}</p>`,
    { eyebrow: loc`Estimation` });
}
