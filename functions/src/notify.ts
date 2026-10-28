// Mesaj ve sohbet isteği bildirimlerinin çekirdek mantığı.
// Tetikleyicilerden bağımsızdır; emülatörde sahte bir gönderici ile test edilebilir.
import { ServerValue, type Database } from 'firebase-admin/database';
import type { Messaging } from 'firebase-admin/messaging';
import * as logger from 'firebase-functions/logger';
import { chatIdFor, truncate, isMuted, messagePreview, notificationBody, NOTIFYING_SYSTEM_TYPES, type ChatMessage } from './text.js';

export const APP_PATH = '/chatapp-standalone/';
export const PUSH_TTL_SECONDS = 60 * 60 * 24; // 1 gün: telefon kapalıysa bildirim bu süre bekler

export type PushData = Record<string, string>;

export interface PushSender {
  send(uid: string, tokens: string[], data: PushData): Promise<number>;
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

// FCM: yalnızca "data" yükü gönderilir; bildirimi servis çalışanı gösterir (çift bildirim olmaz).
export function fcmSender(db: Database, messaging: Messaging): PushSender {
  return {
    async send(uid, tokens, data) {
      let sent = 0;
      for (let i = 0; i < tokens.length; i += 500) {
        const batch = tokens.slice(i, i + 500);
        const res = await messaging.sendEachForMulticast({
          tokens: batch,
          data,
          webpush: { headers: { Urgency: 'high', TTL: String(PUSH_TTL_SECONDS) } },
        });
        const removals: Record<string, null> = {};
        res.responses.forEach((r, idx) => {
          if (r.success) {
            sent++;
            return;
          }
          const code = r.error?.code || '';
          if (INVALID_TOKEN_CODES.has(code)) removals[`pushTokens/${uid}/${batch[idx]}`] = null;
          else logger.warn('push gönderilemedi', { uid, code, message: r.error?.message });
        });
        if (Object.keys(removals).length) {
          await db.ref().update(removals);
          logger.info('geçersiz tokenlar silindi', { uid, count: Object.keys(removals).length });
        }
      }
      return sent;
    },
  };
}

async function tokensOf(db: Database, uid: string): Promise<string[]> {
  const snap = await db.ref(`pushTokens/${uid}`).get();
  return Object.keys(snap.val() || {});
}

async function totalUnread(db: Database, uid: string): Promise<number> {
  const snap = await db.ref(`userChats/${uid}`).get();
  let total = 0;
  snap.forEach((c) => {
    if (!isMuted(c.child('muted').val())) total += Number(c.child('unread').val()) || 0;
  });
  return total;
}

async function isBlocked(db: Database, owner: string, other: string): Promise<boolean> {
  return (await db.ref(`blocks/${owner}/${other}`).get()).val() === true;
}

// Kullanıcı "bildirimde mesaj içeriğini göster" ayarını kapattıysa gövde gizlenir.
async function previewAllowed(db: Database, uid: string): Promise<boolean> {
  return (await db.ref(`settings/${uid}/notifPreview`).get()).val() !== false;
}

export async function displayName(db: Database, uid: string): Promise<string> {
  const name = (await db.ref(`users/${uid}/name`).get()).val();
  return typeof name === 'string' && name ? name : 'Biri';
}

export interface RecipientResult {
  uid: string;
  skipped?: 'blocked' | 'muted' | 'active' | 'no-tokens' | 'system';
  sent?: number;
}

// Yeni mesaj: alıcıların userChats kaydını günceller, uygunsa push gönderir.
export async function handleMessageCreated(
  db: Database,
  push: PushSender,
  chatId: string,
  messageId: string,
  msg: ChatMessage | null
): Promise<RecipientResult[]> {
  if (!msg || typeof msg.from !== 'string') return [];
  const from = msg.from;
  const system = typeof msg.system === 'string' ? msg.system : null;
  const chat = (await db.ref(`chats/${chatId}`).get()).val();
  // Sistem mesajını sunucu yazar; gönderen (ör. gruptan ayrılan) artık üye olmayabilir.
  if (!chat || !chat.members || (!system && chat.members[from] !== true)) {
    logger.warn('üye olmayan gönderici veya sohbet yok', { chatId, messageId });
    return [];
  }
  const ts = typeof msg.ts === 'number' ? msg.ts : Date.now();
  const notifying = !system || NOTIFYING_SYSTEM_TYPES.has(system);
  const senderName = await displayName(db, from);
  const title = chat.type === 'group' ? (system ? chat.name || 'Grup' : `${chat.name || 'Grup'} · ${senderName}`) : senderName;
  const body = system ? truncate(msg.text || '', 100) : notificationBody(msg);
  // Sistem mesajları listede "Ad: …" öneki almasın diye işaretlenir.
  const lastMessage = system ? { text: messagePreview(msg), from, ts, system: true } : { text: messagePreview(msg), from, ts };
  const recipients = Object.keys(chat.members).filter((u) => u !== from && chat.members[u] === true);

  return Promise.all(
    recipients.map(async (uid): Promise<RecipientResult> => {
      // Engellenen kullanıcıdan hiçbir bildirim gelmez.
      if (!system && (await isBlocked(db, uid, from))) return { uid, skipped: 'blocked' };

      const ucRef = db.ref(`userChats/${uid}/${chatId}`);
      if (notifying) await ucRef.update({ unread: ServerValue.increment(1) });
      // Sıra dışı çalışan tetikleyiciler daha yeni önizlemenin üzerine yazmasın.
      await ucRef.transaction((cur) => {
        const node = cur || {};
        const prevTs = node.lastMessage && typeof node.lastMessage.ts === 'number' ? node.lastMessage.ts : 0;
        if (prevTs > ts) return undefined;
        return { ...node, lastMessage, updatedAt: ts };
      });

      const [mutedSnap, presenceSnap, tokens] = await Promise.all([
        ucRef.child('muted').get(),
        db.ref(`presence/${uid}`).get(),
        tokensOf(db, uid),
      ]);
      if (!notifying) return { uid, skipped: 'system' };
      if (isMuted(mutedSnap.val())) return { uid, skipped: 'muted' };
      const presence = presenceSnap.val() || {};
      const online = presenceSnap.child('connections').exists() || presence.online === true;
      if (online && presence.activeChat === chatId) return { uid, skipped: 'active' };
      if (!tokens.length) return { uid, skipped: 'no-tokens' };

      const [badge, showBody] = await Promise.all([totalUnread(db, uid), previewAllowed(db, uid)]);
      const sent = await push.send(uid, tokens, {
        type: 'message',
        title,
        body: showBody ? body : 'Yeni mesaj',
        chatId,
        messageId,
        url: `${APP_PATH}?chat=${encodeURIComponent(chatId)}`,
        tag: `chat-${chatId}`,
        ts: String(ts),
        badge: String(badge),
      });
      return { uid, sent };
    })
  );
}

export interface ChatRequest {
  from?: string;
  to?: string;
  status?: 'pending' | 'accepted' | 'rejected';
  ts?: number;
  respondedAt?: number;
}

// Yeni istek → alıcıya; kabul → isteği gönderene bildirim. Kabulde gönderenin sohbet listesi de oluşturulur.
export async function handleRequestChange(
  db: Database,
  push: PushSender,
  requestId: string,
  before: ChatRequest | null,
  after: ChatRequest | null
): Promise<RecipientResult | null> {
  if (!after || typeof after.from !== 'string' || typeof after.to !== 'string') return null;
  if (requestId !== `${after.from}_${after.to}`) return null;
  const { from, to } = after;

  if (after.status === 'pending' && (!before || before.status !== 'pending')) {
    if (await isBlocked(db, to, from)) return { uid: to, skipped: 'blocked' };
    const tokens = await tokensOf(db, to);
    if (!tokens.length) return { uid: to, skipped: 'no-tokens' };
    const name = await displayName(db, from);
    const sent = await push.send(to, tokens, {
      type: 'request',
      title: 'Yeni sohbet isteği',
      body: `${name} sana sohbet isteği gönderdi.`,
      requestId,
      url: APP_PATH,
      tag: `request-${requestId}`,
      ts: String(after.ts || Date.now()),
    });
    return { uid: to, sent };
  }

  if (after.status === 'accepted' && before && before.status === 'pending') {
    const chatId = chatIdFor(from, to);
    const at = typeof after.respondedAt === 'number' ? after.respondedAt : Date.now();
    await db.ref(`userChats/${from}/${chatId}`).transaction((cur) => cur || { unread: 0, updatedAt: at });
    if (await isBlocked(db, from, to)) return { uid: from, skipped: 'blocked' };
    const tokens = await tokensOf(db, from);
    if (!tokens.length) return { uid: from, skipped: 'no-tokens' };
    const name = await displayName(db, to);
    const sent = await push.send(from, tokens, {
      type: 'request-accepted',
      title: name,
      body: `${name} sohbet isteğini kabul etti. Artık yazışabilirsiniz.`,
      chatId,
      url: `${APP_PATH}?chat=${encodeURIComponent(chatId)}`,
      tag: `chat-${chatId}`,
      ts: String(at),
    });
    return { uid: from, sent };
  }
  return null;
}

export interface TestPushResult {
  tokens: number;
  sent: number;
}

// "Test bildirimi gönder": yalnızca çağıranın kendi cihazlarına. Bir token verilirse ve bu
// kullanıcıya kayıtlıysa yalnızca o cihaza gider (ör. "bu telefonda çalışıyor mu?").
export async function sendTestPush(db: Database, push: PushSender, uid: string, token?: unknown): Promise<TestPushResult> {
  const all = await tokensOf(db, uid);
  const tokens = typeof token === 'string' && all.includes(token) ? [token] : all;
  if (!tokens.length) return { tokens: 0, sent: 0 };
  const sent = await push.send(uid, tokens, {
    type: 'test',
    title: 'ChatApp',
    body: 'Test bildirimi: bildirimler bu cihazda çalışıyor.',
    url: APP_PATH,
    tag: 'chatapp-test',
    ts: String(Date.now()),
  });
  return { tokens: tokens.length, sent };
}
