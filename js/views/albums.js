import { DB, albumRuns, ranking } from '../data.js';
import { esc, fmt, dur, pct, kpi, dateOfMinute, link, thumb, entityCell } from '../ui.js';
import { section } from './common.js';
import { loc } from '../i18n.js';

export function render(root, ctx) {
  const { range } = ctx;
  const st = ctx.statsFor(range);
  const { runs, known } = albumRuns();
  const a = range.from * 1440, b = (range.to + 1) * 1440;
  const inRange = runs.filter(r => r.start >= a && r.start < b);
  const byAlbum = new Map();
  for (const r of inRange) {
    let x = byAlbum.get(r.album);
    if (!x) byAlbum.set(r.album, x = { album: r.album, n: 0, last: 0, first: Infinity, best: 0 });
    x.n++; x.last = Math.max(x.last, r.start); x.first = Math.min(x.first, r.start); x.best = Math.max(x.best, r.tracks);
  }
  const full = [...byAlbum.values()].sort((x, y) => y.n - x.n || st.album.sec[y.album] - st.album.sec[x.album]);

  // Albums « à un titre » : un seul morceau fait l'essentiel de l'écoute de l'album.
  const albums = ranking(st, 'album', 'sec').filter(e => known[e.id] >= 6);
  const topTrackSec = new Float64Array(DB.albums.length), topTrack = new Int32Array(DB.albums.length).fill(-1);
  const tsec = st.track.sec;
  for (let k = 0; k < tsec.length; k++) {
    if (!tsec[k]) continue;
    const al = DB.trackAlbum[k];
    if (tsec[k] > topTrackSec[al]) { topTrackSec[al] = tsec[k]; topTrack[al] = k; }
  }
  const single = albums.filter(e => topTrackSec[e.id] / e.sec >= 0.6 && e.sec >= 3600).slice(0, 12);
  const explored = albums.filter(e => e.tracks >= 6).sort((x, y) => (y.tracks / known[y.id]) - (x.tracks / known[x.id]) || y.sec - x.sec);
  const balanced = albums.filter(e => e.sec >= 3 * 3600).map(e => ({ ...e, share: topTrackSec[e.id] / e.sec })).sort((x, y) => x.share - y.share).slice(0, 12);

  root.innerHTML = `<div class="page">
    <header class="page-h"><div class="eyebrow">${esc(ctx.periodLabel)}</div><h1>${loc`Albums en entier`}</h1>
      <p class="lede">${loc`Une écoute intégrale, c'est au moins 5 titres différents d'un même album enchaînés dans une session, et au moins 70 % des titres de cet album que tu connais. On voit aussi les albums dont tu ne retiens qu'un morceau.`}</p></header>
    <div class="kpis">
      ${kpi(fmt(inRange.length), loc`Écoutes intégrales`)}
      ${kpi(fmt(full.length), loc`Albums écoutés d'une traite`)}
      ${kpi(full[0] ? `${full[0].n}×` : '—', loc`Record`, full[0] ? esc(DB.albums[full[0].album]) : '')}
      ${kpi(pct(full.length / Math.max(1, albums.length)), loc`Des albums de 6 titres et plus`)}
    </div>
    ${section(loc`Écoutés d'une traite`, full.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="c-rk">#</th><th>${loc`Album`}</th><th class="n">${loc`Écoutes intégrales`}</th><th class="n">${loc`Titres connus`}</th><th class="n">${loc`Temps total`}</th><th>${loc`Première`}</th><th>${loc`Dernière`}</th></tr></thead><tbody>
      ${full.slice(0, 40).map((x, i) => `<tr><td class="c-rk num">${i + 1}</td><td>${entityCell('album', x.album)}</td><td class="n num"><b>${fmt(x.n)}</b></td><td class="n num">${fmt(known[x.album])}</td><td class="n num">${dur(st.album.sec[x.album])}</td><td class="num">${dateOfMinute(x.first)}</td><td class="num">${dateOfMinute(x.last)}</td></tr>`).join('')}
      </tbody></table></div>` : `<p class="empty">${loc`Aucune écoute intégrale sur cette période.`}</p>`, { eyebrow: loc`Classés par nombre d'écoutes intégrales` })}
    <div class="cols2">
      ${section(loc`Albums à un seul titre`, single.length ? `<ol class="rank">${single.map((e, i) => `<li><span class="rk num">${i + 1}</span>${entityCell('album', e.id)}<span class="rv num">${pct(topTrackSec[e.id] / e.sec)}<small>${esc(DB.tracks[topTrack[e.id]])}</small></span></li>`).join('')}</ol>` : `<p class="empty">${loc`Aucun.`}</p>`, { eyebrow: loc`Un morceau fait 60 % et plus du temps` })}
      ${section(loc`Albums écoutés de façon équilibrée`, `<ol class="rank">${balanced.map((e, i) => `<li><span class="rk num">${i + 1}</span>${entityCell('album', e.id)}<span class="rv num">${loc`${fmt(e.tracks)} titres<small>n°1 = ${pct(e.share)} du temps</small>`}</span></li>`).join('')}</ol>`, { eyebrow: loc`Aucun titre ne domine` })}
    </div>
    ${section(loc`Les plus explorés`, `<div class="obs">${explored.slice(0, 9).map(e => `<article class="obs-c"><div class="obs-h">${thumb('album', e.id, 'md')}<div class="ent">${link('album', e.id, 'ent-name')}<small>${link('artist', DB.albumArtist[e.id])}</small></div></div>
      <p class="obs-m">${loc`<b class="num">${fmt(e.tracks)}</b> titres écoutés sur la période, ${dur(e.sec)}`}</p></article>`).join('')}</div>`, { eyebrow: loc`Le plus de titres différents écoutés` })}
  </div>`;
}
