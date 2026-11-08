/* ATLAS CAD service worker (generated at build time from src/sw-template.js) */
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = 'atlas-' + VERSION;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', ...FILES])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => {
        const old = keys.filter((k) => k.startsWith('atlas-') && k !== CACHE);
        return Promise.all(old.map((k) => caches.delete(k))).then(() => old.length > 0);
      })
      .then((hadOldCache) => self.clients.claim().then(() => hadOldCache))
      .then((hadOldCache) => {
        if (!hadOldCache) return;
        // Existing tabs may still be showing the previous bundle. Reload them
        // once the new worker controls the page so the update is truly automatic.
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) =>
          Promise.all(clients.map((client) => client.navigate(client.url).catch(() => {}))),
        );
      }),
  );
});

// Ask the app to skip waiting when a new worker is ready (no data loss: state is in IndexedDB).
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// Hashed assets are cache-first, but the document itself must always be checked online.
// Otherwise an old index.html can keep loading old JavaScript forever after a deploy.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  if (url.pathname.endsWith('version.json')) return; // never cache the build number
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => res.ok ? res : Promise.reject(new Error('navigation failed')))
        .catch(() => caches.match('./', { cacheName: CACHE, ignoreVary: true }).then((hit) => hit || caches.match(req, { cacheName: CACHE, ignoreVary: true }))),
    );
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
