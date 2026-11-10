import { DB, computeStats, ranking, indexRange, isoToDay, dayToIso, dayRange, reasonEndOf, STREAM_SEC } from '../data.js';
import { esc, fmt, dur, kpi, dateFr, link, JOURS_LONG, hourLabel } from '../ui.js';
import { bars } from '../charts.js';
import { section, rankList } from './common.js';
import { loc } from '../i18n.js';

const END_LABEL = { trackdone: loc`fini`, fwdbtn: loc`passé`, backbtn: loc`précédent`, endplay: loc`arrêté`, logout: loc`appli fermée`, remote: loc`autre appareil` };

// Jour actif le plus proche dans une direction (pour les boutons précédent/suivant).
function neighbour(day, dir) {
  const all = DB.global.days;
  for (let d = day + dir, n = 0; n < 4000 && d >= DB.firstDay && d <= DB.lastDay; d += dir, n++) if (all.has(d)) return d;
  return null;
}

export function render(root, ctx) {
  const iso = ctx.parts[1] || dayToIso(DB.lastDay);
  const day = isoToDay(iso);
  if (!Number.isFinite(day)) { root.innerHTML = `<div class="page"><div class="empty-page"><h1>${loc`Date invalide`}</h1></div></div>`; return; }
  const st = computeStats(dayRange(day));
  const prev = neighbour(day, -1), next = neighbour(day, 1);
  const dow = JOURS_LONG[(day + 3) % 7];
  const nav = `<div class="day-nav">${prev != null ? `<a class="btn ghost small" href="#/jour/${dayToIso(prev)}">← ${dateFr(prev, true)}</a>` : '<span></span>'}
    <label class="filter small" for="dayPick">${loc`Aller au`} <input type="date" id="dayPick" value="${dayToIso(day)}" min="${dayToIso(DB.firstDay)}" max="${dayToIso(DB.lastDay)}"></label>
    ${next != null ? `<a class="btn ghost small" href="#/jour/${dayToIso(next)}">${dateFr(next, true)} →</a>` : '<span></span>'}</div>`;
  const head = `<header class="page-h"><div class="eyebrow">${loc`Journée`}</div><h1>${dow.charAt(0).toUpperCase() + dow.slice(1)} ${dateFr(day)}</h1></header>${nav}`;
  if (!st.plays) {
    root.innerHTML = `<div class="page">${head}<div class="empty-page"><p>${loc`Aucune écoute ce jour-là.`}</p></div></div>`;
    bind(root);
    return;
  }
  // Écoutes du jour regroupées par session (une session peut avoir commencé la veille au soir).
  const [lo, hi] = indexRange(dayRange(day));
  const ses = [];
  const st0 = DB.sessionStart;
  for (let i = lo; i < hi; i++) {
    let a = 0, b = st0.length - 1;
    while (a < b) { const m = (a + b + 1) >> 1; if (st0[m] <= i) a = m; else b = m - 1; }
    if (!ses.length || ses[ses.length - 1].sid !== a) ses.push({ sid: a, lo: i, hi: i + 1, sec: 0, cont: st0[a] < lo });
    const cur = ses[ses.length - 1];
    cur.hi = i + 1; cur.sec += DB.S[i];
  }
  ses.forEach(s => { s.start = DB.T[s.lo] - DB.S[s.lo] / 60; s.end = DB.T[s.hi - 1]; });
  const hours = new Float64Array(24);
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) hours[h] += st.heat[d * 24 + h];
  const yearsAgo = new Date(DB.lastDay * 86400000).getUTCFullYear() - new Date(day * 86400000).getUTCFullYear();
  const hhmm = m => { const x = Math.floor(m) % 1440; return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; };

  root.innerHTML = `<div class="page">${head}
    <div class="kpis">
      ${kpi(dur(st.sec), loc`Temps d'écoute`)}
      ${kpi(fmt(st.streams), loc`Streams`)}
      ${kpi(fmt(st.nTracks), loc`Titres différents`)}
      ${kpi(fmt(st.nArtists), loc`Artistes`)}
      ${kpi(fmt(ses.length), loc`Sessions`)}
      ${kpi(yearsAgo > 0 ? loc`${yearsAgo} an${yearsAgo > 1 ? 's' : ''}` : loc`Cette année`, loc`Il y a`)}
    </div>
    ${section(loc`Au fil de la journée`, `<div class="chart chart-sm">${bars([...hours].map((v, h) => ({ v: v / 60, tick: h % 3 === 0 ? hourLabel(h) : '', tip: `${hourLabel(h)}<br><b>${dur(v)}</b>` })), { color: 'var(--butter)', height: 160, unit: 'min' })}</div>`, { eyebrow: loc`Minutes par heure` })}
    <div class="cols2">
      ${section(loc`Artistes`, rankList(ranking(st, 'artist', 'sec', 8), 'artist', 'sec'), { eyebrow: loc`Ce jour-là` })}
      ${section(loc`Titres`, rankList(ranking(st, 'track', 'plays', 8), 'track', 'plays', { fmtVal: e => `${fmt(e.plays)}×` }), { eyebrow: loc`Les plus lancés` })}
    </div>
    ${section(loc`Tout ce que tu as écouté`, ses.map((s, n) => `<div class="day-ses"><h3 class="sub-h">${loc`Session ${n + 1} · ${hhmm(s.start)} → ${hhmm(s.end)} · ${dur(s.sec)}${s.cont ? ` ${loc`· commencée la veille`}` : ''}`}</h3>
      <ol class="day-list">${Array.from({ length: s.hi - s.lo }, (_, j) => s.lo + j).map(i => {
        const re = DB.reasonsEnd[reasonEndOf(i)];
        return `<li class="${DB.S[i] < STREAM_SEC ? 'short' : ''}"><span class="num">${hhmm(DB.T[i] - DB.S[i] / 60)}</span>${link('track', DB.K[i])}<small>${esc(DB.artists[DB.trackArtist[DB.K[i]]])}</small><span class="num dl-d">${dur(DB.S[i])}${END_LABEL[re] ? ` · ${END_LABEL[re]}` : ''}</span></li>`;
      }).join('')}</ol></div>`).join(''), { eyebrow: loc`Écoutes dans l'ordre, groupées par session` })}
  </div>`;
  bind(root);
}

function bind(root) {
  const inp = root.querySelector('#dayPick');
  if (inp) inp.addEventListener('change', () => { if (inp.value) location.hash = '#/jour/' + inp.value; });
}
