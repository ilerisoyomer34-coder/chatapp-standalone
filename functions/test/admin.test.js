// adminSetUserDisabled callable testi (Auth + Realtime Database emülatörü).
// Çalıştırma (depo kökünden): npm run test:emulator
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const uid = (name) => (name + '0'.repeat(28)).slice(0, 28);
const ADMIN = uid('admin');
const ALICE = uid('alice');
const OTHER_ADMIN = uid('boss');
const NS = 'admin-test';

let fn;
let db;
let auth;

beforeAll(async () => {
  process.env.FIREBASE_DATABASE_EMULATOR_HOST ||= '127.0.0.1:9000';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
  process.env.GCLOUD_PROJECT = 'demo-chatapp';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-chatapp', databaseURL: `http://127.0.0.1:9000?ns=${NS}` });
  const mod = await import('../lib/index.js');
  fn = mod.adminSetUserDisabled;
  const { getDatabaseWithUrl } = await import('firebase-admin/database');
  const { getAuth } = await import('firebase-admin/auth');
  // Fonksiyonlar veritabanına açık adresle bağlanır (ad alanı: chatapp-d8a5b-default-rtdb).
  db = getDatabaseWithUrl('https://chatapp-d8a5b-default-rtdb.europe-west1.firebasedatabase.app');
  auth = getAuth();
});

beforeEach(async () => {
  await db.ref().set({
    admins: { [ADMIN]: true, [OTHER_ADMIN]: true },
    users: {
      [ADMIN]: { username: 'yonetici', name: 'Yönetici', createdAt: 1 },
      [ALICE]: { username: 'alice', name: 'Alice', createdAt: 1 },
      [OTHER_ADMIN]: { username: 'boss', name: 'Boss', createdAt: 1 },
    },
    pushTokens: { [ALICE]: { ['t'.repeat(40)]: { platform: 'android', updatedAt: 1 } } },
  });
  for (const id of [ADMIN, ALICE, OTHER_ADMIN]) {
    await auth.deleteUser(id).catch(() => {});
    await auth.createUser({ uid: id, email: `${id.slice(0, 6)}@example.com`, password: 'sifre1234' });
  }
});

const call = (callerUid, data) => fn.run({ auth: callerUid ? { uid: callerUid, token: {} } : undefined, data, rawRequest: {} });

describe('adminSetUserDisabled', () => {
  it('yönetici kullanıcıyı devre dışı bırakır, işaretler ve tokenlarını siler', async () => {
    await expect(call(ADMIN, { uid: ALICE, disabled: true })).resolves.toEqual({ ok: true });
    expect((await auth.getUser(ALICE)).disabled).toBe(true);
    const u = (await db.ref(`users/${ALICE}`).get()).val();
    expect(u.disabled).toBe(true);
    expect(u.disabledBy).toBe(ADMIN);
    expect((await db.ref(`pushTokens/${ALICE}`).get()).exists()).toBe(false);
  });

  it('geri alınca hesap açılır ve işaret kalkar', async () => {
    await call(ADMIN, { uid: ALICE, disabled: true });
    await call(ADMIN, { uid: ALICE, disabled: false });
    expect((await auth.getUser(ALICE)).disabled).toBe(false);
    const u = (await db.ref(`users/${ALICE}`).get()).val();
    expect(u.disabled).toBeUndefined();
    expect(u.disabledAt).toBeUndefined();
  });

  it('yönetici olmayan çağıramaz', async () => {
    await expect(call(ALICE, { uid: ADMIN, disabled: true })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('giriş yapmamış çağıramaz', async () => {
    await expect(call(null, { uid: ALICE, disabled: true })).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('başka yönetici veya kendisi çıkarılamaz', async () => {
    await expect(call(ADMIN, { uid: OTHER_ADMIN, disabled: true })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(call(ADMIN, { uid: ADMIN, disabled: true })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('geçersiz girdi reddedilir', async () => {
    await expect(call(ADMIN, { uid: '../x', disabled: true })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call(ADMIN, { uid: ALICE, disabled: 'evet' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
