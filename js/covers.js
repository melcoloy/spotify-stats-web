// Pochettes : on demande à Spotify (oEmbed public, sans clé) l'image des titres les plus écoutés.
// Si le navigateur ou le réseau bloque la requête, le site garde simplement les initiales.
import { DB, ranking } from './data.js';
import { store } from './ui.js';

const MAX = 200, WORKERS = 4, IMG = 'https://i.scdn.co/image/';

export async function loadCovers(onUpdate) {
  if (!DB.trackUri || DB.meta?.demo) return;
  const cache = store.get('covers', {});
  const top = ranking(DB.global, 'track', 'streams', 600).filter(e => DB.trackUri[e.id]);
  // Les titres les plus écoutés, plus un titre représentatif de chaque grand album.
  const want = [], seenAlbum = new Set();
  for (const e of top) {
    const al = DB.trackAlbum[e.id];
    if (want.length < MAX || !seenAlbum.has(al)) want.push(e.id);
    seenAlbum.add(al);
    if (want.length >= MAX * 1.5) break;
  }
  const apply = () => {
    const t = {}, al = {};
    for (const k of want) {
      const h = cache[DB.trackUri[k]];
      if (!h) continue;
      t[k] = h;
      if (!(DB.trackAlbum[k] in al)) al[DB.trackAlbum[k]] = h;
    }
    DB.covers = { t, al, a: {} };
  };
  apply();
  const todo = want.filter(k => !(DB.trackUri[k] in cache));
  if (!todo.length) { onUpdate?.(); return; }
  let blocked = false, done = 0;
  const one = async k => {
    const uri = DB.trackUri[k];
    try {
      const res = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/track/' + uri));
      if (!res.ok) { cache[uri] = null; return; }
      const url = (await res.json()).thumbnail_url || '';
      cache[uri] = url.startsWith(IMG) ? url.slice(IMG.length) : url || null;
    } catch {
      blocked = true; // CORS ou réseau : inutile d'insister
    }
  };
  const queue = todo.slice();
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    while (queue.length && !blocked) { await one(queue.shift()); done++; }
  }));
  store.set('covers', cache);
  if (done) { apply(); onUpdate?.(); }
}
