import { DB, sessionsIn, ranking } from '../data.js';
import { esc, fmt, dur, pct, kpi, dateFr, link, entityCell, JOURS_LONG, hourLabel, clock } from '../ui.js';
import { bars, stackBar } from '../charts.js';
import { section, rankList } from './common.js';
import { loc } from '../i18n.js';

const START_GROUPS = [
  [loc`Enchaînement automatique`, ['trackdone'], 'var(--e-violet)'],
  [loc`Clic sur le titre`, ['clickrow'], 'var(--butter)'],
  [loc`Bouton Suivant`, ['fwdbtn'], 'var(--coral)'],
  [loc`Bouton Lecture`, ['playbtn'], 'var(--e-mint)'],
  [loc`Bouton Précédent`, ['backbtn'], 'var(--e-sky)'],
  [loc`Depuis un autre appareil`, ['remote', 'reconnect'], 'var(--e-pink)'],
  [loc`Ouverture de l'appli`, ['appload'], 'var(--dim)'],
  [loc`Autre`, ['trackerror', 'switched-to-audio', 'endplay', 'unknown'], 'var(--e-other)'],
];
const END_GROUPS = [
  [loc`Titre fini`, ['trackdone'], 'var(--e-mint)'],
  [loc`Bouton Suivant`, ['fwdbtn'], 'var(--coral)'],
  [loc`Arrêt ou autre choix`, ['endplay'], 'var(--butter)'],
  [loc`Bouton Précédent`, ['backbtn'], 'var(--e-sky)'],
  [loc`Appli fermée`, ['logout', 'unexpected-exit', 'unexpected-exit-while-paused'], 'var(--e-violet)'],
  [loc`Autre appareil`, ['remote'], 'var(--e-pink)'],
  [loc`Autre`, ['trackerror', 'switched-to-video', 'unknown'], 'var(--e-other)'],
];
const BUCKETS = [[0, 5, '< 5 min'], [5, 15, '5–15 min'], [15, 30, '15–30 min'], [30, 60, loc`30 min – 1 h`], [60, 120, loc`1–2 h`], [120, 240, loc`2–4 h`], [240, 1e9, loc`4 h et plus`]];

