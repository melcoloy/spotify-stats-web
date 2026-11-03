import { DB, podcastStats } from '../data.js';
import { esc, fmt, dur, pct, kpi, dateOfMinute, monthLabel } from '../ui.js';
import { bars } from '../charts.js';
import { section } from './common.js';

export function render(root, ctx) {
  const P = DB.podcasts;
  const ps = podcastStats(ctx.range);
  if (!ps.plays) {
    root.innerHTML = `<div class="page"><header class="page-h"><div class="eyebrow">${esc(ctx.periodLabel)}</div><h1>Podcasts</h1></header><div class="empty-page"><p>Aucun podcast écouté sur cette période.</p></div></div>`;
    return;
  }
  const shows = [...ps.showSec.keys()].filter(i => ps.showSec[i] > 0).sort((a, b) => ps.showSec[b] - ps.showSec[a]);
  const eps = [...ps.epSec.keys()].filter(i => ps.epSec[i] > 0).sort((a, b) => ps.epSec[b] - ps.epSec[a]).slice(0, 15);
  const music = ctx.statsFor(ctx.range).sec;
  const mk = [...ps.months.keys()].sort((a, b) => a - b);
  const bins = [];
  for (let m = mk[0]; m <= mk[mk.length - 1]; m++) {
    const s = ps.months.get(m) || 0;
    bins.push({ v: s / 3600, tick: m % 12 === 0 || m === mk[0] ? String(Math.floor(m / 12)) : '', tip: `${monthLabel(m)}<br><b>${dur(s)}</b>` });
  }
  const epUrl = e => P.episodes[e][2] ? `https://open.spotify.com/episode/${P.episodes[e][2]}` : null;

  root.innerHTML = `<div class="page">
    <header class="page-h"><div class="eyebrow">${esc(ctx.periodLabel)}</div><h1>Podcasts</h1>
      <p class="lede">Tes émissions et épisodes, audio et vidéo. Ils sont comptés à part : ils n'entrent dans aucune autre statistique du site.</p></header>
    <div class="kpis">
      ${kpi(dur(ps.sec), 'Temps de podcast')}
      ${kpi(fmt(shows.length), 'Émissions')}
      ${kpi(fmt(ps.epSec.filter(x => x > 0).length), 'Épisodes')}
      ${kpi(pct(ps.videoSec / ps.sec), 'En vidéo')}
      ${kpi(pct(ps.sec / (ps.sec + music), 1), 'De ton temps Spotify')}
    </div>
    ${section('Dans le temps', `<div class="chart">${bars(bins, { color: 'var(--e-sky)', height: 200, unit: 'h' })}</div>`, { eyebrow: 'Par mois' })}
    <div class="cols2 cols-wide">
      ${section('Émissions', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Émission</th><th class="n">Temps</th><th class="n">Écoutes</th><th>Première</th><th>Dernière</th></tr></thead><tbody>
        ${shows.map((s, i) => `<tr><td class="c-rk num">${i + 1}</td><td><b>${esc(P.shows[s])}</b></td><td class="n num">${dur(ps.showSec[s])}</td><td class="n num">${fmt(ps.showPlays[s])}</td><td class="num">${dateOfMinute(ps.showFirst[s])}</td><td class="num">${dateOfMinute(ps.showLast[s])}</td></tr>`).join('')}
      </tbody></table></div>`, { eyebrow: 'Par temps d\'écoute' })}
      ${section('Épisodes les plus écoutés', `<ol class="rank">${eps.map((e, i) => `<li><span class="rk num">${i + 1}</span><span class="ent">${epUrl(e) ? `<a class="ent-name" href="${epUrl(e)}" target="_blank" rel="noopener">${esc(P.episodes[e][0])}</a>` : `<span class="ent-name">${esc(P.episodes[e][0])}</span>`}<small>${esc(P.shows[P.episodes[e][1]])}</small></span><span class="rv num">${dur(ps.epSec[e])}</span></li>`).join('')}</ol>`, { eyebrow: 'Top 15' })}
    </div>
  </div>`;
}
