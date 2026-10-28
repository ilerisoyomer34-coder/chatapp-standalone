// Aşama 4 sunucu testleri: gruplar, hesap silme, Storage erişim aynası, düzenleme/silme önizlemesi.
// Emülatörler: database, auth, firestore. Çalıştırma: npm run test:emulator
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { syncChatAccess } from '../lib/access.js';
import { deleteAccount } from '../lib/account.js';
import { manageGroup, MAX_GROUP_MEMBERS } from '../lib/groups.js';
import { handleMessageUpdated } from '../lib/messages.js';
import { handleMessageCreated } from '../lib/notify.js';
import { normalizeUpdates } from '../lib/updates.js';

const uid = (name) => (name + '0'.repeat(28)).slice(0, 28);
const A = uid('alice');
const B = uid('bob');
const C = uid('carol');
const D = uid('dave');
const direct = (x, y) => [x, y].sort().join('_');

let db;
let auth;
let fs;
let app;
const deleted = [];
const deletePrefix = async (p) => {
  deleted.push(p);
};

beforeAll(async () => {
  process.env.FIREBASE_DATABASE_EMULATOR_HOST ||= '127.0.0.1:9000';
  // Sorgular için .indexOn tanımları gerekir: gerçek kuralları bu ad alanına yükle.
  const rules = readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8');
  await fetch(`http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/.settings/rules.json?ns=stage4-test`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer owner' },
    body: rules,
  });
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  app = initializeApp({ projectId: 'demo-chatapp', databaseURL: 'http://127.0.0.1:9000?ns=stage4-test' }, 'stage4');
  db = getDatabase(app);
  auth = getAuth(app);
  fs = getFirestore(app);
});

beforeEach(async () => {
  deleted.length = 0;
  const users = {};
  for (const [u, n] of [[A, 'Alice'], [B, 'Bob'], [C, 'Carol'], [D, 'Dave']]) users[u] = { username: n.toLowerCase(), name: n, createdAt: 1 };
  await db.ref().set({
    users,
    usernames: { alice: A, bob: B, carol: C, dave: D },
    chats: {
      [direct(A, B)]: { type: 'direct', members: { [A]: true, [B]: true }, createdAt: 1 },
      [direct(A, C)]: { type: 'direct', members: { [A]: true, [C]: true }, createdAt: 1 },
    },
    userChats: { [A]: { [direct(A, B)]: { unread: 0, updatedAt: 1 } }, [B]: { [direct(A, B)]: { unread: 0, updatedAt: 1 } } },
    messages: {
      [direct(A, B)]: {
        m1: { from: A, text: 'Selam', ts: 10 },
        m2: { from: B, text: 'Merhaba', ts: 20, reactions: { [A]: '👍' } },
        m3: { from: A, ts: 30, attachment: { path: `chats/${direct(A, B)}/m3/a.pdf`, name: 'a.pdf', size: 3, type: 'application/pdf' } },
      },
    },
    requests: { [`${A}_${B}`]: { from: A, to: B, status: 'accepted', ts: 1 } },
    settings: { [A]: { notifPreview: false } },
  });
});

