// Importeur : lit l'export Spotify (zip ou fichiers JSON) directement dans le navigateur
// et le convertit au format compact utilisé par le moteur de calcul (js/data.js).
// Rien n'est envoyé sur internet : tout se passe dans cette page.
import { unzipSync } from './vendor/fflate.js';

const PLATFORMS = ['iPhone', 'iPad', 'Android', 'Windows', 'macOS', 'Web', 'PlayStation', 'Enceinte / TV', 'Voiture', 'Autre'];
const REASONS_START = ['trackdone', 'fwdbtn', 'clickrow', 'playbtn', 'remote', 'backbtn', 'appload', 'trackerror', 'switched-to-audio', 'endplay', 'reconnect', 'unknown'];
const REASONS_END = ['trackdone', 'fwdbtn', 'endplay', 'logout', 'backbtn', 'unexpected-exit-while-paused', 'remote', 'unexpected-exit', 'trackerror', 'switched-to-video', 'unknown'];

function platformIndex(p) {
  p = (p || '').toLowerCase();
  if (p.includes('ipad')) return 1;
  if (p.includes('ios') || p.includes('iphone')) return 0;
  if (p.includes('android') && !p.includes('tv')) return 2;
  if (p.includes('windows')) return 3;
  if (p.includes('os x') || p.includes('osx') || p.includes('macos') || p.includes('mac os')) return 4;
  if (p.includes('web')) return 5;
  if (/playstation|ps4|ps5|sony/.test(p)) return 6;
  if (/car|auto/.test(p)) return 8;
  if (/cast|sonos|tv|speaker|echo|alexa|google_home|xbox|bose/.test(p)) return 7;
  return 9;
}
const reasonIndex = (v, table) => { const i = table.indexOf(v || 'unknown'); return i >= 0 ? i : table.indexOf('unknown'); };

// Minute « locale naïve » : l'heure affichée sur l'horloge de l'utilisateur, comptée depuis 1970.
function localMinute(iso) {
  const d = new Date(iso);
  return Math.floor(d.getTime() / 60000) - d.getTimezoneOffset();
}

const decoder = new TextDecoder('utf-8');
const isHistoryName = name => /Streaming_?History[^/]*\.json$/i.test(name);

// Lit les fichiers choisis et renvoie la liste [{name, data}] des historiques trouvés.
async function readFiles(files, progress) {
  const out = [];
  for (const file of files) {
    progress?.(`Lecture de ${file.name}…`);
    const buf = new Uint8Array(await file.arrayBuffer());
    if (/\.zip$/i.test(file.name) || (buf[0] === 0x50 && buf[1] === 0x4b)) {
      const entries = unzipSync(buf, { filter: f => isHistoryName(f.name) });
      for (const [name, bytes] of Object.entries(entries)) out.push({ name, data: JSON.parse(decoder.decode(bytes)) });
    } else if (/\.json$/i.test(file.name)) {
      out.push({ name: file.name, data: JSON.parse(decoder.decode(buf)) });
    }
    await new Promise(r => setTimeout(r)); // laisse la page respirer
  }
  return out;
}

