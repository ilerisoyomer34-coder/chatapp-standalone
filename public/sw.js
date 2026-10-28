/* ChatApp servis çalışanı — kapsam: /chatapp-standalone/
 * - push: yalnızca "data" yükü gelir; bildirimi her zaman bu dosya gösterir
 *   (iOS'ta bildirim göstermeden geçilen push aboneliğin iptaline yol açabilir).
 * - notificationclick: açık pencere varsa odaklanır ve sohbeti açtırır, yoksa yeni pencere açar.
 * - fetch: basit önbellek (uygulama kabuğu ağ öncelikli, statik dosyalar önbellekten).
 */
const APP_ROOT = '/chatapp-standalone/';
const CACHE_NAME = 'chatapp-v2-1';
const ICON = APP_ROOT + 'icons/icon-v5-192.png';
const BADGE = APP_ROOT + 'icons/badge-96.png';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([APP_ROOT, ICON, BADGE]))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_ROOT)) return;

  if (req.mode === 'navigate') {
    // Ağ öncelikli; çevrimdışıysa son kopya.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(APP_ROOT, copy));
          }
          return res;
        })
        .catch(() => caches.match(APP_ROOT).then((r) => r || Response.error()))
    );
    return;
  }

  // Yalnızca derlenmiş (içerik özetli adlı) dosyalar ve ikonlar önbellekten: geliştirme
  // sunucusundaki kaynak modülleri ve diğer her şey doğrudan ağdan gelir.
  if (!url.pathname.startsWith(APP_ROOT + 'assets/') && !url.pathname.startsWith(APP_ROOT + 'icons/')) return;
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});

function parsePayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch (e) {
    return { data: { body: event.data.text() } };
  }
}

function chatIdOfClient(client) {
  try {
    return new URL(client.url).searchParams.get('chat');
  } catch (e) {
    return null;
  }
}

self.addEventListener('push', (event) => {
  const payload = parsePayload(event);
  const data = payload.data || {};
  const fallback = payload.notification || {};
  const title = data.title || fallback.title || 'ChatApp';
  const body = data.body || fallback.body || 'Yeni mesaj';
  const chatId = data.chatId || '';
  const tag = data.tag || (chatId ? 'chat-' + chatId : 'chatapp');

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visible = windows.filter((c) => c.visibilityState === 'visible');
      // Görünür bir pencere bu sohbeti gösteriyorsa sessiz göster. Uygulama açık ve odakta
      // ama başka ekrandaysa da sessiz: o durumda uygulama içi bant ve kısa ses çalar.
      const showingChat = !!chatId && visible.some((c) => chatIdOfClient(c) === chatId);
      const focusedApp = visible.some((c) => c.focused);
      const silent = showingChat || focusedApp;

      if (data.badge && self.navigator && self.navigator.setAppBadge) {
        const n = Number(data.badge);
        if (n > 0) self.navigator.setAppBadge(n).catch(() => undefined);
      }

      await self.registration.showNotification(title, {
        body,
        icon: ICON,
        badge: BADGE,
        tag,
        renotify: true,
        silent,
        lang: 'tr',
        timestamp: Number(data.ts) || Date.now(),
        data: { chatId, type: data.type || 'message', url: data.url || '' },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const info = event.notification.data || {};
  const chatId = info.chatId || '';
  const target = chatId ? APP_ROOT + '?chat=' + encodeURIComponent(chatId) : APP_ROOT;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows.find((c) => new URL(c.url).pathname.startsWith(APP_ROOT));
      if (client) {
        await client.focus();
        client.postMessage(chatId ? { type: 'open-chat', chatId } : { type: 'open-requests' });
        return;
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })()
  );
});
