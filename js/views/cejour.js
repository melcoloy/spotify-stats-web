import { DB, computeStats, ranking, isoToDay, dayToIso, dayRange, years } from '../data.js';
import { esc, fmt, dur, dateFr, link, thumb, MOIS_LONG, JOURS_LONG } from '../ui.js';

// Mois-jour d'aujourd'hui, à l'heure locale.
export function todayMD() {
  const p = new Intl.DateTimeFormat('fr', { month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = t => p.find(x => x.type === t).value;
  return `${get('month')}-${get('day')}`;
}

// Une entrée par année passée où ce jour existe dans l'historique.
export function onThisDay(md) {
  const thisYear = new Date().getFullYear();
  const out = [];
  for (const y of years().slice().reverse()) {
    if (md === '02-29' && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) continue;
    const day = isoToDay(`${y}-${md}`);
    if (day < DB.firstDay || day > DB.lastDay) continue;
    const st = computeStats(dayRange(day));
    out.push({ y, day, ago: thisYear - y, st });
  }
  return out;
}

export function teaser(md = todayMD()) {
  const items = onThisDay(md).filter(x => x.st.plays && x.ago > 0).slice(0, 4);
  if (!items.length) return '';
  const [m, d] = md.split('-').map(Number);
  return `<section class="block"><div class="block-h"><div><div class="eyebrow">Ce jour-là</div><h2>Un ${d} ${MOIS_LONG[m - 1]}, les autres années</h2></div><div class="block-r"><a class="more" href="#/ce-jour-la">Tout voir</a></div></div>
    <div class="otd-strip">${items.map(x => { const t = ranking(x.st, 'track', 'plays', 1)[0]; return `<a class="otd-mini" href="#/jour/${dayToIso(x.day)}">${thumb('track', t.id, 'md')}<span><small>il y a ${x.ago} an${x.ago > 1 ? 's' : ''}</small><b>${esc(DB.tracks[t.id])}</b><em>${esc(DB.artists[DB.trackArtist[t.id]])} · ${dur(x.st.sec)} ce jour-là</em></span></a>`; }).join('')}</div></section>`;
}

export function render(root, ctx) {
  const md = /^\d{2}-\d{2}$/.test(ctx.params.d || '') ? ctx.params.d : todayMD();
  const [m, d] = md.split('-').map(Number);
  const shift = n => { const dt = new Date(Date.UTC(2024, m - 1, d + n)); return `${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`; };
  const items = onThisDay(md);
  const isToday = md === todayMD();

  root.innerHTML = `<div class="page">
    <header class="page-h"><div class="eyebrow">Ce jour-là</div><h1>Le ${d} ${MOIS_LONG[m - 1]}${isToday ? ', comme aujourd\'hui' : ''}</h1>
      <p class="lede">Ce que tu écoutais à la même date, année après année.</p></header>
    <div class="day-nav"><a class="btn ghost small" href="#/ce-jour-la?d=${shift(-1)}">← Veille</a>
      ${isToday ? '<span></span>' : `<a class="btn ghost small" href="#/ce-jour-la">Aujourd'hui</a>`}
      <a class="btn ghost small" href="#/ce-jour-la?d=${shift(1)}">Lendemain →</a></div>
    <div class="otd">${items.map(x => card(x)).join('') || '<p class="empty">Cette date n\'est pas couverte par ton historique.</p>'}</div>
  </div>`;
}

function card({ y, day, ago, st }) {
  const label = ago > 0 ? `il y a ${ago} an${ago > 1 ? 's' : ''}` : 'cette année';
  if (!st.plays) return `<article class="otd-c empty-c"><div class="otd-h"><span class="otd-y num">${y}</span><span class="otd-a">${label}</span></div><p class="empty">Aucune écoute ce jour-là.</p></article>`;
  const tr = ranking(st, 'track', 'plays', 5), ar = ranking(st, 'artist', 'sec', 3);
  return `<article class="otd-c">
    <div class="otd-h"><span class="otd-y num">${y}</span><span class="otd-a">${label} · ${JOURS_LONG[(day + 3) % 7]}</span><span class="otd-t num">${dur(st.sec)}</span></div>
    <ol class="otd-list">${tr.map(e => `<li>${thumb('track', e.id, 'sm')}<span class="ent">${link('track', e.id, 'ent-name')}<small>${esc(DB.artists[DB.trackArtist[e.id]])}</small></span><span class="num">${fmt(e.plays)}×</span></li>`).join('')}</ol>
    <p class="otd-f">Surtout ${ar.map(e => link('artist', e.id)).join(', ')} · <a href="#/jour/${dayToIso(day)}">voir la journée</a></p>
  </article>`;
}
