const CACHE_NAME = 'chatapp-v6';
const APP_ROOT = '/chatapp-standalone/';
const APP_SHELL = APP_ROOT + 'index.html';
const ASSETS = [
  APP_ROOT,
  APP_SHELL,
  APP_ROOT + 'manifest.json',
  APP_ROOT + 'manifest-v5.json',
  APP_ROOT + 'icons/icon-v5-180.png',
  APP_ROOT + 'icons/icon-v5-192.png',
  APP_ROOT + 'icons/icon-v5-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => response.ok ? response : caches.match(APP_SHELL))
        .catch(() => caches.match(APP_SHELL))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
