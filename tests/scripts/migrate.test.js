// Geçiş betiği testi (Realtime Database emülatörü).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { chats, link, normalizeUsername, reserve } from '../../scripts/migrate-legacy.mjs';

let db;
let app;
const NEW_OMER = 'omer000000000000000000000000';
const NEW_ALI = 'ali0000000000000000000000000';

const legacy = {
  users: {
    'ömer': { username: 'ömer', name: 'Ömer', pass: '1234' },
    'ali_çelik': { username: 'ali_çelik', name: 'Ali', pass: 'x' },
    ab: { username: 'ab', name: 'Kısa', pass: 'x' },
  },
  chats: [{ id: 'c1', members: ['ömer', 'ali_çelik'], ts: 100 }],
  messages: {
    c1: [
      { id: 'm0', system: true, text: 'Grup kuruldu', ts: 100 },
      { id: 'm1', from: 'ömer', text: 'Selam', ts: 200 },
      { id: 'm2', from: 'ali_çelik', text: '', attachment: { name: 'a.pdf', data: 'data:...' }, ts: 300 },
    ],
  },
};

beforeAll(async () => {
  process.env.FIREBASE_DATABASE_EMULATOR_HOST ||= '127.0.0.1:9000';
  app = initializeApp({ projectId: 'demo-chatapp', databaseURL: 'http://127.0.0.1:9000?ns=migrate-test' }, 'migrate-test');
  db = getDatabase(app);
  await db.ref().set({
    db: legacy,
    users: {
      [NEW_OMER]: { username: 'omer_yeni', name: 'Ömer', createdAt: 1 },
      [NEW_ALI]: { username: 'ali_yeni', name: 'Ali', createdAt: 1 },
    },
    usernames: { omer_yeni: NEW_OMER, ali_yeni: NEW_ALI },
  });
});

afterAll(async () => {
  await app.delete();
});

describe('geçiş betiği', () => {
  it('kullanıcı adlarını yeni biçime çevirir', () => {
    expect(normalizeUsername('ömer')).toBe('omer');
    expect(normalizeUsername('ali_çelik')).toBe('ali_celik');
  });

  it('eski adları rezerve eder, kurala uymayanları atlar', async () => {
    expect(await reserve(db, legacy)).toBe(2);
    expect((await db.ref('usernames/omer').get()).val()).toBe('legacy:ömer');
    expect((await db.ref('usernames/ab').get()).exists()).toBe(false);
  });

  it('yönetici onayıyla adı yeni hesaba bağlar ve sohbetleri taşır', async () => {
    await link(db, 'ömer', NEW_OMER);
    await link(db, 'ali_çelik', NEW_ALI);
    expect((await db.ref(`users/${NEW_OMER}/username`).get()).val()).toBe('omer');
    expect((await db.ref('usernames/omer_yeni').get()).exists()).toBe(false);
    expect(await chats(db, legacy)).toBe(1);
    const chatId = [NEW_OMER, NEW_ALI].sort().join('_');
    const msgs = Object.values((await db.ref(`messages/${chatId}`).get()).val());
    expect(msgs).toHaveLength(2);
    expect(msgs.map((m) => m.text)).toEqual(['Selam', '📎 a.pdf (eski sürümden taşınmadı)']);
    expect(JSON.stringify(msgs)).not.toContain('data:');
    expect((await db.ref(`userChats/${NEW_ALI}/${chatId}/lastMessage/from`).get()).val()).toBe(NEW_ALI);
    // İkinci çalıştırma tekrar kopyalamaz.
    expect(await chats(db, legacy)).toBe(0);
  });
});
