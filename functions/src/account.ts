// Hesabı verileriyle birlikte silme (callable "deleteAccount").
// İstemci önce şifreyle yeniden kimlik doğrular; sunucu son 5 dakikada giriş yapılmış olmasını ister.
import type { Auth } from 'firebase-admin/auth';
import { ServerValue, type Database } from 'firebase-admin/database';
import { HttpsError } from 'firebase-functions/v2/https';
import { membershipRemoval } from './groups.js';
import type { PrefixDeleter } from './messages.js';
import { normalizeUpdates, type Updates } from './updates.js';

export const RECENT_LOGIN_SECONDS = 5 * 60;

async function flush(db: Database, updates: Updates) {
  const entries = Object.entries(normalizeUpdates(updates));
  for (let i = 0; i < entries.length; i += 500) {
    await db.ref().update(Object.fromEntries(entries.slice(i, i + 500)));
  }
}

export async function deleteAccount(
  db: Database,
  auth: Auth,
  deletePrefix: PrefixDeleter,
  uid: string,
  authTimeSeconds: number | undefined,
  nowMs = Date.now()
): Promise<{ chats: number; messages: number }> {
  if (!authTimeSeconds || nowMs / 1000 - authTimeSeconds > RECENT_LOGIN_SECONDS) {
    throw new HttpsError('failed-precondition', 'Güvenlik için şifreni yeniden girmen gerekiyor.');
  }
  const [profileSnap, userChatsSnap] = await Promise.all([db.ref(`users/${uid}`).get(), db.ref(`userChats/${uid}`).get()]);
  const profile = profileSnap.val() || {};
  const updates: Updates = {};
  let messageCount = 0;
  const chatIds = Object.keys(userChatsSnap.val() || {});

  for (const chatId of chatIds) {
    const chat = (await db.ref(`chats/${chatId}`).get()).val();
    if (!chat || !chat.members || chat.members[uid] !== true) continue;
    const msgs = (await db.ref(`messages/${chatId}`).get()).val() || {};
    for (const [id, m] of Object.entries<Record<string, unknown>>(msgs)) {
      if (m && m.reactions && (m.reactions as Record<string, unknown>)[uid]) updates[`messages/${chatId}/${id}/reactions/${uid}`] = null;
      if (!m || m.from !== uid || m.system || m.deleted) continue;
      // Kişinin yazdığı mesajlar karşı tarafta "Bu mesaj silindi" olarak kalır.
      updates[`messages/${chatId}/${id}/text`] = null;
      updates[`messages/${chatId}/${id}/attachment`] = null;
      updates[`messages/${chatId}/${id}/deleted`] = true;
      if (m.attachment) await deletePrefix(`chats/${chatId}/${id}/`);
      messageCount++;
    }
    updates[`receipts/${chatId}/${uid}`] = null;
    updates[`typing/${chatId}/${uid}`] = null;

    if (chat.type === 'group') {
      Object.assign(updates, membershipRemoval(chatId, uid));
      const remaining = Object.keys(chat.members).filter((u) => u !== uid && chat.members[u] === true);
      if (!remaining.length) {
        Object.assign(updates, { [`chats/${chatId}`]: null, [`messages/${chatId}`]: null, [`typing/${chatId}`]: null, [`receipts/${chatId}`]: null });
        await deletePrefix(`chats/${chatId}/`);
        await deletePrefix(`groups/${chatId}/`);
        continue;
      }
      const admins = Object.keys(chat.admins || {}).filter((u) => u !== uid && chat.admins[u] === true && chat.members[u] === true);
      if (!admins.length) updates[`chats/${chatId}/admins/${remaining[0]}`] = true;
      const id = db.ref(`messages/${chatId}`).push().key as string;
      updates[`messages/${chatId}/${id}`] = { from: uid, system: 'left', text: 'Bir üye hesabını sildi ve gruptan ayrıldı.', ts: ServerValue.TIMESTAMP };
    }
  }

  // Bekleyen/eski istekler
  for (const field of ['from', 'to']) {
    const snap = await db.ref('requests').orderByChild(field).equalTo(uid).get();
    snap.forEach((r) => {
      updates[`requests/${r.key}`] = null;
    });
  }

  for (const node of ['users', 'userChats', 'pushTokens', 'presence', 'blocks', 'settings', 'hidden', 'requestQuota', 'admins']) {
    updates[`${node}/${uid}`] = null;
  }
  if (typeof profile.username === 'string') updates[`usernames/${profile.username}`] = null;

  await flush(db, updates);
  await deletePrefix(`avatars/${uid}/`);
  await auth.deleteUser(uid);
  return { chats: chatIds.length, messages: messageCount };
}
