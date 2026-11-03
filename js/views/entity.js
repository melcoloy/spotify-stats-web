import { DB, computeStats, ranking, byArtist, byAlbum, byTrack, globalRank, artistOf, transitions, artistTransitions, dayToIso } from '../data.js';
import { esc, fmt, dur, pct, dateFr, dateOfMinute, kpi, link, monthLabel, spotifyUrl, KIND_LABEL, JOURS_LONG, thumb, entityCell } from '../ui.js';
import { timeChart, heatmap } from '../charts.js';
import { rankList, section, table, bestSlot } from './common.js';

const KIND = { artiste: 'artist', album: 'album', titre: 'track' };

export function render(root, ctx) {
  const kind = KIND[ctx.parts[0]];
  const id = +ctx.parts[1];
  const names = kind === 'artist' ? DB.artists : kind === 'album' ? DB.albums : DB.tracks;
  if (!Number.isInteger(id) || id < 0 || id >= names.length) {
    root.innerHTML = `<div class="page"><div class="empty-page"><h1>Introuvable</h1><p>Cette page n'existe pas. <a href="#/explorer">Retour à l'explorateur</a></p></div></div>`;
    return;
  }
  const pred = kind === 'artist' ? byArtist(id) : kind === 'album' ? byAlbum(id) : byTrack(id);
  const range = ctx.range;
  const st = computeStats(range, pred);
  const all = kind === 'artist' ? DB.global.artist : kind === 'album' ? DB.global.album : DB.global.track;
  const periodTotal = ctx.statsFor(range).sec;
  const isAll = range.from === DB.firstDay && range.to === DB.lastDay;
  const artistId = artistOf(kind, id);
  const name = names[id];

  const sub = kind === 'artist'
    ? `${fmt(all.tracks[id])} titres écoutés au total`
    : `${link('artist', artistId)}${kind === 'track' ? ` · album ${link('album', DB.trackAlbum[id])}` : ''}`;
  const sp = kind === 'track' ? spotifyUrl(id) : null;

  const head = `<header class="ent-h">${thumb(kind, id, 'xl')}<div class="ent-h-t">
      <div class="eyebrow">${KIND_LABEL[kind]} · n°${fmt(globalRank(kind, id))} de tout ton historique</div>
      <h1>${esc(name)}</h1>
      <p class="ent-sub">${sub}</p>
      <div class="ent-actions">${sp ? `<a class="btn" href="${sp}" target="_blank" rel="noopener">Ouvrir dans Spotify</a>` : ''}
        ${!isAll ? `<button type="button" class="btn ghost" id="allTime">Voir tout l'historique</button>` : ''}
        <a class="btn ghost" href="#/comparer?mode=artistes&a=${artistId}">Comparer</a></div>
    </div></header>`;

  if (!st.plays) {
    root.innerHTML = `<div class="page">${head}<div class="empty-page"><p>Aucune écoute sur la période choisie (${esc(ctx.periodLabel)}). Dernière écoute : ${dateOfMinute(all.last[id], false)}.</p></div></div>`;
    bindAll(root, ctx);
    return;
  }

  // Premier titre écouté (pour un artiste ou un album) sur tout l'historique.
  let firstIdx = -1;
  if (kind !== 'track') {
    for (let i = 0; i < DB.n; i++) if (pred(i)) { firstIdx = i; break; }
  }
  let peak = null;
  for (const [m, s] of st.months) if (!peak || s > peak.s) peak = { m, s };
  const topDays = [...st.days].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const slot = bestSlot(st.heat);

  const kpis = `<div class="kpis">
    ${kpi(dur(st.sec), 'Temps d\'écoute')}
    ${kpi(fmt(st.streams), 'Streams (30 s et plus)')}
    ${kpi(pct(st.sec / periodTotal, 1), 'De ton écoute sur la période')}
    ${kpi(pct(st.skips / st.plays), 'Passés avec Suivant', `${pct(st.completes / st.plays)} jusqu'au bout`)}
    ${kpi(fmt(st.activeDays), 'Jours d\'écoute')}
    ${kpi(dateOfMinute(all.first[id]), 'Première écoute', dateOfMinute(all.last[id]) !== dateOfMinute(all.first[id]) ? `Dernière : ${dateOfMinute(all.last[id])}` : '')}
  </div>`;

  const story = [];
  if (firstIdx >= 0) story.push(`Tout a commencé le <b>${dateFr(Math.floor(DB.T[firstIdx] / 1440))}</b> avec ${link('track', DB.K[firstIdx])}.`);
  if (peak && st.months.size > 1) story.push(`Ton pic : <b>${monthLabel(peak.m)}</b>, avec ${dur(peak.s)} d'écoute.`);
  story.push(`Tu l'écoutes surtout le <b>${JOURS_LONG[slot.dow]}</b> vers <b>${slot.hour} h</b>.`);
  if (kind === 'track') {
    const artistTracks = ranking(DB.global, 'track', 'streams').filter(e => DB.trackArtist[e.id] === artistId);
    const pos = artistTracks.findIndex(e => e.id === id) + 1;
    if (pos && artistTracks.length > 1) story.push(`C'est ton titre n°${pos} de ${link('artist', artistId)}, sur ${artistTracks.length} écoutés.`);
  }

  let detail = '';
  if (kind === 'artist') {
    const tr = ranking(st, 'track', 'sec');
    const al = ranking(st, 'album', 'sec', 12);
    detail = `${section('Ses titres', table(tr.slice(0, 50), 'track', { cols: ['sec', 'streams', 'plays', 'skipRate', 'first', 'last'], sortKey: 'sec' }) + (tr.length > 50 ? `<p class="note">${tr.length - 50} autres titres non affichés.</p>` : ''), { eyebrow: `${tr.length} titres sur la période` })}
      ${section('Ses albums', rankList(al, 'album', 'sec'), { eyebrow: 'Par temps d\'écoute' })}
      ${chainArtists(id)}`;
  } else if (kind === 'album') {
    const tr = ranking(st, 'track', 'sec');
    detail = section('Titres de l\'album', table(tr, 'track', { cols: ['sec', 'streams', 'plays', 'skipRate', 'first', 'last'], sortKey: 'sec' }), { eyebrow: `${tr.length} titres écoutés` });
  } else {
    detail = chainTracks(id) + (sp ? section('Écouter', `<iframe class="embed" title="Lecteur Spotify : ${esc(name)}" src="https://open.spotify.com/embed/track/${DB.trackUri[id]}?theme=0" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe><p class="note">Lecteur officiel Spotify (nécessite une connexion internet). L'écoute compte dans ton historique.</p>`, { eyebrow: 'Lecteur' }) : '');
  }

  root.innerHTML = `<div class="page">
    ${head}
    ${kpis}
    <p class="ent-story">${story.join(' ')}</p>
    ${section('Dans le temps', `<div class="chart">${timeChart(st, { color: kind === 'track' ? 'var(--butter)' : 'var(--coral)' })}</div>`, { eyebrow: esc(ctx.periodLabel) })}
    <div class="cols2">
      ${section('Quand', `<div class="heat-wrap">${heatmap(st.heat)}</div>`, { eyebrow: 'Jour et heure' })}
      ${section('Tes plus grosses journées', `<ol class="days">${topDays.map(([d, s], i) => `<li><span class="rk num">${i + 1}</span><a href="#/jour/${dayToIso(d)}">${dateFr(d)}</a><span class="num">${dur(s)}</span></li>`).join('')}</ol>`, { eyebrow: 'Records' })}
    </div>
    ${detail}
  </div>`;
  bindAll(root, ctx);
}

