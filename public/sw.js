/* ChatApp servis çalışanı — kapsam: /chatapp-standalone/
 * - Önbellek: derleme çıktısı (uygulama kabuğu, JS/CSS, yazı tipleri, ikonlar) kurulumda önbelleğe alınır;
 *   uygulama internetsiz açılır. Yeni sürüm hazır olunca sayfa "Yeni sürüm hazır — Yenile" bandı gösterir.
 * - push: yalnızca "data" yükü gelir; bildirimi her zaman bu dosya gösterir
 *   (iOS'ta bildirim göstermeden geçilen push aboneliğin iptaline yol açabilir).
 * - notificationclick: açık pencere varsa odaklanır ve sohbeti açtırır, yoksa yeni pencere açar.
 */
const APP_ROOT = '/chatapp-standalone/';
// Derleme sırasında vite.config.js doldurur (geliştirmede boş kalır).
const PRECACHE = self.__PRECACHE_MANIFEST__ || [];
const VERSION = self.__BUILD_VERSION__ || 'dev';
const CACHE = `chatapp-${VERSION}`;
const RUNTIME = 'chatapp-runtime';
const SHELL = APP_ROOT + 'index.html';
const ICON = APP_ROOT + 'icons/icon-192.png';
const BADGE = APP_ROOT + 'icons/badge-96.png';
const NAV_TIMEOUT_MS = 4000;
// Eski (paketlenmiş) sürümün önbellek adları: chatapp-v1 … chatapp-v13.
const isLegacyCache = (k) => /^chatapp-v\d+$/.test(k);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE.length ? PRECACHE : [APP_ROOT, ICON, BADGE]);
      // İlk kurulumda ve eski sürümden geçişte hemen etkinleş; sonraki güncellemelerde
      // kullanıcı "Yenile"ye basana kadar bekle.
      const legacy = (await caches.keys()).some(isLegacyCache);
      if (!self.registration.active || legacy) await self.skipWaiting();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const legacy = keys.some(isLegacyCache);
      await Promise.all(keys.filter((k) => k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k)));
      await self.clients.claim();
      // Eski sürümden geçiş: açık eski sayfaları yeni uygulamaya yeniden yükle.
      if (legacy) {
        const windows = await self.clients.matchAll({ type: 'window' });
        await Promise.all(windows.map((w) => w.navigate(w.url).catch(() => undefined)));
      }
    })()
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_ROOT)) return;

  if (req.mode === 'navigate') {
    // Uygulama sayfası: ağ öncelikli (4 sn), çevrimdışıysa önbellekteki kabuk.
    if (url.pathname.endsWith('.html') && !url.pathname.endsWith('/index.html')) {
      event.respondWith(fetch(req).catch(() => caches.match(req).then((r) => r || caches.match(SHELL))));
      return;
    }
    event.respondWith(
      Promise.race([fetch(req), timeout(NAV_TIMEOUT_MS)])
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(SHELL, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(SHELL)) || (await caches.match(APP_ROOT)) || Response.error())
    );
    return;
  }

  // Derleme çıktısı ve ikonlar: önbellek öncelikli.
  if (url.pathname.startsWith(APP_ROOT + 'assets/') || url.pathname.startsWith(APP_ROOT + 'icons/')) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res && res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches.open(RUNTIME).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
  }
  // Diğer her şey (geliştirme sunucusu modülleri dahil) doğrudan ağdan.
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
      // Test bildirimi her zaman sesli gösterilir (kullanıcı "çalışıyor mu?" diye bakıyor).
      const silent = data.type !== 'test' && (showingChat || focusedApp);

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
