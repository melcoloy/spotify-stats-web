// Moteur de données : charge history.json et calcule toutes les statistiques côté navigateur.
// Les temps sont stockés en « minutes locales naïves » (fuseau du navigateur à l'import) depuis 1970,
// donc on lit jours/heures avec les méthodes getUTC* sans souci de fuseau.
// T[i] est l'heure de FIN de l'écoute i (c'est ce que fournit Spotify).

export const DB = {
  ready: false,
  n: 0,
  T: null, // minute absolue de fin de chaque écoute
  K: null, // index du titre
  S: null, // secondes écoutées
  F: null, // drapeaux : 1 aléatoire, 2 hors ligne, 4 clip vidéo, bits 3+ plateforme
  R: null, // raison de début * 16 + raison de fin
  C: null, // index du pays
  artists: [],
  albums: [],
  tracks: [],
  trackArtist: null,
  trackAlbum: null,
  albumArtist: null,
  platforms: [],
  countries: [],
  firstDay: 0,
  lastDay: 0,
  covers: null,
};

export const STREAM_SEC = 30;
export const SESSION_GAP_MIN = 30;

// Indices des raisons utiles (remplis au chargement).
const RS = {}, RE = {};

// Construit la base en mémoire à partir de l'objet produit par l'importeur (js/importer.js).
export function ingest(j) {
  const n = j.meta.count;
  if (!n) throw new Error('aucune écoute de musique trouvée dans ces fichiers');
  const T = new Int32Array(n), K = new Int32Array(n), S = new Int32Array(n), F = new Uint8Array(n), R = new Uint8Array(n), C = new Uint8Array(n);
  let acc = j.meta.baseMinute;
  const p = j.plays;
  for (let i = 0; i < n; i++) {
    acc += p.dt[i];
    T[i] = acc; K[i] = p.k[i]; S[i] = p.s[i]; F[i] = p.f[i]; R[i] = p.r[i]; C[i] = p.c[i];
  }
  j.meta.reasonsStart.forEach((r, i) => { RS[r] = i; });
  j.meta.reasonsEnd.forEach((r, i) => { RE[r] = i; });
  Object.assign(DB, {
    n, T, K, S, F, R, C,
    artists: j.artists,
    albums: j.albums.map(a => a[0]),
    tracks: j.tracks.map(t => t[0]),
    trackUri: j.tracks.map(t => t[3]),
    trackArtist: Int32Array.from(j.tracks, t => t[1]),
    trackAlbum: Int32Array.from(j.tracks, t => t[2]),
    albumArtist: Int32Array.from(j.albums, a => a[1]),
    platforms: j.meta.platforms,
    reasonsStart: j.meta.reasonsStart,
    reasonsEnd: j.meta.reasonsEnd,
    countries: j.meta.countries,
    podcasts: j.podcasts,
    meta: j.meta,
    firstDay: Math.floor(T[0] / 1440),
    lastDay: Math.floor(T[n - 1] / 1440),
    ready: true,
  });
  buildSessions();
  buildSearchIndex();
  DB.global = computeStats(fullRange());
  return DB;
}