function bindAll(root, ctx) {
  const b = root.querySelector('#allTime');
  if (b) b.addEventListener('click', () => ctx.setPeriod({ preset: 'all' }));
}

// Ce qui vient avant et après un titre dans tes sessions (chaîne de Markov).
function chainTracks(id) {
  const nx = transitions(id, 'next').slice(0, 6), pv = transitions(id, 'prev').slice(0, 6);
  if (!nx.length && !pv.length) return '';
  const tot = arr => arr.reduce((a, x) => a + x.n, 0);
  const list = arr => arr.length ? `<ol class="rank">${arr.map((x, i) => `<li><span class="rk num">${i + 1}</span>${entityCell('track', x.id)}<span class="rv num">${pct(x.p)}<small>${fmt(x.n)}×</small></span><span class="rb" style="--w:${(x.p / arr[0].p).toFixed(3)};--bar:var(--e-violet)"></span></li>`).join('')}</ol>` : '<p class="empty">Rien de notable.</p>';
  return `<div class="cols2">
    ${section('Juste après, tu lances…', list(nx), { eyebrow: `Sur ${fmt(tot(transitions(id, 'next')))} enchaînements`, right: `<a class="more" href="#/radio?seed=${id}">Lancer une radio depuis ce titre</a>` })}
    ${section('Juste avant, tu écoutais…', list(pv), { eyebrow: `Sur ${fmt(tot(transitions(id, 'prev')))} enchaînements` })}
  </div>`;
}
function chainArtists(id) {
  const nx = artistTransitions(id).slice(0, 8);
  if (!nx.length) return '';
  return section(`Après ${esc(DB.artists[id])}, tu passes souvent à…`, `<div class="chips">${nx.map(x => `<a class="chip" href="#/artiste/${x.id}">${esc(DB.artists[x.id])} <b class="num">${pct(x.p)}</b></a>`).join('')}</div>`, { eyebrow: 'Changements d\'artiste dans tes sessions' });
}
