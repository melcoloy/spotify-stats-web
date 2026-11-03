// Données d'exemple : l'historique d'un auditeur fictif, généré au format Spotify.
// Les artistes et les titres sont inventés. Le générateur est déterministe (même graine,
// mêmes données) pour que la démo soit identique à chaque visite.

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const FIRST = ['Nova', 'Léo', 'Maya', 'Zed', 'Iris', 'Kael', 'Lina', 'Oscar', 'Sana', 'Milo', 'Ana', 'Rayan', 'Jade', 'Tiago', 'Elio', 'Nina', 'Yanis', 'Lou', 'Kenzo', 'Aya'];
const LAST = ['Marchal', 'Okoro', 'Vance', 'Delacroix', 'Mendes', 'Sato', 'Laurent', 'Kova', 'Riviera', 'Blanc', 'Haddad', 'Moreau', 'Silva', 'North', 'Duval'];
const BAND_A = ['Les', 'The', 'Club', 'Projet', 'Studio', 'Velvet', 'Neon', 'Midnight', 'Paper', 'Golden'];
const BAND_B = ['Lunes Noires', 'Satellites', 'Avenue', 'Mirages', 'Tigres', 'Échos', 'Comètes', 'Horizons', 'Fantômes', 'Palmiers', 'Orages', 'Vagues'];
const MONO = ['KZR', 'Solène', 'MVRK', 'Ozo', 'Lumi', 'Dex', 'Nayah', 'Ruben K', 'Saïan', 'Vega', 'Tsuki', 'Bleu Nuit', 'Ombre', 'Kali', 'Pixel'];
const W1 = ['Nuit', 'Soleil', 'Ciel', 'Feu', 'Ville', 'Route', 'Pluie', 'Rêve', 'Lumière', 'Océan', 'Cœur', 'Ombre', 'Néon', 'Hiver', 'Été', 'Minuit', 'Métro', 'Étoile', 'Silence', 'Vertige'];
const W2 = ['Blue', 'Gold', 'Lost', 'Wild', 'Slow', 'Fast', 'Late', 'Young', 'Cold', 'Sweet', 'Neon', 'Electric', 'Quiet', 'Broken', 'Golden'];
const W3 = ['Lights', 'Hearts', 'Roads', 'Nights', 'Waves', 'Dreams', 'Streets', 'Skies', 'Days', 'Signals', 'Echoes', 'Rivers'];
const SHOWS = [['Le Débrief Ciné', 45], ['Science en 20 minutes', 22], ['Histoires vraies', 38]];

function makeCatalog(r) {
  const pick = a => a[Math.floor(r() * a.length)];
  const names = new Set();
  const artists = [];
  while (artists.length < 70) {
    const t = r();
    const name = t < 0.45 ? `${pick(FIRST)} ${pick(LAST)}` : t < 0.75 ? pick(MONO) + (r() < 0.3 ? ` ${pick(['Jr', 'II', 'X'])}` : '') : `${pick(BAND_A)} ${pick(BAND_B)}`;
    if (names.has(name)) continue;
    names.add(name);
    const albums = [];
    const nAl = 1 + Math.floor(r() * 3);
    const used = new Set();
    for (let a = 0; a < nAl; a++) {
      const single = r() < 0.25;
      const title = r() < 0.5 ? `${pick(W1)}${r() < 0.4 ? ' ' + pick(['Bleue', 'Infinie', 'Paradis', 'Sauvage', 'Tardive']) : ''}` : `${pick(W2)} ${pick(W3)}`;
      const n = single ? 1 : 6 + Math.floor(r() * 9);
      const tracks = [];
      for (let k = 0; k < n; k++) {
        let tt;
        do { tt = r() < 0.5 ? pick(W1) + (r() < 0.5 ? ` ${pick(['de nuit', 'pour toujours', 'en face', 'sans toi', 'à deux'])}` : '') : `${pick(W2)} ${pick(W3)}`; } while (used.has(tt));
        used.add(tt);
        tracks.push({ name: tt, len: 140 + Math.floor(r() * 120), pop: Math.pow(r(), 2.2) });
      }
      albums.push({ name: single ? tracks[0].name : title, tracks });
    }
    artists.push({ name, albums, pop: Math.pow(r(), 3), country: r() < 0.55 ? 'FR' : pick(['US', 'BE', 'GB', 'CA', 'DE']) });
  }
  return artists;
}

