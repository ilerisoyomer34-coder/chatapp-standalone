// Servis çalışanı kaydı, güncelleme bandı ve servis çalışanından gelen "open-chat" mesajları.
const BASE = import.meta.env.BASE_URL; // "/chatapp-standalone/"
const UPDATE_CHECK_MS = 30 * 60 * 1000;
let registrationPromise = null;
let waitingWorker = null;
const updateListeners = new Set();

function setWaiting(worker) {
  waitingWorker = worker;
  updateListeners.forEach((fn) => fn(!!worker));
}

// Yeni sürüm kurulup beklemeye geçince bant gösterilir. İlk kurulumda (sayfayı henüz
// hiçbir servis çalışanı yönetmiyorken) bant çıkmaz.
function watchForUpdates(reg) {
  if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker);
    });
  });
  const check = () => reg.update().catch(() => undefined);
  setInterval(check, UPDATE_CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(`${BASE}sw.js`, { scope: BASE })
      .then((reg) => {
        watchForUpdates(reg);
        return reg;
      })
      .catch((err) => {
        console.error('[ChatApp] servis çalışanı kaydedilemedi', err);
        return null;
      });
  }
  return registrationPromise;
}

// Bant için: yeni sürüm hazır mı? Abonelik iptal fonksiyonu döner.
export function onUpdateReady(fn) {
  updateListeners.add(fn);
  fn(!!waitingWorker);
  return () => updateListeners.delete(fn);
}

// "Yenile": bekleyen sürümü etkinleştir, denetim geçince sayfayı bir kez yenile.
export function applyUpdate() {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

export async function getServiceWorkerRegistration() {
  const reg = await registerServiceWorker();
  if (!reg) return null;
  // Etkin olana kadar bekle (getToken etkin bir servis çalışanı ister).
  if (reg.active) return reg;
  return navigator.serviceWorker.ready;
}

export function onServiceWorkerMessage(handler) {
  if (!('serviceWorker' in navigator)) return () => {};
  const listener = (event) => handler(event.data || {});
  navigator.serviceWorker.addEventListener('message', listener);
  return () => navigator.serviceWorker.removeEventListener('message', listener);
}

// Adres çubuğundaki ?chat=<id> parametresini okur/günceller. Servis çalışanı
// görünür pencerenin hangi sohbeti gösterdiğini bu adresten anlar.
export function readChatParam() {
  try {
    return new URL(window.location.href).searchParams.get('chat');
  } catch {
    return null;
  }
}

export function writeChatParam(chatId) {
  try {
    const url = new URL(window.location.href);
    if (chatId) url.searchParams.set('chat', chatId);
    else url.searchParams.delete('chat');
    url.searchParams.delete('source');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* yok say */
  }
}