// ---------- dates ----------
export const dayToDate = d => new Date(d * 86400000);
export const dateToDay = dt => Math.floor(dt.getTime() / 86400000);
export const isoToDay = s => dateToDay(new Date(s + 'T00:00:00Z'));
export const dayToIso = d => dayToDate(d).toISOString().slice(0, 10);
export const monthKey = minute => { const d = new Date(minute * 60000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
export const yearOfDay = d => dayToDate(d).getUTCFullYear();
export const startMinute = i => DB.T[i] - DB.S[i] / 60;

export function fullRange() { return { from: DB.firstDay, to: DB.lastDay }; }
export function yearRange(y) {
  return { from: Math.max(DB.firstDay, isoToDay(`${y}-01-01`)), to: Math.min(DB.lastDay, isoToDay(`${y}-12-31`)) };
}
export function years() {
  const out = [];
  for (let y = yearOfDay(DB.firstDay); y <= yearOfDay(DB.lastDay); y++) out.push(y);
  return out;
}
export const isFull = r => r.from === DB.firstDay && r.to === DB.lastDay;

// Indices [lo, hi) des écoutes comprises dans la plage de jours (bornes incluses).
export function indexRange(range) {
  return [lowerBound(range.from * 1440), lowerBound((range.to + 1) * 1440)];
}
function lowerBound(v) {
  let a = 0, b = DB.n;
  while (a < b) { const m = (a + b) >> 1; if (DB.T[m] < v) a = m + 1; else b = m; }
  return a;
}

// ---------- prédicats ----------
export const byArtist = id => i => DB.trackArtist[DB.K[i]] === id;
export const byAlbum = id => i => DB.trackAlbum[DB.K[i]] === id;
export const byTrack = id => i => DB.K[i] === id;
export const reasonStartOf = i => DB.R[i] >> 4;
export const reasonEndOf = i => DB.R[i] & 15;
export const isSkip = i => (DB.R[i] & 15) === RE.fwdbtn;

// ---------- agrégation principale ----------
// Un seul passage sur les écoutes de la plage, filtrées par un prédicat optionnel.
export function computeStats(range, pred = null, opts = {}) {
  const { T, K, S, F, R, C, trackArtist, trackAlbum } = DB;
  const nT = DB.tracks.length, nA = DB.artists.length, nAl = DB.albums.length;
  const tSec = new Float64Array(nT), tStreams = new Int32Array(nT), tPlays = new Int32Array(nT);
  const tSkip = new Int32Array(nT), tDone = new Int32Array(nT), tChosen = new Int32Array(nT);
  const tFirst = new Int32Array(nT).fill(-1), tLast = new Int32Array(nT).fill(-1);
  const heat = new Float64Array(168);
  const platform = new Float64Array(DB.platforms.length);
  const country = new Float64Array(DB.countries.length);
  const rStart = new Int32Array(16), rEnd = new Int32Array(16);
  const days = new Map();
  const months = new Map();
  const monthArtist = opts.eras ? new Map() : null;
  const fwd = RE.fwdbtn, done = RE.trackdone, click = RS.clickrow, play = RS.playbtn;
  let sec = 0, plays = 0, streams = 0, skips = 0, completes = 0, chosen = 0, shuffle = 0, offline = 0, night = 0, videoSec = 0;
  const [lo, hi] = indexRange(range);
  for (let i = lo; i < hi; i++) {
    if (pred && !pred(i)) continue;
    const k = K[i], s = S[i], m = T[i], rs = R[i] >> 4, re = R[i] & 15;
    plays++; sec += s;
    tSec[k] += s; tPlays[k]++;
    if (s >= STREAM_SEC) { streams++; tStreams[k]++; }
    if (re === fwd) { skips++; tSkip[k]++; }
    if (re === done) { completes++; tDone[k]++; }
    if (rs === click || rs === play) { chosen++; tChosen[k]++; }
    rStart[rs]++; rEnd[re]++;
    if (tFirst[k] < 0) tFirst[k] = m;
    tLast[k] = m;
    const f = F[i];
    if (f & 1) shuffle++;
    if (f & 2) offline++;
    if (f & 4) videoSec += s;
    platform[f >> 3] += s;
    country[C[i]] += s;
    const day = Math.floor(m / 1440), hour = Math.floor((m % 1440) / 60);
    const dow = (day + 3) % 7; // 0 = lundi (le 1/1/1970 était un jeudi)
    heat[dow * 24 + hour] += s;
    if (hour < 5) night += s;
    days.set(day, (days.get(day) || 0) + s);
    const mk = monthKey(m);
    months.set(mk, (months.get(mk) || 0) + s);
    if (monthArtist) {
      let mm = monthArtist.get(mk);
      if (!mm) monthArtist.set(mk, mm = new Map());
      const a = trackArtist[k];
      mm.set(a, (mm.get(a) || 0) + s);
    }
  }
  // Agrégation par artiste et par album à partir des titres.
  const group = (n, keyOf) => {
    const g = {
      sec: new Float64Array(n), streams: new Int32Array(n), plays: new Int32Array(n), skip: new Int32Array(n),
      done: new Int32Array(n), chosen: new Int32Array(n), first: new Int32Array(n).fill(-1), last: new Int32Array(n).fill(-1), tracks: new Int32Array(n),
    };
    for (let k = 0; k < nT; k++) {
      if (!tPlays[k]) continue;
      const a = keyOf[k];
      g.sec[a] += tSec[k]; g.streams[a] += tStreams[k]; g.plays[a] += tPlays[k]; g.skip[a] += tSkip[k];
      g.done[a] += tDone[k]; g.chosen[a] += tChosen[k]; g.tracks[a]++;
      if (g.first[a] < 0 || tFirst[k] < g.first[a]) g.first[a] = tFirst[k];
      if (tLast[k] > g.last[a]) g.last[a] = tLast[k];
    }
    return g;
  };
  const artist = group(nA, trackArtist), album = group(nAl, trackAlbum);
  let nTracks = 0; for (let k = 0; k < nT; k++) if (tPlays[k]) nTracks++;
  let nArtists = 0; for (let a = 0; a < nA; a++) if (artist.plays[a]) nArtists++;
  let nAlbums = 0; for (let a = 0; a < nAl; a++) if (album.plays[a]) nAlbums++;

  // Série de jours consécutifs et meilleur jour.
  const dayList = [...days.keys()].sort((a, b) => a - b);
  let streak = { len: 0, from: null, to: null }, cur = 0, curFrom = null, bestDay = null;
  for (let j = 0; j < dayList.length; j++) {
    const d = dayList[j];
    if (j && d === dayList[j - 1] + 1) cur++; else { cur = 1; curFrom = d; }
    if (cur > streak.len) streak = { len: cur, from: curFrom, to: d };
    if (!bestDay || days.get(d) > bestDay.sec) bestDay = { day: d, sec: days.get(d) };
  }

  return {
    range, sec, plays, streams, skips, completes, chosen, shuffle, offline, night, videoSec,
    nTracks, nArtists, nAlbums, activeDays: days.size,
    heat, platform, country, rStart, rEnd, days, months, monthArtist, streak, bestDay,
    track: { sec: tSec, streams: tStreams, plays: tPlays, skip: tSkip, done: tDone, chosen: tChosen, first: tFirst, last: tLast },
    artist, album,
  };
}

// Liste triée d'entités (artist | album | track) à partir d'un objet stats.
export function ranking(st, kind, sortKey = 'sec', limit = Infinity) {
  const g = st[kind];
  const out = [];
  for (let id = 0; id < g.plays.length; id++) {
    if (!g.plays[id]) continue;
    const pl = g.plays[id];
    out.push({
      kind, id,
      sec: g.sec[id], streams: g.streams[id], plays: pl, skip: g.skip[id],
      skipRate: g.skip[id] / pl, doneRate: g.done[id] / pl, chosen: g.chosen[id], chosenRate: g.chosen[id] / pl,
      first: g.first[id], last: g.last[id],
      tracks: g.tracks ? g.tracks[id] : 1,
    });
  }
  const dir = sortKey === 'first' ? 1 : -1;
  if (sortKey === 'name') out.sort((a, b) => nameOf(a.kind, a.id).localeCompare(nameOf(b.kind, b.id), 'fr'));
  else out.sort((a, b) => dir * (a[sortKey] - b[sortKey]) || b.sec - a.sec);
  return limit < out.length ? out.slice(0, limit) : out;
}

export function nameOf(kind, id) {
  return kind === 'artist' ? DB.artists[id] : kind === 'album' ? DB.albums[id] : DB.tracks[id];
}
export function artistOf(kind, id) {
  return kind === 'track' ? DB.trackArtist[id] : kind === 'album' ? DB.albumArtist[id] : id;
}

// Rang global (tout l'historique, au temps d'écoute) d'une entité.
const rankCache = {};
export function globalRank(kind, id) {
  if (!rankCache[kind]) {
    const r = ranking(DB.global, kind, 'sec');
    rankCache[kind] = new Map(r.map((e, i) => [e.id, i + 1]));
  }
  return rankCache[kind].get(id);
}

// Artistes découverts dans la plage : première écoute de tout l'historique dans cette plage.
export function discoveries(st) {
  const g = DB.global.artist;
  const lo = st.range.from * 1440, hi = (st.range.to + 1) * 1440;
  return ranking(st, 'artist').filter(e => g.first[e.id] >= lo && g.first[e.id] < hi);
}

// Période précédente de même durée (pour les comparaisons).
export function previousRange(range) {
  const len = range.to - range.from + 1;
  const to = range.from - 1, from = to - len + 1;
  if (to < DB.firstDay) return null;
  return { from: Math.max(from, DB.firstDay), to };
}

// ---------- sessions ----------
// Une session = écoutes séparées de moins de 30 minutes de silence.
function buildSessions() {
  const { n, T } = DB;
  const starts = [0];
  for (let i = 1; i < n; i++) if (startMinute(i) - T[i - 1] > SESSION_GAP_MIN) starts.push(i);
  DB.sessionStart = Int32Array.from(starts);
}

// Sessions qui commencent dans la plage. Chaque session : {lo, hi, start, end, sec, plays}.
export function sessionsIn(range) {
  const st = DB.sessionStart, out = [];
  const a = range.from * 1440, b = (range.to + 1) * 1440;
  for (let s = 0; s < st.length; s++) {
    const lo = st[s], hi = s + 1 < st.length ? st[s + 1] : DB.n;
    const start = startMinute(lo);
    if (start < a) continue;
    if (start >= b) break;
    let sec = 0;
    for (let i = lo; i < hi; i++) sec += DB.S[i];
    out.push({ lo, hi, start, end: DB.T[hi - 1], sec, plays: hi - lo });
  }
  return out;
}

// ---------- obsessions et durée de vie des titres ----------
let trackDaysCache = null;
function trackDays() {
  if (trackDaysCache) return trackDaysCache;
  const m = new Map();
  for (let i = 0; i < DB.n; i++) {
    if (DB.S[i] < STREAM_SEC) continue;
    const k = DB.K[i];
    let a = m.get(k);
    if (!a) m.set(k, a = []);
    a.push(Math.floor(DB.T[i] / 1440));
  }
  return (trackDaysCache = m);
}

// Pour chaque titre assez écouté : la fenêtre de 7 jours la plus intense, sa part du total,
// la « demi-vie » (jours pour atteindre la moitié des streams) et l'étendue de vie.
export function trackLifecycles(minStreams = 15) {
  const out = [];
  for (const [k, days] of trackDays()) {
    if (days.length < minStreams) continue;
    let best = 0, bestStart = days[0], j = 0;
    for (let i = 0; i < days.length; i++) {
      while (days[i] - days[j] >= 7) j++;
      if (i - j + 1 > best) { best = i - j + 1; bestStart = days[j]; }
    }
    const total = days.length;
    const half = days[Math.floor((total - 1) / 2)] - days[0];
    const p5 = days[Math.floor(total * 0.05)], p95 = days[Math.min(total - 1, Math.floor(total * 0.95))];
    out.push({
      id: k, total, peak: best, peakStart: bestStart, peakShare: best / total,
      first: days[0], last: days[total - 1], halfLife: half, span: p95 - p5,
      activeDays: new Set(days).size,
    });
  }
  return out;
}
export function dailySeries(trackId) {
  return trackDays().get(trackId) || [];
}

// ---------- réseau d'artistes (co-écoute dans les mêmes sessions) ----------
export function coListenGraph(range, topN = 80, minSecInSession = 60) {
  const st = computeStats(range);
  const top = ranking(st, 'artist', 'sec', topN);
  const idx = new Map(top.map((e, i) => [e.id, i]));
  const sessions = sessionsIn(range);
  const w = new Map();
  const presence = new Int32Array(top.length);
  for (const s of sessions) {
    const secBy = new Map();
    for (let i = s.lo; i < s.hi; i++) {
      const a = DB.trackArtist[DB.K[i]];
      if (!idx.has(a)) continue;
      secBy.set(a, (secBy.get(a) || 0) + DB.S[i]);
    }
    const present = [...secBy].filter(([, v]) => v >= minSecInSession).map(([a]) => idx.get(a)).sort((x, y) => x - y);
    present.forEach(p => presence[p]++);
    for (let x = 0; x < present.length; x++) for (let y = x + 1; y < present.length; y++) {
      const key = present[x] * 1000 + present[y];
      w.set(key, (w.get(key) || 0) + 1);
    }
  }
  // Poids normalisé (indice de Jaccard) pour ne pas relier tout le monde aux plus gros artistes.
  const edges = [];
  for (const [key, c] of w) {
    const a = Math.floor(key / 1000), b = key % 1000;
    const jac = c / (presence[a] + presence[b] - c);
    if (c >= 3 && jac >= 0.04) edges.push({ a, b, count: c, w: jac });
  }
  const nodes = top.map((e, i) => ({ i, id: e.id, sec: e.sec, sessions: presence[i] }));
  return { nodes, edges, nSessions: sessions.length };
}

// Détection de communautés par la méthode de Louvain (graphe pondéré non orienté).
export function louvain(nNodes, edges) {
  let comm = Array.from({ length: nNodes }, (_, i) => i);
  let nodesOf = comm.map(i => [i]);
  let curEdges = edges.map(e => ({ a: e.a, b: e.b, w: e.w }));
  let n = nNodes;
  for (let level = 0; level < 10; level++) {
    const adj = Array.from({ length: n }, () => new Map());
    const deg = new Float64Array(n);
    let m2 = 0;
    for (const e of curEdges) {
      if (e.a === e.b) { adj[e.a].set(e.a, (adj[e.a].get(e.a) || 0) + 2 * e.w); deg[e.a] += 2 * e.w; m2 += 2 * e.w; continue; }
      adj[e.a].set(e.b, (adj[e.a].get(e.b) || 0) + e.w);
      adj[e.b].set(e.a, (adj[e.b].get(e.a) || 0) + e.w);
      deg[e.a] += e.w; deg[e.b] += e.w; m2 += 2 * e.w;
    }
    if (!m2) break;
    const c = Array.from({ length: n }, (_, i) => i);
    const tot = Float64Array.from(deg);
    let moved = true, any = false, passes = 0;
    while (moved && passes++ < 30) {
      moved = false;
      for (let v = 0; v < n; v++) {
        const cv = c[v];
        const links = new Map();
        for (const [u, wt] of adj[v]) if (u !== v) links.set(c[u], (links.get(c[u]) || 0) + wt);
        tot[cv] -= deg[v];
        let best = cv, bestGain = (links.get(cv) || 0) - tot[cv] * deg[v] / m2;
        for (const [cc, kin] of links) {
          const gain = kin - tot[cc] * deg[v] / m2;
          if (gain > bestGain + 1e-12) { bestGain = gain; best = cc; }
        }
        tot[best] += deg[v];
        if (best !== cv) { c[v] = best; moved = true; any = true; }
      }
    }
    if (!any) break;
    const remap = new Map();
    c.forEach(x => { if (!remap.has(x)) remap.set(x, remap.size); });
    const newNodesOf = Array.from({ length: remap.size }, () => []);
    for (let v = 0; v < n; v++) newNodesOf[remap.get(c[v])].push(...nodesOf[v]);
    const agg = new Map();
    for (const e of curEdges) {
      const a = remap.get(c[e.a]), b = remap.get(c[e.b]);
      const key = Math.min(a, b) * 100000 + Math.max(a, b);
      agg.set(key, (agg.get(key) || 0) + e.w);
    }
    curEdges = [...agg].map(([key, wt]) => ({ a: Math.floor(key / 100000), b: key % 100000, w: wt }));
    nodesOf = newNodesOf;
    n = remap.size;
  }
  comm = new Array(nNodes).fill(0);
  nodesOf.forEach((list, ci) => list.forEach(v => { comm[v] = ci; }));
  return comm;
}

// ---------- podcasts ----------
export function podcastStats(range) {
  const P = DB.podcasts;
  const a = range.from * 1440, b = (range.to + 1) * 1440;
  const showSec = new Float64Array(P.shows.length), showPlays = new Int32Array(P.shows.length), showFirst = new Int32Array(P.shows.length).fill(-1), showLast = new Int32Array(P.shows.length).fill(-1);
  const epSec = new Float64Array(P.episodes.length);
  let sec = 0, plays = 0, videoSec = 0;
  const months = new Map();
  for (let i = 0; i < P.plays.t.length; i++) {
    const t = P.plays.t[i];
    if (t < a || t >= b) continue;
    const e = P.plays.e[i], s = P.plays.s[i], sh = P.episodes[e][1];
    sec += s; plays++;
    if (P.plays.v[i]) videoSec += s;
    showSec[sh] += s; showPlays[sh]++; epSec[e] += s;
    if (showFirst[sh] < 0) showFirst[sh] = t;
    showLast[sh] = t;
    const mk = monthKey(t);
    months.set(mk, (months.get(mk) || 0) + s);
  }
  return { sec, plays, videoSec, showSec, showPlays, showFirst, showLast, epSec, months, range };
}

// ---------- pochettes ----------
const IMG = 'https://i.scdn.co/image/';
export function coverOf(kind, id) {
  const c = DB.covers;
  if (!c) return null;
  const h = kind === 'track' ? c.t?.[id] ?? c.al?.[DB.trackAlbum[id]] : kind === 'album' ? c.al?.[id] : c.a?.[id];
  return h ? (h.startsWith('http') ? h : IMG + h) : null;
}

// ---------- recherche ----------
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
let searchIndex = [];
function buildSearchIndex() {
  searchIndex = [];
  DB.artists.forEach((n, id) => searchIndex.push({ kind: 'artist', id, key: norm(n) }));
  DB.albums.forEach((n, id) => searchIndex.push({ kind: 'album', id, key: norm(n) }));
  DB.tracks.forEach((n, id) => searchIndex.push({ kind: 'track', id, key: norm(n) }));
}
export function search(q, limit = 30) {
  const nq = norm(q.trim());
  if (!nq) return [];
  const g = DB.global;
  const res = [];
  for (const e of searchIndex) {
    const pos = e.key.indexOf(nq);
    if (pos < 0) continue;
    const sec = g[e.kind].sec[e.id];
    // Les correspondances en début de nom et les entités très écoutées remontent.
    const score = (pos === 0 ? 2 : 1) * Math.log10(10 + sec) + (e.kind === 'artist' ? 0.6 : 0);
    res.push({ ...e, score, sec });
  }
  res.sort((a, b) => b.score - a.score);
  return res.slice(0, limit);
}

// ---------- une journée ----------
export const dayRange = d => ({ from: d, to: d });

// ---------- enchaînements (chaîne de Markov sur les sessions) ----------
// Transition A -> B : B est écouté juste après A dans la même session, les deux au moins 30 s.
let markov = null;
function buildMarkov() {
  const next = new Map(), prev = new Map(), aNext = new Map();
  const add = (m, a, b) => { let x = m.get(a); if (!x) m.set(a, x = new Map()); x.set(b, (x.get(b) || 0) + 1); };
  const st = DB.sessionStart;
  for (let s = 0; s < st.length; s++) {
    const lo = st[s], hi = s + 1 < st.length ? st[s + 1] : DB.n;
    let last = -1;
    for (let i = lo; i < hi; i++) {
      if (DB.S[i] < STREAM_SEC) continue;
      const k = DB.K[i];
      if (last >= 0 && last !== k) {
        add(next, last, k); add(prev, k, last);
        const a = DB.trackArtist[last], b = DB.trackArtist[k];
        if (a !== b) add(aNext, a, b);
      }
      last = k;
    }
  }
  return (markov = { next, prev, aNext });
}
const sorted = m => (m ? [...m].sort((x, y) => y[1] - x[1]) : []);
// Liste [{id, n, p}] des titres qui suivent (ou précèdent) un titre, avec leur probabilité.
export function transitions(trackId, dir = 'next') {
  const M = markov || buildMarkov();
  const list = sorted((dir === 'next' ? M.next : M.prev).get(trackId));
  const tot = list.reduce((a, [, n]) => a + n, 0);
  return list.map(([id, n]) => ({ id, n, p: n / tot }));
}
export function artistTransitions(artistId) {
  const M = markov || buildMarkov();
  const list = sorted(M.aNext.get(artistId));
  const tot = list.reduce((a, [, n]) => a + n, 0);
  return list.map(([id, n]) => ({ id, n, p: n / tot }));
}
// Génère une suite de titres en suivant les probabilités apprises. Renvoie [{id, via, p}].
// audace (0 à 1) : 0 prend toujours le plus probable, 1 tire au sort selon les probabilités brutes.
export function radio(seed, length = 20, audace = 0.4) {
  const M = markov || buildMarkov();
  const out = [{ id: seed, via: 'départ', p: 1 }], used = new Set([seed]);
  let cur = seed;
  for (let step = 1; step < length; step++) {
    // On garde les 12 suites les plus fréquentes : la longue traîne des enchaînements uniques n'a pas de sens.
    let cands = sorted(M.next.get(cur)).filter(([k]) => !used.has(k)).slice(0, 12);
    let via = 'titre';
    if (!cands.length) {
      // Pas d'enchaînement connu : on passe par l'artiste suivant le plus probable.
      const arts = sorted(M.aNext.get(DB.trackArtist[cur]));
      for (const [a] of arts) {
        const tops = DB.global ? topTracksOf(a).filter(k => !used.has(k)) : [];
        if (tops.length) { cands = tops.slice(0, 5).map((k, i) => [k, 5 - i]); via = 'artiste'; break; }
      }
    }
    if (!cands.length) break;
    const pow = 1 / Math.max(0.05, audace);
    const w = cands.map(([, n]) => Math.pow(n, pow));
    const tot = w.reduce((a, b) => a + b, 0);
    const raw = cands.reduce((a, [, n]) => a + n, 0);
    let r = Math.random() * tot, pi = 0;
    for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r <= 0) { pi = i; break; } }
    const pick = cands[pi][0];
    out.push({ id: pick, via, p: cands[pi][1] / raw }); used.add(pick); cur = pick;
  }
  return out;
}
const topCache = new Map();
function topTracksOf(artistId) {
  if (!topCache.has(artistId)) {
    const g = DB.global.track, list = [];
    for (let k = 0; k < g.plays.length; k++) if (g.streams[k] && DB.trackArtist[k] === artistId) list.push(k);
    list.sort((a, b) => g.streams[b] - g.streams[a]);
    topCache.set(artistId, list);
  }
  return topCache.get(artistId);
}
// Prévisibilité d'un titre : part de l'enchaînement le plus fréquent.
export function predictability(trackId) {
  const t = transitions(trackId);
  return t.length ? t[0].p : null;
}