export function demoDocs() {
  const r = rng(20240611);
  const pick = a => a[Math.floor(r() * a.length)];
  const cat = makeCatalog(r);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const end = new Date(now.getTime() - 4 * 86400000);
  const start = new Date(end.getFullYear() - 3, 0, 1);
  const days = Math.round((end - start) / 86400000);
  // Les artistes apparaissent au fil du temps (découvertes), et chaque mois a son intensité.
  cat.forEach((a, i) => { a.debut = i < 25 ? 0 : Math.floor(r() * days); });
  const known = d => cat.filter(a => a.debut <= d);
  const monthBoost = Array.from({ length: Math.ceil(days / 30) + 2 }, () => 0.45 + r() * 1.2);
  // Ères : chaque période a ses artistes favoris.
  const eras = [];
  for (let d = 0; d < days;) { const len = 90 + Math.floor(r() * 180), pool = known(d + 30); eras.push({ from: d, to: d + len, fav: [pick(pool), pick(pool), pick(pool)] }); d += len; }
  const trips = [];
  for (let y = 0; y < 4; y++) for (let k = 0; k < 2; k++) { const d0 = y * 365 + 30 + Math.floor(r() * 300); trips.push({ from: d0, to: d0 + 3 + Math.floor(r() * 8), c: pick(['FR', 'ES', 'IT', 'NL', 'PT', 'US', 'DE']) }); }
  const obsessions = [];
  for (let k = 0; k < 14; k++) { const a = pick(cat), al = pick(a.albums); obsessions.push({ from: Math.floor(r() * days), len: 5 + Math.floor(r() * 9), t: { a, al, tr: pick(al.tracks) } }); }

  const audio = [], pods = [];
  const PLAT = ['ios', 'ios', 'ios', 'windows', 'windows', 'Partner SCEI sony_tv;ps4;;'];
  for (let d = 0; d <= days; d++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
    const dow = (date.getDay() + 6) % 7;
    const boost = monthBoost[Math.floor(d / 30)];
    if (r() < 0.12 / boost) continue; // jour sans musique
    const pool = known(d);
    const era = eras.find(e => d >= e.from && d < e.to) || eras[eras.length - 1];
    const trip = trips.find(t => d >= t.from && d <= t.to);
    const obs = obsessions.find(o => d >= o.from && d < o.from + o.len);
    const nSes = 1 + Math.floor(r() * (dow >= 5 ? 4 : 3) * boost);
    for (let s = 0; s < nSes; s++) {
      const slots = [8, 12, 17, 21, 23];
      let t = new Date(date.getTime() + (pick(slots) + r() * 2) * 3600000);
      const len = 3 + Math.floor(Math.pow(r(), 1.6) * 35);
      const plat = pick(PLAT), shuffle = r() < 0.3;
      let prevEnd = 'clickrow';
      let album = r() < 0.12 ? (() => { const a = pick(era.fav); return { a, al: pick(a.albums), i: 0 }; })() : null;
      for (let k = 0; k < len; k++) {
        let a, al, tr;
        if (album && album.i < album.al.tracks.length) { a = album.a; al = album.al; tr = al.tracks[album.i++]; }
        else if (obs && r() < 0.35) ({ a, al, tr } = obs.t);
        else {
          a = r() < 0.55 ? pick(era.fav) : (() => { let x; do { x = pick(pool); } while (r() > 0.15 + x.pop); return x; })();
          // Les singles ne reviennent pas à chaque fois : on privilégie les vrais albums.
          const full = a.albums.filter(x => x.tracks.length > 1);
          al = full.length && r() < 0.85 ? pick(full) : pick(a.albums);
          do { tr = pick(al.tracks); } while (r() > 0.25 + tr.pop);
        }
        const skip = r() < 0.2;
        const ms = (skip ? 4 + Math.floor(r() * 40) : tr.len - (r() < 0.1 ? Math.floor(r() * 60) : 0)) * 1000;
        t = new Date(t.getTime() + ms);
        const reasonEnd = skip ? 'fwdbtn' : r() < 0.08 ? 'endplay' : 'trackdone';
        audio.push({
          ts: t.toISOString().replace(/\.\d{3}Z$/, 'Z'), platform: plat, ms_played: ms, conn_country: trip ? trip.c : 'BE',
          master_metadata_track_name: tr.name, master_metadata_album_artist_name: a.name, master_metadata_album_album_name: al.name,
          spotify_track_uri: null, reason_start: k === 0 ? pick(['clickrow', 'playbtn', 'appload']) : prevEnd === 'fwdbtn' ? 'fwdbtn' : r() < 0.15 ? 'clickrow' : 'trackdone',
          reason_end: reasonEnd, shuffle, skipped: skip, offline: r() < 0.04,
        });
        prevEnd = reasonEnd;
        t = new Date(t.getTime() + (r() < 0.05 ? 60000 * (5 + r() * 20) : 1000));
      }
    }
    if (dow === 2 && r() < 0.6) {
      const [show, mins] = pick(SHOWS);
      const tt = new Date(date.getTime() + (7.5 + r()) * 3600000);
      pods.push({ ts: tt.toISOString().replace(/\.\d{3}Z$/, 'Z'), ms_played: Math.floor(mins * 60000 * (0.4 + 0.6 * r())), conn_country: 'BE', platform: 'ios', episode_name: `Épisode ${1 + Math.floor(d / 7)}`, episode_show_name: show, spotify_episode_uri: null });
    }
  }
  return [{ name: 'Streaming_History_Audio_demo.json', data: audio.concat(pods) }];
}
