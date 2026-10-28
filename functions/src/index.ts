// ChatApp Cloud Functions (2. nesil, Node.js 22, europe-west1).
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase, ServerValue } from 'firebase-admin/database';
import { getMessaging } from 'firebase-admin/messaging';
import { onValueCreated, onValueUpdated } from 'firebase-functions/v2/database';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineBoolean } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { fcmSender, handleMessageCreated, handleRequestChange, type ChatRequest } from './notify.js';
import type { ChatMessage } from './text.js';

initializeApp();

const REGION = 'europe-west1';
const INSTANCE = 'chatapp-d8a5b-default-rtdb';
// App Check kurulana kadar geçici olarak kapatılabilir: functions/.env → ENFORCE_APP_CHECK=false
const ENFORCE_APP_CHECK = defineBoolean('ENFORCE_APP_CHECK', { default: true });

setGlobalOptions({ region: REGION, maxInstances: 10 });

const sender = () => fcmSender(getDatabase(), getMessaging());

export const onMessageCreated = onValueCreated(
  { ref: '/messages/{chatId}/{messageId}', instance: INSTANCE, region: REGION, retry: false },
  async (event) => {
    const { chatId, messageId } = event.params;
    const results = await handleMessageCreated(getDatabase(), sender(), chatId, messageId, event.data.val() as ChatMessage | null);
    logger.info('mesaj işlendi', { chatId, messageId, results });
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

// Yönetici: kullanıcıyı çıkar / geri al. Auth hesabını devre dışı bırakır/açar, verileri işaretler.
// İstemci users/{uid}/disabled bayrağını dinler ve açık oturumu anında kapatır;
// güvenlik kuralları da bu bayrak varken okuma/yazmayı reddeder.
export const adminSetUserDisabled = onCall({ region: REGION, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Önce giriş yapmalısın.');
  const db = getDatabase();
  const callerUid = request.auth.uid;
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
