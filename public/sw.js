const CACHE = 'lista-compra-v5';
const DATA_CACHE = 'lista-compra-data-v1';
const APP = ['./', 'app.css', 'app.js', 'manifest.webmanifest'];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP))));
self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE && key !== DATA_CACHE).map((key) => caches.delete(key))
  ))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (url.pathname.endsWith('/api/items')) {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(DATA_CACHE).then((cache) => cache.put(event.request, copy)));
      }
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }

  if (url.pathname.includes('/api/')) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
    return response;
  }).catch(() => caches.match(event.request)));
});

