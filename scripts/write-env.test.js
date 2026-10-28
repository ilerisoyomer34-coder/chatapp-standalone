import { describe, expect, it } from 'vitest';
import { buildEnv, DEFAULTS } from './write-env.mjs';

const KEY = 'AIza' + 'a'.repeat(35);
const APP = '1:968851351219:web:2b26dce1541d86740ef2c6';
const VAPID = 'B' + 'x'.repeat(86);

describe('buildEnv', () => {
  it('yalnızca API anahtarı, uygulama kimliği ve VAPID yeterli', () => {
    const r = buildEnv({ VITE_FIREBASE_API_KEY: KEY, VITE_FIREBASE_APP_ID: APP, VITE_FIREBASE_VAPID_KEY: VAPID });
    expect(r.missing).toEqual([]);
    expect(r.problems).toEqual([]);
    expect(r.values.VITE_FIREBASE_PROJECT_ID).toBe(DEFAULTS.VITE_FIREBASE_PROJECT_ID);
    expect(r.text).toContain(`VITE_FIREBASE_VAPID_KEY=${VAPID}\n`);
  });

  it('boş değerler eksik sayılır, boşluklar kırpılır', () => {
    const r = buildEnv({ VITE_FIREBASE_API_KEY: '  ', VITE_FIREBASE_APP_ID: ` ${APP} ` });
    expect(r.missing).toEqual(['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_VAPID_KEY']);
    expect(r.values.VITE_FIREBASE_APP_ID).toBe(APP);
  });

  it('yanlış biçimli değerleri (ör. VAPID yerine gizli anahtar) yakalar', () => {
    const r = buildEnv({ VITE_FIREBASE_API_KEY: 'abc', VITE_FIREBASE_APP_ID: APP, VITE_FIREBASE_VAPID_KEY: 'kisa' });
    expect(r.problems).toHaveLength(2);
  });

  it('ortamdaki değer varsayılanı geçersiz kılar', () => {
    const r = buildEnv({ VITE_FIREBASE_PROJECT_ID: 'baska-proje' });
    expect(r.values.VITE_FIREBASE_PROJECT_ID).toBe('baska-proje');
  });
});
