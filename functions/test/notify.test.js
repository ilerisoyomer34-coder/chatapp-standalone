// Bildirim mantığı testleri (Realtime Database emülatörü + sahte FCM göndericisi).
// Çalıştırma (depo kökünden): npm run test:emulator
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { handleMessageCreated, handleRequestChange, sendTestPush } from '../lib/notify.js';
import { messagePreview, notificationBody } from '../lib/text.js';

const uid = (name) => (name + '0'.repeat(28)).slice(0, 28);
const A = uid('alice');
const B = uid('bob');
const AB = [A, B].sort().join('_');
const TOKEN_B = 'tokenB_' + 'x'.repeat(140);

let db;

function fakeSender() {
  const calls = [];
  return {
    calls,
    async send(to, tokens, data) {
      calls.push({ to, tokens, data });
      return tokens.length;
    },
  };
}

beforeAll(() => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
  const app = initializeApp({ projectId: 'demo-chatapp', databaseURL: 'http://127.0.0.1:9000?ns=notify-test' }, 'notify-test');
  db = getDatabase(app);
});

beforeEach(async () => {
  await db.ref().set({
    users: {
      [A]: { username: 'alice', name: 'Alice', createdAt: 1 },
      [B]: { username: 'bob', name: 'Bob', createdAt: 1 },
    },
    chats: { [AB]: { type: 'direct', members: { [A]: true, [B]: true }, createdAt: 1 } },
    userChats: { [B]: { [AB]: { unread: 2, updatedAt: 1 } } },
    pushTokens: { [B]: { [TOKEN_B]: { platform: 'android', updatedAt: 1 } } },
  });
});

const msg = (text, extra = {}) => ({ from: A, text, ts: Date.now(), ...extra });

describe('yeni mesaj', () => {
  it('alıcının okunmamışını artırır, son mesajı yazar ve push gönderir', async () => {
    const push = fakeSender();
    const res = await handleMessageCreated(db, push, AB, 'm1', msg('Merhaba Bob'));
    expect(res).toEqual([{ uid: B, sent: 1 }]);
    const uc = (await db.ref(`userChats/${B}/${AB}`).get()).val();
    expect(uc.unread).toBe(3);
    expect(uc.lastMessage).toMatchObject({ text: 'Merhaba Bob', from: A });
    expect(push.calls).toHaveLength(1);
    expect(push.calls[0].data).toMatchObject({ type: 'message', title: 'Alice', body: 'Merhaba Bob', chatId: AB, messageId: 'm1', tag: `chat-${AB}`, badge: '3' });
    expect(push.calls[0].data.url).toBe(`/chatapp-standalone/?chat=${encodeURIComponent(AB)}`);
    // Gönderenin kendi kaydına dokunulmaz.
    expect((await db.ref(`userChats/${A}`).get()).exists()).toBe(false);
  });

  it('sessize alınmış sohbette push göndermez ama okunmamışı artırır', async () => {
    await db.ref(`userChats/${B}/${AB}/muted`).set(Date.now() + 3600000);
    const push = fakeSender();
    const res = await handleMessageCreated(db, push, AB, 'm1', msg('x'));
    expect(res[0].skipped).toBe('muted');
    expect(push.calls).toHaveLength(0);
    expect((await db.ref(`userChats/${B}/${AB}/unread`).get()).val()).toBe(3);
  });

  it('alıcı o sohbeti açmış ve çevrimiçiyse push göndermez', async () => {
    await db.ref(`presence/${B}`).set({ online: true, activeChat: AB, connections: { c1: true } });
    const push = fakeSender();
    const res = await handleMessageCreated(db, push, AB, 'm1', msg('x'));
    expect(res[0].skipped).toBe('active');
    expect(push.calls).toHaveLength(0);
  });

  it('activeChat kalmış ama bağlantı yoksa push gönderir', async () => {
    await db.ref(`presence/${B}`).set({ online: false, activeChat: AB });
    const push = fakeSender();
    await handleMessageCreated(db, push, AB, 'm1', msg('x'));
    expect(push.calls).toHaveLength(1);
  });

  it('göndereni engelleyen alıcıya hiçbir şey yapmaz', async () => {
    await db.ref(`blocks/${B}/${A}`).set(true);
    const push = fakeSender();
    const res = await handleMessageCreated(db, push, AB, 'm1', msg('x'));
    expect(res[0].skipped).toBe('blocked');
    expect(push.calls).toHaveLength(0);
    expect((await db.ref(`userChats/${B}/${AB}/unread`).get()).val()).toBe(2);
  });

  it('üye olmayan gönderici yok sayılır', async () => {
    const push = fakeSender();
    const res = await handleMessageCreated(db, push, AB, 'm1', { from: uid('eve'), text: 'x', ts: Date.now() });
    expect(res).toEqual([]);
    expect(push.calls).toHaveLength(0);
  });

  it('eski mesaj yeni önizlemenin üzerine yazmaz', async () => {
    const push = fakeSender();
    const now = Date.now();
    await handleMessageCreated(db, push, AB, 'm2', msg('yeni', { ts: now }));
    await handleMessageCreated(db, push, AB, 'm1', msg('eski', { ts: now - 5000 }));
    expect((await db.ref(`userChats/${B}/${AB}/lastMessage/text`).get()).val()).toBe('yeni');
    expect((await db.ref(`userChats/${B}/${AB}/unread`).get()).val()).toBe(4);
  });
});

