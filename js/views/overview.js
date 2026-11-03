import { DB, ranking, discoveries, previousRange } from '../data.js';
import { esc, fmt, dur, pct, dateFr, kpi, delta, JOURS_LONG, eraLegend, link } from '../ui.js';
import { timeChart, heatmap, hourProfile, stackBar } from '../charts.js';
import { rankList, section, platformItems, bestSlot } from './common.js';
import { teaser } from './cejour.js';

export function render(root, ctx) {
  const { range, statsFor } = ctx;
  const st = statsFor(range, { eras: true });
  if (!st.plays) {
    root.innerHTML = `<div class="page"><div class="empty-page"><h1>Aucune écoute</h1><p>Tu n'as rien écouté sur cette période. Choisis-en une autre en haut de la page.</p></div></div>`;
    return;
  }
  const prevR = previousRange(range);
  const prev = prevR ? statsFor(prevR) : null;
  const span = range.to - range.from + 1;
  const isAll = range.from === DB.firstDay && range.to === DB.lastDay;

  const topA = ranking(st, 'artist', 'sec', 10);
  const topT = ranking(st, 'track', 'streams', 10);
  const topAl = ranking(st, 'album', 'sec', 10);
  const lead = topA[0];
  const leadShare = lead.sec / st.sec;
  const slot = bestSlot(st.heat);

  // Découvertes : sur tout l'historique, on regarde les 12 derniers mois.
  const discR = isAll ? { from: Math.max(DB.firstDay, DB.lastDay - 364), to: DB.lastDay } : range;
  const disc = discoveries(isAll ? statsFor(discR) : st).slice(0, 8);

  const hours = st.sec / 3600;
  const headline = hours >= 10 ? `${fmt(hours)}<span class="u">heures</span>` : `${fmt(st.sec / 60)}<span class="u">minutes</span>`;

  root.innerHTML = `<div class="page">
    <header class="hero">
      <div class="eyebrow">${esc(ctx.periodLabel)} · ${fmt(span)} jours</div>
      <h1 class="num">${headline}</h1>
      <p class="hero-p">Ton artiste n°1 sur cette période, c'est ${link('artist', lead.id, 'hlink')} avec <b>${dur(lead.sec)}</b>, soit ${pct(leadShare)} de ton écoute. Ton titre le plus joué : ${link('track', topT[0].id, 'hlink')} (${fmt(topT[0].streams)} streams).</p>
    </header>

    <div class="kpis">
      ${kpi(dur(st.sec), 'Temps d\'écoute', delta(st.sec, prev?.sec))}
      ${kpi(fmt(st.streams), 'Streams (30 s et plus)', delta(st.streams, prev?.streams))}
      ${kpi(fmt(st.nTracks), 'Titres différents', delta(st.nTracks, prev?.nTracks))}
      ${kpi(fmt(st.nArtists), 'Artistes différents', delta(st.nArtists, prev?.nArtists))}
      ${kpi(`${fmt(st.activeDays)}<small>/${fmt(span)}</small>`, 'Jours avec de la musique')}
      ${kpi(dur(st.sec / Math.max(1, st.activeDays)), 'Par jour actif, en moyenne')}
    </div>
    ${prev ? `<p class="note">Les pourcentages comparent avec les ${fmt(prevR.to - prevR.from + 1)} jours précédents (${dateFr(prevR.from, true)} → ${dateFr(prevR.to, true)}).</p>` : ''}

    ${DB.meta.format === 'simple' ? `<div class="alert"><b>Export simple.</b> Tu as importé l'export « Données du compte » : il ne couvre que la dernière année et ne contient ni albums, ni appareils, ni pays, ni boutons utilisés. Pour tout voir, demande l'« Historique de streaming étendu » sur spotify.com/account/privacy.</div>` : ''}
    ${isAll ? teaser() : ''}

    ${section('Ton écoute dans le temps', `<div class="chart">${timeChart(st, { eras: span > 400 })}</div>${span > 400 ? `<div class="legend">${eraLegend()}</div><p class="note">Chaque mois prend la couleur de l'artiste que tu as le plus écouté ce mois-là. Survole une barre pour le détail.</p>` : ''}`,
      { eyebrow: span > 400 ? 'Par mois' : span > 120 ? 'Par semaine' : 'Par jour' })}

    <div class="cols3">
      ${section('Artistes', rankList(topA, 'artist', 'sec'), { eyebrow: 'Top 10', right: '<a class="more" href="#/classements?type=artist">Tout voir</a>' })}
      ${section('Titres', rankList(topT, 'track', 'streams'), { eyebrow: 'Top 10', right: '<a class="more" href="#/classements?type=track&sort=streams">Tout voir</a>' })}
      ${section('Albums', rankList(topAl, 'album', 'sec'), { eyebrow: 'Top 10', right: '<a class="more" href="#/classements?type=album">Tout voir</a>' })}
    </div>

    ${section(`Ton créneau : le ${JOURS_LONG[slot.dow]} vers ${slot.hour} h`, `
      <div class="heat-wrap">${heatmap(st.heat)}</div>
      <div class="chart chart-sm">${hourProfile(st.heat)}</div>
      <p class="note">Temps cumulé, à l'heure locale de ton navigateur. ${pct(st.night / st.sec)} de ton écoute tombe entre minuit et 5 h.</p>`,
      { eyebrow: 'Quand tu écoutes' })}

    ${section('Tes habitudes', habits(st), { eyebrow: 'Comment tu écoutes' })}

    ${section(isAll ? 'Tes découvertes des 12 derniers mois' : 'Découvertes de la période', disc.length ? `<div class="disc">${disc.map(e => `
        <a class="disc-c" href="#/artiste/${e.id}"><span class="disc-n">${esc(DB.artists[e.id])}</span><span class="disc-m num">${dur(e.sec)}</span><span class="disc-d">1re écoute le ${dateFr(Math.floor(DB.global.artist.first[e.id] / 1440), true)}</span></a>`).join('')}</div>
        <p class="note">Artistes que tu n'avais jamais écoutés avant cette période, classés par temps d'écoute.</p>` : '<p class="empty">Aucun nouvel artiste sur cette période.</p>',
      { eyebrow: 'Nouveaux artistes' })}
  </div>`;
}

function habits(st) {
  const plat = platformItems(st);
  const best = st.bestDay;
  return `<div class="cards">
    <div class="card"><div class="eyebrow">Bouton Suivant</div><div class="big num">${pct(st.skips / st.plays)}</div><p>des titres lancés sont passés avec Suivant. ${pct(st.completes / st.plays)} sont écoutés jusqu'au bout.</p></div>
    <div class="card"><div class="eyebrow">Aléatoire</div><div class="big num">${pct(st.shuffle / st.plays)}</div><p>des écoutes se font en lecture aléatoire. ${pct(st.offline / st.plays)} hors ligne.</p></div>
    <div class="card"><div class="eyebrow">Record</div><div class="big num">${dur(best.sec)}</div><p>en une journée, le <b>${dateFr(best.day)}</b>.</p></div>
    <div class="card"><div class="eyebrow">Régularité</div><div class="big num">${fmt(st.streak.len)} j</div><p>d'affilée avec de la musique${st.streak.len > 1 ? `, du <b>${dateFr(st.streak.from, true)}</b> au <b>${dateFr(st.streak.to, true)}</b>` : ''}.</p></div>
    <div class="card card-wide"><div class="eyebrow">Appareils</div>${stackBar(plat)}
      <ul class="mini">${plat.map(p => `<li><span><i style="background:${p.c}"></i>${esc(p.label)}</span><span class="num">${dur(p.v)} · ${pct(p.v / st.sec)}</span></li>`).join('')}</ul></div>
  </div>`;
}
