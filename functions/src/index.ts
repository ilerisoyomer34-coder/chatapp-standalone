// ChatApp Cloud Functions (2. nesil, Node.js 22, europe-west1).
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase, ServerValue } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { onValueCreated, onValueUpdated, onValueWritten } from 'firebase-functions/v2/database';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineBoolean } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { syncChatAccess } from './access.js';
import { deleteAccount as deleteAccountImpl } from './account.js';
import { manageGroup as manageGroupImpl } from './groups.js';
import { handleMessageUpdated, type PrefixDeleter } from './messages.js';
import { fcmSender, handleMessageCreated, handleRequestChange, type ChatRequest } from './notify.js';
import type { ChatMessage } from './text.js';

initializeApp();

const REGION = 'europe-west1';
const INSTANCE = 'chatapp-d8a5b-default-rtdb';
// App Check kurulana kadar geçici olarak kapatılabilir: functions/.env → ENFORCE_APP_CHECK=false
const ENFORCE_APP_CHECK = defineBoolean('ENFORCE_APP_CHECK', { default: true });

setGlobalOptions({ region: REGION, maxInstances: 10 });

const sender = () => fcmSender(getDatabase(), getMessaging());
const deletePrefix: PrefixDeleter = async (prefix) => {
  await getStorage().bucket().deleteFiles({ prefix, force: true });
};

export const onMessageCreated = onValueCreated(
  { ref: '/messages/{chatId}/{messageId}', instance: INSTANCE, region: REGION, retry: false },
  async (event) => {
    const { chatId, messageId } = event.params;
    const results = await handleMessageCreated(getDatabase(), sender(), chatId, messageId, event.data.val() as ChatMessage | null);
    logger.info('mesaj işlendi', { chatId, messageId, results });
  }
);

// Düzenleme / herkesten silme: sohbet listesi önizlemesi ve Storage dosyaları.
export const onMessageUpdated = onValueUpdated(
  { ref: '/messages/{chatId}/{messageId}', instance: INSTANCE, region: REGION, retry: false },
  async (event) => {
    const { chatId, messageId } = event.params;
    const result = await handleMessageUpdated(
      getDatabase(),
      deletePrefix,
      chatId,
      messageId,
      event.data.before.val() as ChatMessage | null,
      event.data.after.val() as ChatMessage | null
    );
    if (result.previewUpdated || result.filesDeleted) logger.info('mesaj güncellendi', { chatId, messageId, result });
  }
);

export const onRequestCreated = onValueCreated(
  { ref: '/requests/{requestId}', instance: INSTANCE, region: REGION, retry: false },
  async (event) => {
    const result = await handleRequestChange(getDatabase(), sender(), event.params.requestId, null, event.data.val() as ChatRequest | null);
    logger.info('istek oluşturuldu', { requestId: event.params.requestId, result });
  }
);

export const onRequestUpdated = onValueUpdated(
  { ref: '/requests/{requestId}', instance: INSTANCE, region: REGION, retry: false },
  async (event) => {
    const result = await handleRequestChange(
      getDatabase(),
      sender(),
      event.params.requestId,
      event.data.before.val() as ChatRequest | null,
      event.data.after.val() as ChatRequest | null
    );
    logger.info('istek güncellendi', { requestId: event.params.requestId, result });
  }
);

// Sohbet üyeliğini Storage kuralları için Firestore'a yansıt.
export const syncChatAccessOnWrite = onValueWritten(
  { ref: '/chats/{chatId}', instance: INSTANCE, region: REGION, retry: true },
  async (event) => {
    const result = await syncChatAccess(getFirestore(), event.params.chatId, event.data.after.val());
    logger.info('sohbet erişimi eşitlendi', { chatId: event.params.chatId, result });
  }
);

function requireAuth(request: { auth?: { uid: string } }): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Önce giriş yapmalısın.');
  return request.auth.uid;
}

async function requireActive(uid: string) {
  if ((await getDatabase().ref(`users/${uid}/disabled`).get()).val() === true) {
    throw new HttpsError('permission-denied', 'Hesabın devre dışı.');
  }
}

// Grup işlemleri: create | add | remove | leave | setAdmin | update
export const manageGroup = onCall({ region: REGION, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request);
  await requireActive(uid);
  const result = await manageGroupImpl(getDatabase(), uid, (request.data || {}) as Record<string, unknown>);
  if (result.deletedGroup) {
    await deletePrefix(`chats/${result.chatId}/`);
    await deletePrefix(`groups/${result.chatId}/`);
  }
  logger.info('grup işlemi', { uid, action: (request.data || {}).action, chatId: result.chatId });
  return result;
});

// Hesabı verileriyle birlikte sil (son 5 dakikada giriş yapılmış olmalı).
export const deleteAccount = onCall({ region: REGION, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request);
  const authTime = Number((request.auth?.token as { auth_time?: number } | undefined)?.auth_time);
  const result = await deleteAccountImpl(getDatabase(), getAuth(), deletePrefix, uid, authTime);
  logger.info('hesap silindi', { uid, result });
  return { ok: true };
});

// Yönetici: kullanıcıyı çıkar / geri al. Auth hesabını devre dışı bırakır/açar, verileri işaretler.
// İstemci users/{uid}/disabled bayrağını dinler ve açık oturumu anında kapatır;
// güvenlik kuralları da bu bayrak varken okuma/yazmayı reddeder.
export const adminSetUserDisabled = onCall({ region: REGION, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const callerUid = requireAuth(request);
  const db = getDatabase();
  if ((await db.ref(`admins/${callerUid}`).get()).val() !== true) {
    throw new HttpsError('permission-denied', 'Bu işlem için yönetici yetkisi gerekli.');
  }
  const { uid, disabled } = (request.data || {}) as { uid?: unknown; disabled?: unknown };
  if (typeof uid !== 'string' || !/^[A-Za-z0-9]{1,128}$/.test(uid) || typeof disabled !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Geçersiz istek.');
  }
  if (uid === callerUid) throw new HttpsError('failed-precondition', 'Kendi hesabını çıkaramazsın.');
  if ((await db.ref(`admins/${uid}`).get()).val() === true) {
    throw new HttpsError('failed-precondition', 'Yönetici hesabı çıkarılamaz.');
  }
  if (!(await db.ref(`users/${uid}/username`).get()).exists()) {
    throw new HttpsError('not-found', 'Kullanıcı bulunamadı.');
  }

  const auth = getAuth();
  await auth.updateUser(uid, { disabled });
  if (disabled) await auth.revokeRefreshTokens(uid);

  await db.ref().update({
    [`users/${uid}/disabled`]: disabled ? true : null,
    [`users/${uid}/disabledAt`]: disabled ? ServerValue.TIMESTAMP : null,
    [`users/${uid}/disabledBy`]: disabled ? callerUid : null,
    // Devre dışı kullanıcıya bildirim gitmesin.
    ...(disabled ? { [`pushTokens/${uid}`]: null } : {}),
  });
  logger.info('yönetici işlemi', { by: callerUid, uid, disabled });
  return { ok: true };
});
