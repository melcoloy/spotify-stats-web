// Lecture de l'export « Données du compte » de Spotify (Wrapped officiel, portrait de goûts,
// catégories publicitaires, recherches, playlists, bibliothèque).
// Les fichiers d'identité et de paiement ne sont jamais lus.

// Fichiers utiles de l'export, repérés par leur nom.
export const ACCOUNT_FILES = /^(Wrapped\d{4}|TasteProfile|Inferences|Marquee|SearchQueries|Playlist\d+|YourLibrary)\.json$/i;

const idOf = uri => (uri || '').split(':').pop();

// files : { nomDeFichier: contenuJSON }, extraNames : { idArtisteSpotify: nom } connus par ailleurs.
export function buildAccount(files, extraNames = {}) {
  const get = re => Object.entries(files).filter(([n]) => re.test(n)).sort(([a], [b]) => a.localeCompare(b));
  const one = re => { const x = get(re); return x.length ? x[x.length - 1] : null; };
  const acc = { artistNames: { ...extraNames } };

  const lib = one(/^YourLibrary\.json$/i)?.[1];
  if (lib) {
    for (const a of lib.artists || []) if (a.uri) acc.artistNames[idOf(a.uri)] = a.name;
    acc.library = {
      tracks: (lib.tracks || []).map(t => [t.track, t.artist, idOf(t.uri)]),
      albums: (lib.albums || []).map(a => [a.album, a.artist]),
      artists: (lib.artists || []).map(a => [a.name, idOf(a.uri)]),
    };
  }

  const wr = one(/^Wrapped\d{4}\.json$/i);
  if (wr) {
    const [name, w] = wr;
    const p = w.party || {};
    acc.wrapped = {
      year: +name.match(/\d{4}/)[0],
      minutes: p.totalNumListeningMinutes ?? Math.round((w.yearlyMetrics?.totalMsListened || 0) / 60000),
      days: p.totalNumListeningDays, streak: p.streakNumListeningDays,
      artists: w.topArtists?.numUniqueArtists, discovered: p.numArtistsDiscovered,
      topFanPct: w.topArtists?.topNPercentileFan, topArtistShare: p.percentListenedTopArtist,
      skips: p.percentMusicSkips, night: p.percentListenedNight, explicit: p.percentListenedExplicit,
      popularity: p.avgTrackPopularityScore, multilingual: p.multilinguistRankingScore,
      moods: { party: p.percentPartyTracks, love: p.percentLoveTracks, chill: p.percentChillTracks },
      listeningAge: w.listeningAge?.listeningAge, ageWindow: w.listeningAge?.windowStartYear, agePhase: w.listeningAge?.decadePhase,
      club: w.clubs ? { name: w.clubs.userClub, role: w.clubs.role, pct: w.clubs.percentInClub, artists: (w.clubs.artists || []).map(idOf) } : null,
      genres: w.topGenres?.totalNumGenres, albumsCompleted: w.topAlbums?.numCompletedAlbums,
      podcastMinutes: Math.round((w.topPodcasts?.totalPodcastMilliseconds || 0) / 60000),
      topArtists: (w.topArtists?.topArtistUris || []).map(idOf),
      topTracks: (w.topTracks?.topTracks || []).map(t => ({ id: idOf(t.trackUri), count: t.count, ms: t.msPlayed })),
      race: (w.topArtistRace?.topArtists || []).map(a => ({ id: idOf(a.artistUri), ranks: (a.monthsStats || []).map(m => [m.month, m.rank]) })),
      highlights: (w.archiveReports?.archiveReports || []).map(r => ({
        date: `${r.columnQualifier.slice(0, 4)}-${r.columnQualifier.slice(4, 6)}-${r.columnQualifier.slice(6, 8)}`,
        reason: r.reason, title: r.title, description: r.description,
      })).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  const tp = one(/^TasteProfile\.json$/i)?.[1]?.tasteProfile;
  if (tp) acc.taste = { music: tp.musicalIdentity, podcast: tp.podcastTaste, rhythm: tp.contentRhythms, artists: (tp.artistUris || []).map(idOf) };

  const inf = one(/^Inferences\.json$/i)?.[1]?.inferences;
  if (inf) acc.inferences = inf;

  const mq = one(/^Marquee\.json$/i)?.[1];
  if (mq) acc.marquee = mq.map(x => [x.artistName, x.segment]);

  const sq = one(/^SearchQueries\.json$/i)?.[1];
  if (sq) {
    const count = new Map(), months = new Map();
    let first = null, last = null;
    for (const q of sq) {
      const t = (q.searchTime || '').slice(0, 10);
      if (t) { if (!first || t < first) first = t; if (!last || t > last) last = t; months.set(t.slice(0, 7), (months.get(t.slice(0, 7)) || 0) + 1); }
      const s = (q.searchQuery || '').trim().toLowerCase();
      if (s.length >= 3) count.set(s, (count.get(s) || 0) + 1);
    }
    // On ne garde que des agrégats, pas la liste brute des recherches.
    acc.searches = { total: sq.length, first, last, top: [...count].sort((a, b) => b[1] - a[1]).slice(0, 40), months: [...months].sort() };
  }

  const pls = get(/^Playlist\d+\.json$/i).flatMap(([, d]) => d.playlists || []);
  if (pls.length) acc.playlists = pls.map(p => ({
    name: p.name, modified: p.lastModifiedDate, followers: p.numberOfFollowers || 0,
    tracks: (p.items || []).filter(i => i.track).map(i => [i.track.trackName, i.track.artistName, idOf(i.track.trackUri), i.addedDate]),
  }));
  return acc;
}