export function render(root, ctx) {
  const st = ctx.statsFor(ctx.range);
  const ses = sessionsIn(ctx.range).filter(s => s.sec >= 30);
  if (!ses.length) {
    root.innerHTML = `<div class="page"><div class="empty-page"><h1>${loc`Aucune session`}</h1><p>${loc`Rien sur cette période.`}</p></div></div>`;
    return;
  }
  const lens = ses.map(s => (s.end - s.start)).sort((a, b) => a - b);
  const median = lens[Math.floor(lens.length / 2)];
  const totalMin = lens.reduce((a, b) => a + b, 0);
  const longest = ses.slice().sort((a, b) => (b.end - b.start) - (a.end - a.start)).slice(0, 12);

  // Démarrages de session : premier titre de chaque session.
  const startT = new Map(), startA = new Map(), startHour = new Float64Array(24), startDow = new Float64Array(7);
  for (const s of ses) {
    const k = DB.K[s.lo], a = DB.trackArtist[k];
    startT.set(k, (startT.get(k) || 0) + 1);
    startA.set(a, (startA.get(a) || 0) + 1);
    const m = Math.floor(s.start);
    startHour[Math.floor((m % 1440) / 60)]++;
    startDow[(Math.floor(m / 1440) + 3) % 7]++;
  }
  const topStartT = [...startT].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topStartA = [...startA].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const bucket = BUCKETS.map(([a, b, label]) => {
    const inB = ses.filter(s => { const l = s.end - s.start; return l >= a && l < b; });
    return { label, n: inB.length, sec: inB.reduce((x, s) => x + s.sec, 0) };
  });

  const group = (counts, table, groups) => groups.map(([label, keys, c]) => ({
    label, c, v: keys.reduce((x, k) => x + (table.indexOf(k) >= 0 ? counts[table.indexOf(k)] : 0), 0),
  })).filter(x => x.v > 0);
  const starts = group(st.rStart, DB.reasonsStart, START_GROUPS);
  const ends = group(st.rEnd, DB.reasonsEnd, END_GROUPS);

  const tr = ranking(st, 'track', 'plays').filter(e => e.plays >= 20);
  const loyal = tr.slice().sort((a, b) => b.doneRate - a.doneRate || b.plays - a.plays).slice(0, 10);
  const skipped = tr.slice().sort((a, b) => b.skipRate - a.skipRate || b.plays - a.plays).slice(0, 10);
  const chosen = ranking(st, 'track', 'chosen', 10);

  root.innerHTML = `<div class="page">
    <header class="page-h"><div class="eyebrow">${esc(ctx.periodLabel)}</div><h1>${loc`Tes sessions`}</h1>
      <p class="lede">${loc`Une session regroupe les écoutes séparées de moins de 30 minutes de silence. On regarde aussi comment tes titres démarrent et s'arrêtent, à partir des boutons que tu as vraiment utilisés.`}</p></header>
    <div class="kpis">
      ${kpi(fmt(ses.length), loc`Sessions`)}
      ${kpi(dur(totalMin * 60 / ses.length), loc`Durée moyenne`)}
      ${kpi(dur(median * 60), loc`Durée médiane`)}
      ${kpi(dur((longest[0].end - longest[0].start) * 60), loc`Plus longue session`, dateFr(Math.floor(longest[0].start / 1440), true))}
      ${kpi(fmt(st.plays / ses.length, 1), loc`Titres par session`)}
      ${kpi(fmt(ses.length / Math.max(1, st.activeDays), 1), loc`Sessions par jour actif`)}
    </div>

    <div class="cols2">
      ${section(loc`Durée des sessions`, `<div class="chart">${bars(bucket.map(b => ({ v: b.n, tick: b.label, tip: loc`${b.label}<br><b>${fmt(b.n)} sessions</b><br>${dur(b.sec)} d'écoute au total` })), { color: 'var(--butter)', height: 220, yFmt: v => fmt(v) })}</div>
        <p class="note">${loc`Les sessions de plus d'une heure représentent ${pct(bucket.slice(4).reduce((x, b) => x + b.sec, 0) / st.sec)} de ton temps d'écoute.`}</p>`, { eyebrow: loc`Nombre de sessions` })}
      ${section(loc`Quand tu lances la musique`, `<div class="chart">${bars([...startHour].map((v, h) => ({ v, tick: h % 3 === 0 ? hourLabel(h) : '', tip: loc`${hourLabel(h)}<br><b>${fmt(v)} sessions</b>` })), { color: 'var(--coral)', height: 220, yFmt: v => fmt(v) })}</div>
        <p class="note">${loc`Le jour où tu démarres le plus de sessions : le ${JOURS_LONG[startDow.indexOf(Math.max(...startDow))]}.`}</p>`, { eyebrow: loc`Début des sessions, par heure` })}
    </div>

    ${section(loc`Comment tes titres démarrent et s'arrêtent`, `
      <h3 class="sub-h">${loc`Démarrage`}</h3>${stackBar(starts)}${legendList(starts, st.plays)}
      <h3 class="sub-h">${loc`Fin`}</h3>${stackBar(ends)}${legendList(ends, st.plays)}
      <p class="note">${loc`« Arrêt ou autre choix » : tu as mis pause, choisi un autre titre ou une autre playlist.`}</p>`, { eyebrow: loc`Boutons et clics` })}

    <div class="cols3">
      ${section(loc`Lancés exprès`, rankList(chosen, 'track', 'chosen', { fmtVal: e => fmt(e.chosen) + '×' }), { eyebrow: loc`Tu cliques dessus` })}
      ${section(loc`Toujours jusqu'au bout`, rankList(loyal, 'track', 'doneRate', { fmtVal: e => pct(e.doneRate), max: 1 }), { eyebrow: loc`20 lancements et plus` })}
      ${section(loc`Toujours passés`, rankList(skipped, 'track', 'skipRate', { fmtVal: e => pct(e.skipRate), max: 1 }), { eyebrow: loc`20 lancements et plus` })}
    </div>

    <div class="cols2">
      ${section(loc`Tes titres de démarrage`, `<ol class="rank">${topStartT.map(([k, n], i) => `<li><span class="rk num">${i + 1}</span>${entityCell('track', k)}<span class="rv num">${fmt(n)}×</span></li>`).join('')}</ol>`, { eyebrow: loc`Premier titre de la session` })}
      ${section(loc`Tes artistes de démarrage`, `<ol class="rank">${topStartA.map(([a, n], i) => `<li><span class="rk num">${i + 1}</span>${entityCell('artist', a)}<span class="rv num">${fmt(n)}×</span></li>`).join('')}</ol>`, { eyebrow: loc`Premier artiste de la session` })}
    </div>

    ${section(loc`Tes plus longues sessions`, `<div class="sessions">${longest.map(s => sessionCard(s)).join('')}</div>`, { eyebrow: loc`Clique pour voir la liste des titres` })}
  </div>`;
}

function legendList(items, total) {
  return `<ul class="mini">${items.map(x => `<li><span><i style="background:${x.c}"></i>${esc(x.label)}</span><span class="num">${pct(x.v / total)}</span></li>`).join('')}</ul>`;
}

function sessionCard(s) {
  const day = Math.floor(s.start / 1440);
  const hh = m => clock(m);
  const byA = new Map();
  for (let i = s.lo; i < s.hi; i++) { const a = DB.trackArtist[DB.K[i]]; byA.set(a, (byA.get(a) || 0) + DB.S[i]); }
  const topA = [...byA].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const items = [];
  for (let i = s.lo; i < s.hi && items.length < 400; i++) items.push(`<li><span class="num">${hh(DB.T[i] - DB.S[i] / 60)}</span>${link('track', DB.K[i])}<small>${esc(DB.artists[DB.trackArtist[DB.K[i]]])}</small></li>`);
  return `<details class="ses"><summary><span class="ses-d">${dateFr(day)}</span><span class="ses-l num">${dur((s.end - s.start) * 60)}</span><span class="ses-m">${loc`${fmt(s.plays)} titres · de ${hh(s.start)} à ${hh(s.end)}`}</span><span class="ses-a">${topA.map(([a]) => esc(DB.artists[a])).join(', ')}</span></summary><ol class="ses-list">${items.join('')}</ol></details>`;
}
