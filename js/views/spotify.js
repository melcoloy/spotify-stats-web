// Page « Ce que Spotify sait » : tout ce que l'export « Données du compte » révèle,
// confronté à ce que l'historique d'écoute montre réellement.
import { DB, computeStats, ranking, discoveries, isoToDay, dayToIso } from '../data.js';
import { esc, fmt, dur, pct, kpi, dateFr, link, entityCell, MOIS } from '../ui.js';
import { bars } from '../charts.js';
import { section } from './common.js';

const MONTHS_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const REASONS = {
  BIGGEST_MUSIC_LISTENING_DAY: 'Ta plus grosse journée', MOST_DIVERSE_DAY: 'Ta journée la plus variée', REPEAT_HEAVY_DAY: 'Ta journée en boucle',
  MOST_ENERGETIC_DAY: 'Ta journée la plus énergique', BIGGEST_TOP_GENRE_DAY: 'Ta journée la plus « genre n°1 »', BIGGEST_DISCOVERY_DAY: 'Ta journée découvertes',
};
const SEGMENTS = { 'Super Listeners': 'Super auditeur', 'Moderate listeners': 'Auditeur régulier', 'Light listeners': 'Auditeur occasionnel', 'Previously Active Listeners': 'Ancien auditeur' };
const title = s => (s || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const md = s => esc(s || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

// Index pour retrouver un titre ou un artiste de l'historique à partir de l'export de compte.
let idx = null;
function index() {
  if (idx) return idx;
  const byUri = new Map(), byKey = new Map(), artistByName = new Map();
  DB.trackUri.forEach((u, k) => { if (u) byUri.set(u, k); });
  DB.tracks.forEach((n, k) => byKey.set(`${n.toLowerCase()}|${DB.artists[DB.trackArtist[k]].toLowerCase()}`, k));
  DB.artists.forEach((n, a) => artistByName.set(n.toLowerCase(), a));
  return (idx = { byUri, byKey, artistByName });
}
const trackOf = (name, artist, uri) => { const i = index(); return i.byUri.get(uri) ?? i.byKey.get(`${(name || '').toLowerCase()}|${(artist || '').toLowerCase()}`); };
const artistByName = n => index().artistByName.get((n || '').toLowerCase());
function artistLabel(id) {
  const name = DB.account.artistNames?.[id];
  const a = name != null ? artistByName(name) : undefined;
  if (a !== undefined) return link('artist', a);
  if (name) return esc(name);
  return `<a href="https://open.spotify.com/artist/${esc(id)}" target="_blank" rel="noopener" data-artist-id="${esc(id)}">artiste Spotify</a>`;
}

export function render(root, ctx) {
  const A = DB.account;
  if (!A) {
    root.innerHTML = `<div class="page"><header class="page-h"><div class="eyebrow">Ce que Spotify sait</div><h1>Ce que Spotify sait de toi</h1></header>
      <div class="card"><p>Cette page utilise l'export <b>« Données du compte »</b>, un deuxième export que Spotify propose sur la même page que l'historique étendu (spotify.com/account/privacy). Il contient ton Wrapped officiel, le portrait de tes goûts rédigé par Spotify, les catégories publicitaires dans lesquelles il te classe, tes recherches et tes playlists.</p>
      <p>${DB.meta?.demo ? 'Les données d\'exemple n\'en contiennent pas.' : 'Dépose-le avec ton historique étendu (les deux zips en même temps) pour voir cette page.'}</p></div></div>`;
    return;
  }
  const parts = [wrappedSection(A), tasteSection(A), adsSection(A), searchSection(A), playlistSection(A)].filter(Boolean);
  root.innerHTML = `<div class="page">
    <header class="page-h"><div class="eyebrow">Export « Données du compte »</div><h1>Ce que Spotify sait de toi</h1>
      <p class="lede">Ton Wrapped officiel comparé à nos calculs, le portrait que Spotify dresse de tes goûts, les catégories publicitaires dans lesquelles il te range, tes recherches et tes playlists.</p></header>
    ${parts.join('')}
  </div>`;
  resolveUnknownArtists(root);
}

// ---------- Wrapped officiel ----------
function wrappedSection(A) {
  const w = A.wrapped;
  if (!w) return '';
  const from = isoToDay(`${w.year}-01-01`), to = Math.min(DB.lastDay, isoToDay(`${w.year}-11-15`));
  if (from > DB.lastDay) return '';
  const st = computeStats({ from: Math.max(from, DB.firstDay), to });
  const ours = ranking(st, 'artist', 'sec');
  const ourTop = ours[0];
  const rows = [
    ['Minutes d\'écoute', w.minutes, st.sec / 60, v => fmt(v)],
    ['Jours avec de la musique', w.days, st.activeDays, v => fmt(v)],
    ['Artistes différents', w.artists, st.nArtists, v => fmt(v)],
    ['Artistes découverts', w.discovered, discoveries(st).length, v => fmt(v)],
    ['Plus longue série de jours', w.streak, st.streak.len, v => fmt(v) + ' j'],
    ['Part de l\'artiste n°1', w.topArtistShare, ourTop ? 100 * ourTop.sec / st.sec : null, v => fmt(v, 1) + ' %'],
    ['Titres coupés avant 30 s', w.skips, st.plays ? 100 * (st.plays - st.streams) / st.plays : null, v => fmt(v, 1) + ' %'],
  ].filter(r => r[1] != null);
  const officialTracks = w.topTracks.slice(0, 5).map(t => ({ ...t, k: index().byUri.get(t.id) }));
  const topArtistName = w.topArtists[0] ? artistLabel(w.topArtists[0]) : 'ton artiste n°1';
  const moods = w.moods || {};
  const race = w.race.length ? `<div class="tbl-wrap"><table class="tbl race-tbl"><thead><tr><th>Artiste</th>${(w.race[0].ranks || []).map(([m]) => `<th class="n">${MOIS[MONTHS_EN.indexOf(m)] || esc(m)}</th>`).join('')}</tr></thead><tbody>
    ${w.race.map(r => `<tr><td>${artistLabel(r.id)}</td>${r.ranks.map(([, k]) => `<td class="n"><span class="rk-pill r${k}">${k}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  const days = (w.highlights || []).map(d => {
    const day = isoToDay(d.date), sec = DB.global.days.get(day) || 0;
    return `<li><a class="wd-date" href="#/jour/${d.date}">${dateFr(day)}</a><b>${esc(REASONS[d.reason] || title(d.reason))}</b><span class="wd-t">« ${esc(d.title)} »</span><small>${esc(d.description || '')}</small><span class="num wd-h">${sec ? dur(sec) + ' selon ton historique' : ''}</span></li>`;
  }).join('');
  return section(`Ton Wrapped ${w.year}, le vrai`, `
    <div class="cols2">
      <div><h3 class="sub-h">Spotify contre nos calculs</h3>
        <div class="tbl-wrap"><table class="tbl cmp-tbl"><thead><tr><th></th><th class="n">Spotify</th><th class="n">Ce site</th></tr></thead><tbody>
        ${rows.map(([l, a, b, f]) => `<tr><td>${l}</td><td class="n num">${f(a)}</td><td class="n num">${b == null ? '—' : f(b)}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="note">Calcul du site du 1er janvier au 15 novembre ${w.year}, période approximative du Wrapped. Les petits écarts viennent de la date d'arrêt exacte de Spotify et de la façon de compter les clips.</p></div>
      <div><h3 class="sub-h">Ce que seul Spotify peut calculer</h3>
        <div class="kpis kpis-2">
          ${w.topFanPct != null ? kpi(`top ${fmt(100 * w.topFanPct, w.topFanPct < 0.001 ? 2 : 1)} %`, `des fans de ${topArtistName}`) : ''}
          ${w.listeningAge ? kpi(`${w.listeningAge} ans`, 'Ton âge musical', w.ageWindow ? `goûts ancrés vers la ${w.agePhase === 'late' ? 'fin' : w.agePhase === 'early' ? 'début' : 'milieu'} des années ${w.ageWindow}` : '') : ''}
          ${w.club ? kpi(esc(title(w.club.name)), 'Ton club', `${esc(title(w.club.role))} · ${pct(w.club.pct)} des auditeurs`) : ''}
          ${w.night != null ? kpi(pct(w.night / 100), 'Écoute la nuit') : ''}
          ${w.explicit != null ? kpi(pct(w.explicit / 100), 'Titres explicites') : ''}
          ${w.popularity != null ? kpi(pct(w.popularity), 'Popularité moyenne de tes titres') : ''}
          ${w.genres ? kpi(fmt(w.genres), 'Genres différents') : ''}
          ${w.albumsCompleted != null ? kpi(fmt(w.albumsCompleted), 'Albums écoutés en entier') : ''}
        </div>
        ${moods.party != null ? `<h3 class="sub-h">Ambiance de tes titres</h3><div class="stack">${[['Fête', moods.party, 'var(--coral)'], ['Amour', moods.love, 'var(--e-pink)'], ['Chill', moods.chill, 'var(--e-sky)']].map(([l, v, c]) => `<span style="width:${v}%;background:${c}" data-tip="${l}<br><b>${fmt(v)} %</b>"></span>`).join('')}</div>
          <ul class="mini">${[['Fête', moods.party, 'var(--coral)'], ['Amour', moods.love, 'var(--e-pink)'], ['Chill', moods.chill, 'var(--e-sky)']].map(([l, v, c]) => `<li><span><i style="background:${c}"></i>${l}</span><span class="num">${fmt(v)} %</span></li>`).join('')}</ul>
          <p class="note">Les trois catégories peuvent se chevaucher : un titre peut être à la fois « fête » et « amour ».</p>` : ''}
      </div>
    </div>
    <div class="cols2">
      <div><h3 class="sub-h">Top artistes selon Spotify</h3><ol class="rank">${w.topArtists.map((id, i) => `<li><span class="rk num">${i + 1}</span><span class="ent">${artistLabel(id)}</span><span class="rv num">${ours.findIndex(e => DB.account.artistNames?.[id] && DB.artists[e.id].toLowerCase() === DB.account.artistNames[id].toLowerCase()) >= 0 ? `n°${ours.findIndex(e => DB.artists[e.id].toLowerCase() === DB.account.artistNames[id].toLowerCase()) + 1} ici` : ''}</span></li>`).join('')}</ol></div>
      <div><h3 class="sub-h">Top titres selon Spotify</h3><ol class="rank">${officialTracks.map((t, i) => `<li><span class="rk num">${i + 1}</span>${t.k != null ? entityCell('track', t.k) : `<span class="ent"><a href="https://open.spotify.com/track/${esc(t.id)}" target="_blank" rel="noopener">titre Spotify</a></span>`}<span class="rv num">${fmt(t.count)}×<small>${dur(t.ms / 1000)}</small></span></li>`).join('')}</ol></div>
    </div>
    ${race ? `<h3 class="sub-h">Ta course d'artistes ${w.year}, mois par mois (rang)</h3>${race}` : ''}
    ${days ? `<h3 class="sub-h">Tes journées marquantes selon Spotify</h3><ul class="wdays">${days}</ul>` : ''}`, { eyebrow: `Wrapped ${w.year} officiel` });
}

// ---------- portrait de goûts ----------
function tasteSection(A) {
  const t = A.taste;
  if (!t || !(t.music || t.rhythm || t.podcast)) return '';
  return section('Le portrait que Spotify fait de toi', `<div class="taste">
    ${t.music ? `<div class="card"><div class="eyebrow">Ta musique</div><p>${md(t.music)}</p></div>` : ''}
    ${t.rhythm ? `<div class="card"><div class="eyebrow">Tes habitudes</div><p>${md(t.rhythm)}</p></div>` : ''}
    ${t.podcast ? `<div class="card"><div class="eyebrow">Tes podcasts</div><p>${md(t.podcast)}</p></div>` : ''}
  </div>${t.artists?.length ? `<p class="note">Artistes que Spotify associe à ton profil : ${t.artists.map(artistLabel).join(', ')}.</p>` : ''}
  <p class="note">Texte généré par Spotify, en anglais, tel quel.</p>`, { eyebrow: 'TasteProfile' });
}

// ---------- publicité ----------
function adsSection(A) {
  const inf = A.inferences || [], mq = A.marquee || [];
  if (!inf.length && !mq.length) return '';
  const affinity = inf.filter(x => /ArtistAffinity/i.test(x)).length;
  const readable = inf.filter(x => !/ArtistAffinity/i.test(x)).map(x => {
    const restricted = /Advertiser-Restricted/i.test(x);
    const label = x.replace(/\[.*?\]/g, '').replace(/^\d?P_?/i, '').replace(/^Custom_/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return { label, restricted };
  }).sort((a, b) => a.label.localeCompare(b.label));
  const seg = new Map();
  for (const [artist, s] of mq) { if (!seg.has(s)) seg.set(s, []); seg.get(s).push(artist); }
  const segOrder = ['Super Listeners', 'Moderate listeners', 'Light listeners', 'Previously Active Listeners'].filter(s => seg.has(s)).concat([...seg.keys()].filter(s => !SEGMENTS[s]));
  const artistChip = n => { const a = artistByName(n); return a !== undefined ? `<a class="chip" href="#/artiste/${a}">${esc(n)}</a>` : `<span class="chip">${esc(n)}</span>`; };
  return section('Comment Spotify te vend aux annonceurs', `
    ${inf.length ? `<p class="lede">Spotify te range dans <b>${fmt(inf.length)} catégories publicitaires</b>, dont ${fmt(affinity)} « affinités avec un artiste » (des codes illisibles). Les autres :</p>
      <div class="chips">${readable.map(r => `<span class="chip${r.restricted ? ' muted' : ''}" ${r.restricted ? 'title="Catégorie réservée à certains annonceurs"' : ''}>${esc(r.label)}</span>`).join('')}</div>` : ''}
    ${mq.length ? `<h3 class="sub-h">Ton statut auprès de ${fmt(mq.length)} artistes</h3>
      <p class="note">Spotify indique à chaque artiste quel type d'auditeur tu es, pour ses campagnes de promotion.</p>
      <div class="segs">${segOrder.map(s => `<div class="seg-c"><div class="seg-h"><b>${esc(SEGMENTS[s] || s)}</b><span class="num">${fmt(seg.get(s).length)}</span></div>
        <div class="chips">${seg.get(s).slice(0, s.startsWith('Previously') ? 24 : 40).map(artistChip).join('')}${seg.get(s).length > 40 ? '<span class="chip muted">…</span>' : ''}</div></div>`).join('')}</div>` : ''}`, { eyebrow: 'Inferences et Marquee' });
}

// ---------- recherches ----------
function searchSection(A) {
  const s = A.searches;
  if (!s || !s.total) return '';
  const bins = s.months.map(([m, n]) => ({ v: n, tick: m.endsWith('-01') ? m.slice(0, 4) : MOIS[+m.slice(5, 7) - 1], tip: `${MOIS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}<br><b>${fmt(n)} recherches</b>` }));
  const max = s.top[0]?.[1] || 1;
  return section('Tes recherches', `
    <div class="kpis">${kpi(fmt(s.total), 'Recherches')}${s.first ? kpi(dateFr(isoToDay(s.first), true), 'Plus ancienne') : ''}${s.months.length ? kpi(fmt(s.total / s.months.length, 0), 'Par mois en moyenne') : ''}</div>
    ${bins.length > 1 ? `<div class="chart chart-sm">${bars(bins, { color: 'var(--e-violet)', height: 170, yFmt: v => fmt(v) })}</div>` : ''}
    <h3 class="sub-h">Ce que tu tapes le plus</h3>
    <div class="chips">${s.top.map(([q, n]) => `<a class="chip" href="#/explorer?q=${encodeURIComponent(q)}" style="font-size:${(12 + 7 * Math.sqrt(n / max)).toFixed(1)}px">${esc(q)} <b class="num">${n}</b></a>`).join('')}</div>
    <p class="note">Recherches de 3 caractères et plus. Spotify enregistre aussi chaque début de frappe (« p », « pr »…), d'où des mots tronqués. Clique pour chercher dans ton historique.</p>`, { eyebrow: 'SearchQueries' });
}

// ---------- playlists et bibliothèque ----------
function playlistSection(A) {
  const pls = A.playlists || [], lib = A.library;
  if (!pls.length && !lib) return '';
  const g = DB.global.track;
  const stat = list => {
    let sec = 0, never = 0, found = 0;
    for (const [n, a, u] of list) {
      const k = trackOf(n, a, u);
      if (k == null || !g.streams[k]) never++;
      if (k != null) { found++; sec += g.sec[k]; }
    }
    return { sec, never, n: list.length };
  };
  const rows = pls.map(p => ({ ...p, ...stat(p.tracks) })).sort((a, b) => (b.modified || '').localeCompare(a.modified || ''));
  let libHtml = '';
  if (lib?.tracks?.length) {
    const saved = lib.tracks.map(([n, a, u]) => ({ n, a, k: trackOf(n, a, u) }));
    const never = saved.filter(x => x.k == null || !g.streams[x.k]);
    const best = saved.filter(x => x.k != null).sort((x, y) => g.streams[y.k] - g.streams[x.k]).slice(0, 8);
    libHtml = `<div class="cols2">
      <div><h3 class="sub-h">Titres « likés » jamais vraiment écoutés</h3>
        <p class="note">${fmt(never.length)} de tes ${fmt(saved.length)} titres sauvegardés n'ont aucune écoute de 30 s ou plus dans ton historique.</p>
        <ul class="mini">${never.slice(0, 12).map(x => `<li><span>${x.k != null ? link('track', x.k) : esc(x.n)}</span><span>${esc(x.a)}</span></li>`).join('')}</ul></div>
      <div><h3 class="sub-h">Tes titres sauvegardés les plus écoutés</h3>
        <ol class="rank">${best.map((x, i) => `<li><span class="rk num">${i + 1}</span>${entityCell('track', x.k)}<span class="rv num">${fmt(g.streams[x.k])}×</span></li>`).join('')}</ol></div>
    </div>`;
  }
  return section('Tes playlists et ta bibliothèque', `
    ${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Playlist</th><th class="n">Titres</th><th class="n">Temps d'écoute de ses titres</th><th class="n">Jamais écoutés</th><th>Modifiée</th></tr></thead><tbody>
      ${rows.map(p => `<tr><td><b>${esc(p.name)}</b></td><td class="n num">${fmt(p.n)}</td><td class="n num">${dur(p.sec)}</td><td class="n num">${p.n ? pct(p.never / p.n) : '—'}</td><td class="num">${p.modified ? dateFr(isoToDay(p.modified), true) : '—'}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="note">Temps d'écoute total, sur tout ton historique, des titres présents dans chaque playlist (quelle que soit la façon dont tu les as lancés).</p>` : ''}
    ${libHtml}`, { eyebrow: 'Playlists et YourLibrary' });
}

// Noms d'artistes inconnus : on tente l'oEmbed public de Spotify (peut être bloqué par le navigateur).
async function resolveUnknownArtists(root) {
  const links = [...root.querySelectorAll('[data-artist-id]')];
  const ids = [...new Set(links.map(a => a.dataset.artistId))].slice(0, 20);
  for (const id of ids) {
    try {
      const r = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/artist/' + id));
      if (!r.ok) continue;
      const name = (await r.json()).title;
      if (!name) continue;
      DB.account.artistNames[id] = name;
      const a = artistByName(name);
      root.querySelectorAll(`[data-artist-id="${id}"]`).forEach(el => {
        if (a !== undefined) { el.outerHTML = link('artist', a); } else { el.textContent = name; }
      });
    } catch { return; }
  }
}