describe('gruplar', () => {
  it('yalnızca sohbet edilen kişilerle grup kurulur; sistem mesajı ve sohbet listeleri yazılır', async () => {
    await expect(manageGroup(db, A, { action: 'create', name: 'Ekip', members: [B, D] })).rejects.toMatchObject({ code: 'failed-precondition' });
    const { chatId } = await manageGroup(db, A, { action: 'create', name: '  Ekip  ', members: [B, C] });
    const chat = (await db.ref(`chats/${chatId}`).get()).val();
    expect(chat).toMatchObject({ type: 'group', name: 'Ekip', members: { [A]: true, [B]: true, [C]: true }, admins: { [A]: true }, createdBy: A });
    const msgs = Object.values((await db.ref(`messages/${chatId}`).get()).val());
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ from: A, system: 'created', text: 'Alice, "Ekip" grubunu oluşturdu.' });
    expect((await db.ref(`userChats/${B}/${chatId}`).get()).exists()).toBe(true);
  });

  it('en fazla 50 üye', async () => {
    const many = Array.from({ length: MAX_GROUP_MEMBERS }, (_, i) => uid(`u${i}x`));
    await expect(manageGroup(db, A, { action: 'create', name: 'Kalabalık', members: many })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('yönetici olmayan üye ekleyemez/çıkaramaz; yönetici çıkarınca kişi erişimini kaybeder', async () => {
    const { chatId } = await manageGroup(db, A, { action: 'create', name: 'Ekip', members: [B, C] });
    await expect(manageGroup(db, B, { action: 'remove', chatId, uid: C })).rejects.toMatchObject({ code: 'permission-denied' });
    await manageGroup(db, A, { action: 'remove', chatId, uid: C });
    expect((await db.ref(`chats/${chatId}/members/${C}`).get()).exists()).toBe(false);
    expect((await db.ref(`userChats/${C}/${chatId}`).get()).exists()).toBe(false);
    const texts = Object.values((await db.ref(`messages/${chatId}`).get()).val()).map((m) => m.text);
    expect(texts).toContain('Alice, gruptan çıkardı: Carol');
  });

  it('son yönetici ayrılınca başka üye yönetici olur; son üye ayrılınca grup silinir', async () => {
    const { chatId } = await manageGroup(db, A, { action: 'create', name: 'Ekip', members: [B] });
    await manageGroup(db, A, { action: 'leave', chatId });
    const chat = (await db.ref(`chats/${chatId}`).get()).val();
    expect(chat.members[A]).toBeUndefined();
    expect(chat.admins[B]).toBe(true);
    const res = await manageGroup(db, B, { action: 'leave', chatId });
    expect(res.deletedGroup).toBe(true);
    expect((await db.ref(`chats/${chatId}`).get()).exists()).toBe(false);
    expect((await db.ref(`messages/${chatId}`).get()).exists()).toBe(false);
  });

  it('son yöneticinin yetkisi alınamaz; ad değişikliği sistem mesajı yazar', async () => {
    const { chatId } = await manageGroup(db, A, { action: 'create', name: 'Ekip', members: [B] });
    await expect(manageGroup(db, A, { action: 'setAdmin', chatId, uid: A, admin: false })).rejects.toMatchObject({ code: 'failed-precondition' });
    await manageGroup(db, A, { action: 'setAdmin', chatId, uid: B, admin: true });
    await manageGroup(db, B, { action: 'update', chatId, name: 'Yeni Ad' });
    expect((await db.ref(`chats/${chatId}/name`).get()).val()).toBe('Yeni Ad');
    await expect(manageGroup(db, B, { action: 'update', chatId, photoURL: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('grup mesajı bildirimi "Grup adı · Gönderen" başlıklı; sistem mesajında ayrılan kişi için de çalışır', async () => {
    const { chatId } = await manageGroup(db, A, { action: 'create', name: 'Ekip', members: [B] });
    await db.ref(`pushTokens/${B}/${'t'.repeat(30)}`).set({ platform: 'web', updatedAt: 1 });
    const calls = [];
    const push = { send: async (u, tokens, data) => (calls.push(data), 1) };
    await handleMessageCreated(db, push, chatId, 'g1', { from: A, text: 'Toplantı 5te', ts: Date.now() });
    expect(calls[0]).toMatchObject({ title: 'Ekip · Alice', body: 'Toplantı 5te' });
    const r = await handleMessageCreated(db, push, chatId, 's1', { from: uid('gone'), system: 'left', text: 'X gruptan ayrıldı.', ts: Date.now() + 1 });
    expect(r.every((x) => x.skipped === 'system')).toBe(true);
    expect((await db.ref(`userChats/${B}/${chatId}/lastMessage/text`).get()).val()).toBe('X gruptan ayrıldı.');
  });
});

describe('bildirim önizleme ayarı', () => {
  it('"mesaj içeriğini göster" kapalıysa gövde "Yeni mesaj" olur', async () => {
    await db.ref(`pushTokens/${A}/${'t'.repeat(30)}`).set({ platform: 'web', updatedAt: 1 });
    const calls = [];
    const push = { send: async (u, tokens, data) => (calls.push(data), 1) };
    await handleMessageCreated(db, push, direct(A, B), 'm9', { from: B, text: 'Gizli içerik', ts: Date.now() });
    expect(calls[0].body).toBe('Yeni mesaj');
  });
});

describe('mesaj düzenleme/silme', () => {
  it('herkesten silinen ekli mesajın dosyası silinir ve önizleme güncellenir', async () => {
    await db.ref(`userChats/${B}/${direct(A, B)}/lastMessage`).set({ text: '📎 a.pdf', from: A, ts: 30 });
    const before = (await db.ref(`messages/${direct(A, B)}/m3`).get()).val();
    const res = await handleMessageUpdated(db, deletePrefix, direct(A, B), 'm3', before, { from: A, ts: 30, deleted: true });
    expect(res).toEqual({ previewUpdated: 1, filesDeleted: true });
    expect(deleted).toEqual([`chats/${direct(A, B)}/m3/`]);
    expect((await db.ref(`userChats/${B}/${direct(A, B)}/lastMessage/text`).get()).val()).toBe('Bu mesaj silindi');
  });
  it('düzenleme yalnızca o mesaj son mesajsa önizlemeyi değiştirir', async () => {
    await db.ref(`userChats/${B}/${direct(A, B)}/lastMessage`).set({ text: 'Başka', from: B, ts: 99 });
    const res = await handleMessageUpdated(db, deletePrefix, direct(A, B), 'm1', { from: A, text: 'Selam', ts: 10 }, { from: A, text: 'Selam!', ts: 10, editedAt: 11 });
    expect(res.previewUpdated).toBe(0);
  });
});

describe('Storage erişim aynası', () => {
  it('üyeler ve yöneticiler Firestore belgesine yazılır, sohbet silinince belge silinir', async () => {
    await syncChatAccess(fs, 'g1', { type: 'group', members: { [A]: true, [B]: true, [C]: false }, admins: { [A]: true } });
    const doc = (await fs.doc('chatAccess/g1').get()).data();
    expect(doc).toEqual({ type: 'group', members: { [A]: true, [B]: true }, admins: { [A]: true } });
    await syncChatAccess(fs, 'g1', null);
    expect((await fs.doc('chatAccess/g1').get()).exists).toBe(false);
  });
});

describe('hesap silme', () => {
  beforeEach(async () => {
    await auth.deleteUser(A).catch(() => {});
    await auth.createUser({ uid: A, email: 'alice@example.com', password: 'sifre1234' });
  });
  it('yakın zamanda giriş yapılmamışsa reddedilir', async () => {
    await expect(deleteAccount(db, auth, deletePrefix, A, Math.floor(Date.now() / 1000) - 3600)).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('profil, kullanıcı adı ve kişisel düğümler silinir; mesajları "silindi" olur; Auth hesabı kalkar', async () => {
    const { chatId: g } = await manageGroup(db, A, { action: 'create', name: 'Ekip', members: [B, C] });
    const res = await deleteAccount(db, auth, deletePrefix, A, Math.floor(Date.now() / 1000));
    expect(res.messages).toBe(2);
    expect((await db.ref(`users/${A}`).get()).exists()).toBe(false);
    expect((await db.ref('usernames/alice').get()).exists()).toBe(false);
    expect((await db.ref(`userChats/${A}`).get()).exists()).toBe(false);
    expect((await db.ref(`requests/${A}_${B}`).get()).exists()).toBe(false);
    const m1 = (await db.ref(`messages/${direct(A, B)}/m1`).get()).val();
    expect(m1).toEqual({ from: A, ts: 10, deleted: true });
    expect((await db.ref(`messages/${direct(A, B)}/m2/reactions`).get()).exists()).toBe(false);
    expect((await db.ref(`messages/${direct(A, B)}/m2/text`).get()).val()).toBe('Merhaba');
    const group = (await db.ref(`chats/${g}`).get()).val();
    expect(group.members[A]).toBeUndefined();
    expect(Object.keys(group.admins)).toHaveLength(1);
    expect(deleted).toContain(`chats/${direct(A, B)}/m3/`);
    expect(deleted).toContain(`avatars/${A}/`);
    await expect(auth.getUser(A)).rejects.toMatchObject({ code: 'auth/user-not-found' });
  });
});

describe('normalizeUpdates', () => {
  it('üst yol yazılıyorsa alt yolları atar', () => {
    expect(normalizeUpdates({ 'a': null, 'a/b': 1, 'a-b': 2, 'a-b/c': 3, 'x/y': 4 })).toEqual({ a: null, 'a-b': 2, 'x/y': 4 });
  });
});