export async function importFiles(files, progress) {
  const docs = await readFiles([...files], progress);
  progress?.('Analyse des écoutes…');
  const base = n => n.split('/').pop();
  const ext = docs.filter(d => /Streaming_History_(Audio|Video)_/i.test(base(d.name)));
  const legacy = docs.filter(d => /^StreamingHistory/i.test(base(d.name)));

  const music = [], pods = [];
  let format = 'étendu';
  if (ext.length) {
    for (const d of ext) {
      const video = /_Video_/i.test(base(d.name));
      for (const r of d.data) {
        if (r.master_metadata_track_name && r.master_metadata_album_artist_name) music.push({ r, video });
        else if (r.episode_name) pods.push({ t: localMinute(r.ts), name: r.episode_name, show: r.episode_show_name, uri: (r.spotify_episode_uri || '').split(':').pop(), s: Math.round(r.ms_played / 1000), v: video ? 1 : 0 });
      }
    }
  } else if (legacy.length) {
    // Ancien format (« Données du compte ») : moins de détails, pas d'album ni de raisons.
    format = 'simple';
    for (const d of legacy) {
      for (const r of d.data) {
        const iso = (r.endTime || '').replace(' ', 'T') + ':00Z';
        if (r.trackName && r.artistName) {
          music.push({ r: { ts: iso, ms_played: r.msPlayed, master_metadata_track_name: r.trackName, master_metadata_album_artist_name: r.artistName }, video: false });
        } else if (r.episodeName || r.podcastName) {
          pods.push({ t: localMinute(iso), name: r.episodeName || '(épisode)', show: r.podcastName, uri: '', s: Math.round(r.msPlayed / 1000), v: 0 });
        }
      }
    }
  }
  if (!music.length) {
    throw new Error(docs.length
      ? 'aucune écoute de musique dans ces fichiers. Vérifie que ce sont bien des fichiers « Streaming_History » de Spotify.'
      : 'aucun fichier d\'historique Spotify trouvé. Dépose le zip reçu de Spotify, ou les fichiers « Streaming_History_Audio_… .json ».');
  }

  const rows = music.map(x => ({ m: localMinute(x.r.ts), r: x.r, v: x.video })).sort((a, b) => a.m - b.m);
  const artists = [], albums = [], tracks = [], countries = [];
  const aIdx = new Map(), alIdx = new Map(), tIdx = new Map(), cIdx = new Map();
  const artistId = name => { if (!aIdx.has(name)) { aIdx.set(name, artists.length); artists.push(name); } return aIdx.get(name); };
  const albumId = (name, a) => { const k = name + '\u0000' + a; if (!alIdx.has(k)) { alIdx.set(k, albums.length); albums.push([name, a]); } return alIdx.get(k); };
  const trackId = r => {
    const a = artistId(r.master_metadata_album_artist_name);
    const al = albumId(r.master_metadata_album_album_name || '(album inconnu)', a);
    const uri = (r.spotify_track_uri || '').split(':').pop();
    // Un même titre peut exister sur plusieurs albums (single, deluxe…) : on le regroupe par nom + artiste.
    const key = r.master_metadata_track_name.trim().toLowerCase() + '\u0000' + a;
    if (!tIdx.has(key)) { tIdx.set(key, tracks.length); tracks.push([r.master_metadata_track_name, a, al, uri]); }
    else if (uri && !tracks[tIdx.get(key)][3]) tracks[tIdx.get(key)][3] = uri;
    return tIdx.get(key);
  };
  const countryId = c => { c = (c || 'ZZ').toUpperCase(); if (!cIdx.has(c)) { cIdx.set(c, countries.length); countries.push(c); } return cIdx.get(c); };

  const n = rows.length, baseMinute = rows[0].m;
  const dt = new Array(n), k = new Array(n), s = new Array(n), f = new Array(n), rr = new Array(n), c = new Array(n);
  let prev = baseMinute;
  for (let i = 0; i < n; i++) {
    const { m, r, v } = rows[i];
    let flags = 0;
    if (r.shuffle) flags |= 1;
    if (r.offline) flags |= 2;
    if (v) flags |= 4;
    flags |= platformIndex(r.platform) << 3;
    dt[i] = i ? m - prev : 0; prev = m;
    k[i] = trackId(r);
    s[i] = Math.round((r.ms_played || 0) / 1000);
    f[i] = flags;
    rr[i] = reasonIndex(r.reason_start, REASONS_START) * 16 + reasonIndex(r.reason_end, REASONS_END);
    c[i] = countryId(r.conn_country);
  }

  // Podcasts
  pods.sort((a, b) => a.t - b.t);
  const shows = [], sIdx = new Map(), episodes = [], eIdx = new Map();
  const pt = [], pe = [], ps = [], pv = [];
  for (const p of pods) {
    const show = p.show || '(émission inconnue)';
    if (!sIdx.has(show)) { sIdx.set(show, shows.length); shows.push(show); }
    const key = p.name + '\u0000' + sIdx.get(show);
    if (!eIdx.has(key)) { eIdx.set(key, episodes.length); episodes.push([p.name, sIdx.get(show), p.uri]); }
    pt.push(p.t); pe.push(eIdx.get(key)); ps.push(p.s); pv.push(p.v);
  }

  return {
    meta: {
      version: 2, format, generated: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      baseMinute, count: n, platforms: PLATFORMS, reasonsStart: REASONS_START, reasonsEnd: REASONS_END,
      countries, excluded: 0, exclusions: [], anomalies: [],
      files: docs.length,
    },
    artists, albums, tracks,
    plays: { dt, k, s, f, r: rr, c },
    podcasts: { shows, episodes, plays: { t: pt, e: pe, s: ps, v: pv } },
  };
}
