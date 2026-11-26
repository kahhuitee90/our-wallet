// Offline cache. Network first so updates show up, cache as fallback.
const CACHE = 'wallet-v2';
const FILES = ['./', 'index.html', 'app.js', 'split.js', 'sync.js', 'manifest.json', 'icon.svg'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));
self.addEventListener('fetch', (e) => {
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});
