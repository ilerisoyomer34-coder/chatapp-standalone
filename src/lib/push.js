// Web Push (Firebase Cloud Messaging) istemci tarafı.
// İzin yalnızca kullanıcının dokunduğu "Bildirimleri aç" düğmesiyle istenir.
import { get, ref, serverTimestamp, update } from 'firebase/database';
import { app, db, PUSH_WORKER_URL, VAPID_KEY } from '../firebase.js';
import { getServiceWorkerRegistration } from './sw.js';

const TOKEN_KEY = 'chatapp_fcm_token';

export function deviceInfo() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const standalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  return {
    isIOS,
    isAndroid,
    standalone,
    supported,
    // iOS'ta web push yalnızca ana ekrana eklenmiş uygulamada (iOS 16.4+) çalışır.
    needsInstall: isIOS && !standalone,
    platform: isIOS ? 'ios' : isAndroid ? 'android' : 'desktop',
  };
}

// 'granted' | 'denied' | 'default' | 'unsupported' | 'needs-install'
export function permissionState() {
  const info = deviceInfo();
  if (info.needsInstall) return 'needs-install';
  if (!info.supported) return 'unsupported';
  return Notification.permission;
}

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeStored(value) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, JSON.stringify(value));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* depolama kapalı olabilir */
  }
}

async function messagingModule() {
  const mod = await import('firebase/messaging');
  if (!(await mod.isSupported())) return null;
  return { mod, messaging: mod.getMessaging(app) };
}

// İzin verilmişse token al ve pushTokens/{uid}/{token} altına yaz.
// Her açılışta çağrılır: token değiştiyse eskisi silinir.
export async function syncPushToken(uid) {
  if (!uid || permissionState() !== 'granted') return null;
  if (!VAPID_KEY) {
    console.error('[ChatApp] VITE_FIREBASE_VAPID_KEY eksik; bildirim token\'ı alınamadı.');
    return null;
  }
  const m = await messagingModule();
  if (!m) return null;
  const registration = await getServiceWorkerRegistration();
  if (!registration) return null;
  const token = await m.mod.getToken(m.messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) return null;
  const prev = readStored();
  const updates = {
    [`pushTokens/${uid}/${token}`]: { platform: deviceInfo().platform, updatedAt: serverTimestamp() },
  };
  if (prev && prev.uid === uid && prev.token && prev.token !== token) {
    updates[`pushTokens/${uid}/${prev.token}`] = null;
  }
  await update(ref(db), updates);
  writeStored({ uid, token });
  return token;
}

// Bu cihazın bu hesaba kayıtlı token'ı (yoksa null).
export function deviceToken(uid) {
  const stored = readStored();
  return stored && stored.uid === uid ? stored.token : null;
}

// "Bildirim sorun giderme" listesi: telefona bildirim gelmiyorsa hangi halkanın eksik olduğunu gösterir.
export async function pushDiagnostics(uid) {
  const info = deviceInfo();
  const permission = permissionState();
  let swActive = false;
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL) : null;
    swActive = !!(reg && reg.active);
  } catch {
    swActive = false;
  }
  const token = deviceToken(uid);
  let registered = false;
  if (token) {
    try {
      registered = (await get(ref(db, `pushTokens/${uid}/${token}`))).exists();
    } catch {
      registered = false;
    }
  }
  return {
    supported: info.supported,
    needsInstall: info.needsInstall,
    permission,
    swActive,
    vapid: !!VAPID_KEY,
    registered,
    server: PUSH_WORKER_URL ? 'worker' : 'functions',
  };
}

export async function enablePush(uid) {
  const state = permissionState();
  if (state === 'unsupported' || state === 'needs-install') return state;
  const result = await Notification.requestPermission();
  if (result === 'granted') await syncPushToken(uid);
  return result;
}

// Çıkışta: token'ı veritabanından sil ve deleteToken() ile FCM aboneliğini kaldır.
export async function removePushToken(uid) {
  const stored = readStored();
  writeStored(null);
  if (!stored || !stored.token) return; // bu cihazda bildirim hiç açılmamış
  try {
    await update(ref(db), { [`pushTokens/${stored.uid || uid}/${stored.token}`]: null });
  } catch (err) {
    console.warn('[ChatApp] push token silinemedi', err);
  }
  try {
    const m = await messagingModule();
    const registration = await getServiceWorkerRegistration();
    if (!m || !registration) return;
    // deleteToken bizim servis çalışanımızı bilsin diye önce aynı kayıtla getToken çağrılır
    // (token önbellekteyse ağ isteği yapılmaz); yoksa varsayılan firebase-messaging-sw.js aranır.
    if (Notification.permission === 'granted') {
      await m.mod.getToken(m.messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
      await m.mod.deleteToken(m.messaging);
    } else {
      const sub = await registration.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    }
  } catch (err) {
    console.warn('[ChatApp] deleteToken', err);
  }
}

export async function setAppBadge(count) {
  try {
    if (count > 0 && navigator.setAppBadge) await navigator.setAppBadge(count);
    else if (navigator.clearAppBadge) await navigator.clearAppBadge();
  } catch {
    /* rozet desteklenmiyor */
  }
}
