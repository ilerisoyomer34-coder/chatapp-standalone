import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase } from 'firebase/database';

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const VAPID_KEY = env.VITE_FIREBASE_VAPID_KEY || '';
export const PUSH_WORKER_URL = (env.VITE_PUSH_WORKER_URL || '').replace(/\/+$/, '');
export const FUNCTIONS_REGION = 'europe-west1';

const missing = Object.entries(firebaseConfig)
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error('[ChatApp] Eksik Firebase yapılandırması (.env):', missing.join(', '));
}

export const app = initializeApp(firebaseConfig);

// App Check (reCAPTCHA v3): site anahtarı verilmişse başlat.
if (env.VITE_RECAPTCHA_SITE_KEY) {
  if (env.DEV && env.VITE_APPCHECK_DEBUG === 'true') {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(env.VITE_RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.error('[ChatApp] App Check başlatılamadı', err);
  }
}

// getAuth tarayıcıda IndexedDB kalıcılığı kullanır: uygulama kapansa da oturum düşmez.
export const auth = getAuth(app);
auth.languageCode = 'tr';

export const db = getDatabase(app);

// Yalnızca yerel geliştirme: `firebase emulators:start` ile birlikte VITE_USE_EMULATORS=true.
export const USE_EMULATORS = !!(env.DEV && env.VITE_USE_EMULATORS === 'true');
if (USE_EMULATORS) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
}

// Functions ve Storage SDK'ları ilk ihtiyaçta yüklenir (ilk açılış paketi küçük kalsın).
let functionsPromise = null;
export function getFunctionsLazy() {
  if (!functionsPromise) {
    functionsPromise = import('firebase/functions').then((m) => {
      const f = m.getFunctions(app, FUNCTIONS_REGION);
      if (USE_EMULATORS) m.connectFunctionsEmulator(f, '127.0.0.1', 5001);
      return { f, httpsCallable: m.httpsCallable };
    });
  }
  return functionsPromise;
}

let storagePromise = null;
export function getStorageLazy() {
  if (!storagePromise) {
    storagePromise = import('firebase/storage').then((m) => {
      const s = m.getStorage(app);
      if (USE_EMULATORS) m.connectStorageEmulator(s, '127.0.0.1', 9199);
      return { s, m };
    });
  }
  return storagePromise;
}