// ---------- albums écoutés d'une traite ----------
// Une « écoute intégrale » : au moins 5 titres différents du même album à la suite dans une session,
// couvrant au moins 70 % des titres de l'album que tu as déjà écoutés.
let albumRunsCache = null;
export function albumRuns() {
  if (albumRunsCache) return albumRunsCache;
  const known = new Int32Array(DB.albums.length);
  const g = DB.global.track;
  for (let k = 0; k < g.plays.length; k++) if (g.streams[k]) known[DB.trackAlbum[k]]++;
  const runs = [];
  const st = DB.sessionStart;
  for (let s = 0; s < st.length; s++) {
    const lo = st[s], hi = s + 1 < st.length ? st[s + 1] : DB.n;
    let al = -1, set = new Set(), start = lo;
    const flush = end => {
      if (al >= 0 && set.size >= 5 && set.size >= 0.7 * known[al]) runs.push({ album: al, tracks: set.size, known: known[al], start: DB.T[start] - DB.S[start] / 60, end: DB.T[end - 1] });
    };
    for (let i = lo; i < hi; i++) {
      if (DB.S[i] < STREAM_SEC) continue;
      const a = DB.trackAlbum[DB.K[i]];
      if (a !== al) { flush(i); al = a; set = new Set(); start = i; }
      set.add(DB.K[i]);
    }
    flush(hi);
  }
  return (albumRunsCache = { runs, known });
}

