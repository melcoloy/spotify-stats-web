import { DB, ranking, discoveries, previousRange } from '../data.js';
import { esc, fmt, dur, pct, dateFr, kpi, delta, JOURS_LONG, eraLegend, link, daysShort, hourLabel, clock } from '../ui.js';
import { timeChart, heatmap, hourProfile, stackBar } from '../charts.js';
import { rankList, section, platformItems, bestSlot } from './common.js';
import { teaser } from './cejour.js';
import { loc } from '../i18n.js';

export function render(root, ctx) {
  const { range, statsFor } = ctx;
  const st = statsFor(range, { eras: true });
  if (!st.plays) {
    root.innerHTML = `<div class="page"><div class="empty-page"><h1>${loc`Aucune écoute`}</h1><p>${loc`Tu n'as rien écouté sur cette période. Choisis-en une autre en haut de la page.`}</p></div></div>`;
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
  const headline = hours >= 10 ? `${fmt(hours)}<span class="u">${loc`heures`}</span>` : `${fmt(st.sec / 60)}<span class="u">${loc`minutes`}</span>`;

  root.innerHTML = `<div class="page">
    <header class="hero">
      <div class="eyebrow">${loc`${esc(ctx.periodLabel)} · ${fmt(span)} jours`}</div>
      <h1 class="num">${headline}</h1>
      <p class="hero-p">${loc`Ton artiste n°1 sur cette période, c'est ${link('artist', lead.id, 'hlink')} avec <b>${dur(lead.sec)}</b>, soit ${pct(leadShare)} de ton écoute. Ton titre le plus joué : ${link('track', topT[0].id, 'hlink')} (${fmt(topT[0].streams)} streams).`}</p>
    </header>

    <div class="kpis">
      ${kpi(dur(st.sec), loc`Temps d'écoute`, delta(st.sec, prev?.sec))}
      ${kpi(fmt(st.streams), loc`Streams (30 s et plus)`, delta(st.streams, prev?.streams))}
      ${kpi(fmt(st.nTracks), loc`Titres différents`, delta(st.nTracks, prev?.nTracks))}
      ${kpi(fmt(st.nArtists), loc`Artistes différents`, delta(st.nArtists, prev?.nArtists))}
      ${kpi(`${fmt(st.activeDays)}<small>/${fmt(span)}</small>`, loc`Jours avec de la musique`)}
      ${kpi(dur(st.sec / Math.max(1, st.activeDays)), loc`Par jour actif, en moyenne`)}
    </div>
    ${prev ? `<p class="note">${loc`Les pourcentages comparent avec les ${fmt(prevR.to - prevR.from + 1)} jours précédents (${dateFr(prevR.from, true)} → ${dateFr(prevR.to, true)}).`}</p>` : ''}

    ${anomalies()}
    ${DB.meta.format === 'simple' ? `<div class="alert">${loc`<b>Export simple.</b> Tu as importé l'export « Données du compte » : il ne couvre que la dernière année et ne contient ni albums, ni appareils, ni pays, ni boutons utilisés. Pour tout voir, demande l'« Historique de streaming étendu » sur spotify.com/account/privacy.`}</div>` : ''}
    ${isAll ? teaser() : ''}

    ${section(loc`Ton écoute dans le temps`, `<div class="chart">${timeChart(st, { eras: span > 400 })}</div>${span > 400 ? `<div class="legend">${eraLegend()}</div><p class="note">${loc`Chaque mois prend la couleur de l'artiste que tu as le plus écouté ce mois-là. Survole une barre pour le détail.`}</p>` : ''}`,
      { eyebrow: span > 400 ? loc`Par mois` : span > 120 ? loc`Par semaine` : loc`Par jour` })}

    <div class="cols3">
      ${section(loc`Artistes`, rankList(topA, 'artist', 'sec'), { eyebrow: loc`Top 10`, right: `<a class="more" href="#/classements?type=artist">${loc`Tout voir`}</a>` })}
      ${section(loc`Titres`, rankList(topT, 'track', 'streams'), { eyebrow: loc`Top 10`, right: `<a class="more" href="#/classements?type=track&sort=streams">${loc`Tout voir`}</a>` })}
      ${section(loc`Albums`, rankList(topAl, 'album', 'sec'), { eyebrow: loc`Top 10`, right: `<a class="more" href="#/classements?type=album">${loc`Tout voir`}</a>` })}
    </div>

    ${section(loc`Ton créneau : le ${JOURS_LONG[slot.dow]} vers ${hourLabel(slot.hour)}`, `
      <div class="heat-wrap">${heatmap(st.heat)}</div>
      <div class="chart chart-sm">${hourProfile(st.heat)}</div>
      <p class="note">${loc`Temps cumulé, à l'heure locale de ton navigateur. ${pct(st.night / st.sec)} de ton écoute tombe entre minuit et 5 h.`}</p>`,
      { eyebrow: loc`Quand tu écoutes` })}

    ${section(loc`Tes habitudes`, habits(st), { eyebrow: loc`Comment tu écoutes` })}

    ${section(isAll ? loc`Tes découvertes des 12 derniers mois` : loc`Découvertes de la période`, disc.length ? `<div class="disc">${disc.map(e => `
        <a class="disc-c" href="#/artiste/${e.id}"><span class="disc-n">${esc(DB.artists[e.id])}</span><span class="disc-m num">${dur(e.sec)}</span><span class="disc-d">${loc`1re écoute le ${dateFr(Math.floor(DB.global.artist.first[e.id] / 1440), true)}`}</span></a>`).join('')}</div>
        <p class="note">${loc`Artistes que tu n'avais jamais écoutés avant cette période, classés par temps d'écoute.`}</p>` : `<p class="empty">${loc`Aucun nouvel artiste sur cette période.`}</p>`,
      { eyebrow: loc`Nouveaux artistes` })}
  </div>`;
}

function habits(st) {
  const plat = platformItems(st);
  const best = st.bestDay;
  return `<div class="cards">
    <div class="card"><div class="eyebrow">${loc`Bouton Suivant`}</div><div class="big num">${pct(st.skips / st.plays)}</div><p>${loc`des titres lancés sont passés avec Suivant. ${pct(st.completes / st.plays)} sont écoutés jusqu'au bout.`}</p></div>
    <div class="card"><div class="eyebrow">${loc`Aléatoire`}</div><div class="big num">${pct(st.shuffle / st.plays)}</div><p>${loc`des écoutes se font en lecture aléatoire. ${pct(st.offline / st.plays)} hors ligne.`}</p></div>
    <div class="card"><div class="eyebrow">${loc`Record`}</div><div class="big num">${dur(best.sec)}</div><p>${loc`en une journée, le <b>${dateFr(best.day)}</b>.`}</p></div>
    <div class="card"><div class="eyebrow">${loc`Régularité`}</div><div class="big num">${daysShort(st.streak.len)}</div><p>${loc`d'affilée avec de la musique${st.streak.len > 1 ? loc`, du <b>${dateFr(st.streak.from, true)}</b> au <b>${dateFr(st.streak.to, true)}</b>` : ''}.`}</p></div>
    <div class="card card-wide"><div class="eyebrow">${loc`Appareils`}</div>${stackBar(plat)}
      <ul class="mini">${plat.map(p => `<li><span><i style="background:${p.c}"></i>${esc(p.label)}</span><span class="num">${dur(p.v)} · ${pct(p.v / st.sec)}</span></li>`).join('')}</ul></div>
  </div>`;
}

// Écoutes simultanées depuis plusieurs pays : signe d'un compte partagé ou piraté.
function anomalies() {
  const list = DB.meta.anomalies || [];
  const ex = DB.meta.exclusions || [];
  const when = m => { const d = Math.floor(m / 1440), x = m % 1440; return `${dateFr(d, true)} ${clock(x)}`; };
  let html = '';
  if (list.length) {
    html += `<div class="alert">${loc`<b>Écoutes suspectes repérées.</b> Des titres ont été écoutés au même moment depuis des pays différents, ce qui arrive quand quelqu'un d'autre utilise ton compte.`}
      <ul class="anom">${list.map((a, i) => `<li><span>${loc`${when(a.from)} → ${when(a.to)} · ${fmt(a.plays)} écoutes depuis ${esc(a.countries.filter(c => c !== a.home).join(', ') || a.countries.join(', '))}`}</span><button type="button" class="btn small" data-anom="${i}">${loc`Retirer ces écoutes`}</button></li>`).join('')}</ul>
      <p class="note">${loc`Seules les écoutes venant d'un autre pays que ${esc(list[0].home)} sur cette plage sont retirées. Si ce n'était pas toi, pense aussi à changer ton mot de passe Spotify et à te déconnecter de partout.`}</p></div>`;
  }
  if (ex.length) html += `<p class="note">${loc`${fmt(DB.meta.excluded)} écoutes suspectes retirées de tes stats. Pour les remettre, réimporte ton export avec « Changer de données ».`}</p>`;
  return html;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-anom]');
  if (b) { b.disabled = true; b.textContent = loc`Retrait…`; window.dispatchEvent(new CustomEvent('exclude-window', { detail: +b.dataset.anom })); }
});
