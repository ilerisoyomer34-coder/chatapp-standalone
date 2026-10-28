// Servis çalışanı kaydı ve servis çalışanından gelen "open-chat" mesajları.
const BASE = import.meta.env.BASE_URL; // "/chatapp-standalone/"
let registrationPromise = null;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(`${BASE}sw.js`, { scope: BASE })
      .catch((err) => {
        console.error('[ChatApp] servis çalışanı kaydedilemedi', err);
        return null;
      });
  }
  return registrationPromise;
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
