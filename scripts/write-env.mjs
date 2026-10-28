#!/usr/bin/env node
// CI: GitHub "Secrets" veya "Variables" içindeki Firebase web yapılandırmasını
// .env.production.local dosyasına yazar ve eksikleri denetler. Değerler ekrana yazılmaz.
//
// Projeye özgü ama gizli olmayan değerler (alan adı, veritabanı adresi, proje kimliği…)
// varsayılan olarak buradan gelir; GitHub'da yalnızca API anahtarı, uygulama kimliği ve
// VAPID açık anahtarının tanımlanması yeter.
//
// REQUIRE_CONFIG=true iken (main dalına yayın) eksik değer derlemeyi durdurur; böylece
// yapılandırmasız, çalışmayan bir sürüm yayına çıkmaz.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEFAULTS = {
  VITE_FIREBASE_AUTH_DOMAIN: 'chatapp-d8a5b.firebaseapp.com',
  VITE_FIREBASE_DATABASE_URL: 'https://chatapp-d8a5b-default-rtdb.europe-west1.firebasedatabase.app',
  VITE_FIREBASE_PROJECT_ID: 'chatapp-d8a5b',
  VITE_FIREBASE_STORAGE_BUCKET: 'chatapp-d8a5b.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '968851351219',
};

export const REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_VAPID_KEY',
];

export const OPTIONAL = ['VITE_RECAPTCHA_SITE_KEY', 'VITE_PUSH_WORKER_URL'];

// Ortamdaki boş olmayan değerler varsayılanların üzerine yazılır.
export function buildEnv(source) {
  const values = { ...DEFAULTS };
  for (const key of [...REQUIRED, ...OPTIONAL]) {
    const v = typeof source[key] === 'string' ? source[key].trim() : '';
    if (v) values[key] = v;
  }
  const missing = REQUIRED.filter((k) => !values[k]);
  const problems = [];
  if (values.VITE_FIREBASE_API_KEY && !/^AIza[0-9A-Za-z_-]{35}$/.test(values.VITE_FIREBASE_API_KEY)) {
    problems.push('VITE_FIREBASE_API_KEY "AIza" ile başlayan 39 karakterlik anahtar olmalı');
  }
  if (values.VITE_FIREBASE_APP_ID && !/^1:\d+:web:[0-9a-f]+$/.test(values.VITE_FIREBASE_APP_ID)) {
    problems.push('VITE_FIREBASE_APP_ID "1:<sayı>:web:<onaltılık>" biçiminde olmalı');
  }
  if (values.VITE_FIREBASE_VAPID_KEY && !/^[A-Za-z0-9_-]{80,100}$/.test(values.VITE_FIREBASE_VAPID_KEY)) {
    problems.push('VITE_FIREBASE_VAPID_KEY, Cloud Messaging → Web Push sertifikaları\'ndaki "Anahtar çifti" (yaklaşık 88 karakter) olmalı');
  }
  const text = Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  return { values, missing, problems, text: text + '\n' };
}

function main() {
  const strict = process.env.REQUIRE_CONFIG === 'true';
  const { missing, problems, text } = buildEnv(process.env);
  writeFileSync('.env.production.local', text);
  const issues = [...missing.map((k) => `${k} tanımlı değil`), ...problems];
  if (!issues.length) {
    console.log('Firebase yapılandırması tamam (.env.production.local yazıldı).');
    return;
  }
  const level = strict ? 'error' : 'warning';
  for (const issue of issues) console.log(`::${level}::${issue}`);
  console.log(
    `::${level}::Depo → Settings → Secrets and variables → Actions bölümüne eksik değerleri ekle (ayrıntı: docs/TELEFONA-BILDIRIM.md).`
  );
  if (strict) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
