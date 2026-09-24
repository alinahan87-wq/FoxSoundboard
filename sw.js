// Caches the app so it opens instantly and works with no internet.
// Bump VERSION whenever any of the files below change.
const VERSION = 'v28';
// The tablet app and the phone preview live on the same site, so each copy
// names its cache after its own address and only ever clears its own caches.
const PREFIX = `${self.registration.scope}#`;
const CACHE = PREFIX + VERSION;
const FILES = [
  './',
  'index.html',
  'style.css',
  'sounds.js',
  'celebrate.js',
  'colour.js',
  'fox.js',
  'numbers.js',
  'scratch.js',
  'bounce.js',
  'vendor/matter.min.js',
  'blocks.js',
  'stretch.js',
  'pattern.js',
  'circuit.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // clear this copy's older caches, plus old-style ones named just "v12" etc.
      .then((keys) => Promise.all(keys
        .filter((k) => (k.startsWith(PREFIX) && k !== CACHE) || /^v\d+$/.test(k))
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (so updates arrive when online), falling back to the cache when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.open(CACHE).then((c) => c.match(e.request, { ignoreSearch: true })))
  );
});
