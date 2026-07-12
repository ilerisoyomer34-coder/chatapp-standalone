const CACHE_NAME = 'chatapp-v13';
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
      caches.match(APP_SHELL).then((cached) => {
        const fresh = fetch(event.request).then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(APP_SHELL, response.clone()));
          }
          return response;
        }).catch(() => cached);
        if (cached) event.waitUntil(fresh);
        return cached || fresh;
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) { payload = {}; }
  const notif = payload.notification || {};
  const data = payload.data || {};
  const title = notif.title || 'ChatApp';
  const body = notif.body || 'Yeni mesaj';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: APP_ROOT + 'icons/icon-v5-192.png',
      badge: APP_ROOT + 'icons/icon-v5-192.png',
      tag: data.chatId ? 'chat-' + data.chatId : undefined,
      renotify: !!data.chatId,
      data,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(APP_ROOT) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(APP_ROOT);
    })
  );
});