// ---------- genres ----------
// Familles larges à partir des tags MusicBrainz (le premier tag reconnu l'emporte).
export const FAMILIES = [
  ['Rap / hip-hop', /(hip[ -]?hop|rap|trap|drill|grime|boom bap|cloud)/],
  ['R&B / soul', /(r&b|rnb|rhythm and blues|soul|neo soul)/],
  ['Latino', /(reggaeton|latin|urbano|dembow|corrido|regional mexican|bachata|cumbia|salsa|sertanejo|pagode|funk carioca|brazil)/],
  ['Afro', /(afro|amapiano|highlife|dancehall|reggae)/],
  ['Électro', /(electro|house|techno|edm|dance|dubstep|drum and bass|trance|synthwave)/],
  ['Rock / metal', /(rock|metal|punk|grunge|emo|indie)/],
  ['Pop', /(pop|boy band|chanson|variété)/],
  ['Jazz / funk', /(jazz|funk|blues|disco)/],
  ['B.O. / classique', /(soundtrack|classical|score|orchestra|video game)/],
];
export function familyOf(artistId) {
  const g = DB.genres?.[artistId];
  if (!g) return null;
  for (const tag of g.g || []) {
    const t = tag.toLowerCase();
    for (const [name, re] of FAMILIES) if (re.test(t)) return name;
  }
  return g.g && g.g.length ? 'Autre' : null;
}
export const originOf = artistId => DB.genres?.[artistId]?.c || null;