describe('sohbet istekleri', () => {
  it('yeni istek alıcıya bildirilir', async () => {
    const push = fakeSender();
    const res = await handleRequestChange(db, push, `${A}_${B}`, null, { from: A, to: B, status: 'pending', ts: Date.now() });
    expect(res).toEqual({ uid: B, sent: 1 });
    expect(push.calls[0].data).toMatchObject({ type: 'request', title: 'Yeni sohbet isteği', body: 'Alice sana sohbet isteği gönderdi.' });
  });

  it('kabul edilince gönderenin sohbet listesi oluşturulur', async () => {
    const push = fakeSender();
    await handleRequestChange(db, push, `${B}_${A}`, { from: B, to: A, status: 'pending', ts: 1 }, { from: B, to: A, status: 'accepted', ts: 1, respondedAt: 5 });
    expect((await db.ref(`userChats/${B}/${AB}`).get()).val()).toMatchObject({ unread: 2 });
    await handleRequestChange(db, push, `${A}_${B}`, { from: A, to: B, status: 'pending', ts: 1 }, { from: A, to: B, status: 'accepted', ts: 1, respondedAt: 5 });
    expect((await db.ref(`userChats/${A}/${AB}`).get()).val()).toEqual({ unread: 0, updatedAt: 5 });
  });

  it('kimliği uyuşmayan istek yok sayılır', async () => {
    const push = fakeSender();
    const res = await handleRequestChange(db, push, 'sahte', null, { from: A, to: B, status: 'pending', ts: 1 });
    expect(res).toBeNull();
    expect(push.calls).toHaveLength(0);
  });
});

describe('metinler', () => {
  it('bildirim gövdesi ilk 100 karakter', () => {
    expect(notificationBody({ text: 'a'.repeat(150) })).toBe('a'.repeat(100) + '…');
  });
  it('ekler', () => {
    expect(notificationBody({ attachment: { type: 'image/jpeg', name: 'x.jpg' } })).toBe('Fotoğraf');
    expect(notificationBody({ attachment: { type: 'audio/webm', name: 'ses.webm' } })).toBe('Sesli mesaj');
    expect(notificationBody({ attachment: { type: 'application/pdf', name: 'rapor.pdf' } })).toBe('Dosya: rapor.pdf');
    expect(messagePreview({ attachment: { type: 'application/pdf', name: 'rapor.pdf' } })).toBe('📎 rapor.pdf');
  });
});

describe('test bildirimi', () => {
  it('kendi cihazlarına gönderir; verilen token kayıtlıysa yalnızca ona', async () => {
    const other = 'tokenB2_' + 'y'.repeat(140);
    await db.ref(`pushTokens/${B}/${other}`).set({ platform: 'ios', updatedAt: 2 });
    const push = fakeSender();
    await expect(sendTestPush(db, push, B)).resolves.toEqual({ tokens: 2, sent: 2 });
    await expect(sendTestPush(db, push, B, other)).resolves.toEqual({ tokens: 1, sent: 1 });
    expect(push.calls[1]).toMatchObject({ to: B, tokens: [other], data: { type: 'test', tag: 'chatapp-test' } });
  });

  it('başkasının token\'ıyla başkasına gönderilemez; cihazı yoksa hiçbir şey gönderilmez', async () => {
    const push = fakeSender();
    await expect(sendTestPush(db, push, A, TOKEN_B)).resolves.toEqual({ tokens: 0, sent: 0 });
    expect(push.calls).toHaveLength(0);
  });
});
