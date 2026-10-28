import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase } from 'firebase/database';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

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
export const functions = getFunctions(app, FUNCTIONS_REGION);

// Yalnızca yerel geliştirme: `firebase emulators:start` ile birlikte VITE_USE_EMULATORS=true.
if (env.DEV && env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
