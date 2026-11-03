// Service worker : le site reste utilisable sans internet une fois ouvert une première fois.
// Fichiers du site : réseau d'abord (les modifications s'affichent tout de suite),
// copie locale si le réseau ne répond pas. Pochettes : copie locale d'abord.
const VERSION = 'spotify-stats-web-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'css/fonts.css',
  'js/main.js',
  'js/data.js',
  'js/ui.js',
  'js/charts.js',
  'js/importer.js',
  'js/store.js',
  'js/demo.js',
  'js/covers.js',
  'js/vendor/fflate.js',
  'data/world.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/views/albums.js',
  'js/views/calendrier.js',
  'js/views/cejour.js',
  'js/views/common.js',
  'js/views/comparer.js',
  'js/views/entity.js',
  'js/views/explore.js',
  'js/views/games.js',
  'js/views/jour.js',
  'js/views/obsessions.js',
  'js/views/overview.js',
  'js/views/podcasts.js',
  'js/views/radio.js',
  'js/views/rankings.js',
  'js/views/reseau.js',
  'js/views/sessions.js',
  'js/views/timeline.js',
  'js/views/voyages.js',
  'js/views/wrapped.js',
  'fonts/bricolage-grotesque-latin-500-normal.woff2',
  'fonts/bricolage-grotesque-latin-800-normal.woff2',
  'fonts/bricolage-grotesque-latin-ext-500-normal.woff2',
  'fonts/bricolage-grotesque-latin-ext-800-normal.woff2',
  'fonts/figtree-latin-400-normal.woff2',
  'fonts/figtree-latin-500-normal.woff2',
  'fonts/figtree-latin-700-normal.woff2',
  'fonts/figtree-latin-ext-400-normal.woff2',
  'fonts/figtree-latin-ext-500-normal.woff2',
  'fonts/figtree-latin-ext-700-normal.woff2',
  'fonts/jetbrains-mono-latin-500-normal.woff2',
  'fonts/jetbrains-mono-latin-ext-500-normal.woff2',
];
const IMAGES = 'spotify-stats-web-images';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== IMAGES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'i.scdn.co' || url.hostname.endsWith('.spotifycdn.com')) {
    e.respondWith(caches.open(IMAGES).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
