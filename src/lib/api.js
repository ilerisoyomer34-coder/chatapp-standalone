// Veritabanı işlemleri. Tüm yazmalar update() ile yalnızca ilgili yollara yapılır;
// zaman damgaları sunucu zamanı (serverTimestamp) ile yazılır.
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth';
import {
  child,
  endAt,
  get,
  limitToFirst,
  onValue,
  orderByKey,
  push,
  query,
  ref,
  runTransaction,
  serverTimestamp,
  startAt,
  update,
} from 'firebase/database';
import { auth, db, getFunctionsLazy, PUSH_WORKER_URL } from '../firebase.js';
import { colorFor, messagePreview } from './format.js';
import { normalizeUsername } from './username.js';

export const MAX_TEXT = 4000;
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const DAILY_REQUEST_LIMIT = 20;
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const DAY = 86400000;

export const chatIdFor = (a, b) => [a, b].sort().join('_');

// Sunucu saati farkı (istemci saati yanlış olsa da 15 dk / 24 saat hesapları doğru olsun).
let serverOffset = 0;
onValue(ref(db, '.info/serverTimeOffset'), (s) => {
  serverOffset = Number(s.val()) || 0;
});
export const serverNow = () => Date.now() + serverOffset;

const err = (code, message) => Object.assign(new Error(message || code), { code });

async function callable(name, data) {
  const { f, httpsCallable } = await getFunctionsLazy();
  const res = await httpsCallable(f, name)(data);
  return res.data;
}

// ── Kimlik ──────────────────────────────────────────────────────────────
export async function register({ email, password }) {
  return createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function login({ email, password }) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function resetPassword(email) {
  const url = `${window.location.origin}${import.meta.env.BASE_URL}`;
  return sendPasswordResetEmail(auth, email.trim(), { url });
}

export async function logout() {
  await signOut(auth);
}

async function reauth(password) {
  const user = auth.currentUser;
  if (!user || !user.email) throw err('auth/requires-recent-login');
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  return user;
}

export async function changePassword(currentPassword, newPassword) {
  const user = await reauth(currentPassword);
  await updatePassword(user, newPassword);
}

// Hesabı verileriyle birlikte siler (sunucu son 5 dakikada giriş ister → önce yeniden doğrula).
export async function deleteMyAccount(password) {
  const user = await reauth(password);
  await user.getIdToken(true);
  await callable('deleteAccount', {});
}

// Benzersiz kullanıcı adını usernames/{ad} = uid düğümüne transaction ile yazar,
// ardından herkese açık profili oluşturur.
export async function claimUsernameAndCreateProfile(uid, { username, name }) {
  const uname = normalizeUsername(username);
  const nameRef = ref(db, `usernames/${uname}`);
  const result = await runTransaction(nameRef, (current) => {
    if (current === null) return uid;
    if (current === uid) return current;
    return undefined; // alınmış → iptal
  });
  if (!result.committed || result.snapshot.val() !== uid) throw err('username-taken');
  await update(ref(db), {
    [`users/${uid}/username`]: uname,
    [`users/${uid}/name`]: name.trim(),
    [`users/${uid}/about`]: '',
    [`users/${uid}/color`]: colorFor(uid),
    [`users/${uid}/createdAt`]: serverTimestamp(),
  });
  return uname;
}

// ── Profil ve ayarlar ───────────────────────────────────────────────────
export async function updateProfile(uid, fields) {
  const updates = {};
  if (fields.name !== undefined) updates[`users/${uid}/name`] = fields.name.trim();
  if (fields.about !== undefined) updates[`users/${uid}/about`] = fields.about.trim();
  if (fields.photoURL !== undefined) updates[`users/${uid}/photoURL`] = fields.photoURL || null;
  await update(ref(db), updates);
}

export async function saveSetting(uid, key, value) {
  await update(ref(db), { [`settings/${uid}/${key}`]: value });
}

// ── Arama ───────────────────────────────────────────────────────────────
// Kullanıcı adı ön ek araması (orderByKey + startAt/endAt, en fazla 20 sonuç).
export async function searchUsernames(prefix) {
  const p = normalizeUsername(prefix);
  if (!p) return [];
  const q = query(ref(db, 'usernames'), orderByKey(), startAt(p), endAt(p + ''), limitToFirst(20));
  const snap = await get(q);
  const out = [];
  snap.forEach((s) => {
    const v = s.val();
    // "legacy:..." değerleri eski sürümden rezerve edilmiş adlardır (hesap yok).
    if (typeof v === 'string' && !v.startsWith('legacy:')) out.push({ username: s.key, uid: v });
  });
  return out;
}

// ── İstekler ────────────────────────────────────────────────────────────
// Günde en fazla 20 istek: sayaç istekle aynı güncellemede artırılır (kurallar zorunlu tutar).
export async function sendChatRequest(me, to) {
  const id = `${me}_${to}`;
  const q = (await get(ref(db, `requestQuota/${me}`))).val();
  let quota;
  if (q && typeof q.windowStart === 'number' && q.windowStart > serverNow() - DAY) {
    if ((q.count || 0) >= DAILY_REQUEST_LIMIT) throw err('quota-exceeded');
    quota = { windowStart: q.windowStart, count: (q.count || 0) + 1 };
  } else {
    quota = { windowStart: serverTimestamp(), count: 1 };
  }
  await update(ref(db), {
    [`requests/${id}`]: { from: me, to, status: 'pending', ts: serverTimestamp() },
    [`requestQuota/${me}`]: quota,
  });
  notifyWorker('request', { requestId: id });
}

export async function cancelChatRequest(me, to) {
  await update(ref(db), { [`requests/${me}_${to}`]: null });
}

// İsteği kabul et: istek durumu, sohbet ve kendi sohbet listemiz tek güncellemede.
// Karşı tarafın userChats kaydını sunucu (veya karşı tarafın istemcisi) yazar.
export async function respondChatRequest(me, request, accept) {
  const id = `${request.from}_${me}`;
  const updates = {
    [`requests/${id}/status`]: accept ? 'accepted' : 'rejected',
    [`requests/${id}/respondedAt`]: serverTimestamp(),
  };
  let chatId = null;
  if (accept) {
    chatId = chatIdFor(me, request.from);
    const exists = await get(ref(db, `chats/${chatId}/type`))
      .then((s) => s.exists())
      .catch(() => false);
    if (!exists) {
      updates[`chats/${chatId}`] = {
        type: 'direct',
        members: { [me]: true, [request.from]: true },
        createdAt: serverTimestamp(),
      };
    }
    updates[`userChats/${me}/${chatId}/updatedAt`] = serverTimestamp();
    updates[`userChats/${me}/${chatId}/unread`] = 0;
  }
  await update(ref(db), updates);
  if (accept) notifyWorker('request', { requestId: id });
  return chatId;
}

export async function markRequestSeen(me, request) {
  await update(ref(db), { [`requests/${me}_${request.to}/seenBySender`]: true });
}

// Gönderdiğimiz istek kabul edildiyse ve sohbet listemizde yoksa ekle (sunucu yedeği).
export async function ensureUserChat(me, chatId) {
  await update(ref(db), { [`userChats/${me}/${chatId}/updatedAt`]: serverTimestamp() });
}

// ── Sohbet listesi tercihleri ───────────────────────────────────────────
export async function setChatPref(me, chatId, prefs) {
  const updates = {};
  for (const [k, v] of Object.entries(prefs)) updates[`userChats/${me}/${chatId}/${k}`] = v;
  await update(ref(db), updates);
}

// ── Mesajlar ────────────────────────────────────────────────────────────
export function newMessageId(chatId) {
  return push(child(ref(db), `messages/${chatId}`)).key;
}

export async function sendMessage(me, chatId, { id, text, attachment, replyTo, forwarded }) {
  const messageId = id || newMessageId(chatId);
  const msg = { from: me, ts: serverTimestamp() };
  const clean = (text || '').trim();
  if (clean) msg.text = clean.slice(0, MAX_TEXT);
  if (attachment) {
    const a = {
      path: attachment.path,
      name: attachment.name.slice(0, 200),
      size: attachment.size,
      type: (attachment.type || 'application/octet-stream').slice(0, 100),
    };
    for (const k of ['thumbPath', 'duration', 'width', 'height'])
      if (attachment[k] !== undefined && attachment[k] !== null) a[k] = attachment[k];
    msg.attachment = a;
  }
  if (replyTo) msg.replyTo = replyTo;
  if (forwarded) msg.forwarded = true;
  const updates = {
    [`messages/${chatId}/${messageId}`]: msg,
    [`userChats/${me}/${chatId}/lastMessage`]: { text: messagePreview(msg).slice(0, 200), from: me, ts: serverTimestamp() },
    [`userChats/${me}/${chatId}/updatedAt`]: serverTimestamp(),
    [`userChats/${me}/${chatId}/unread`]: 0,
    [`typing/${chatId}/${me}`]: null,
  };
  await update(ref(db), updates);
  notifyWorker('message', { chatId, messageId });
  return messageId;
}

export const canEdit = (msg, me) =>
  msg.from === me && !msg.deleted && !msg.system && !!msg.text && serverNow() - (Number(msg.ts) || 0) < EDIT_WINDOW_MS;

export async function editMessage(chatId, messageId, text) {
  const clean = text.trim().slice(0, MAX_TEXT);
  if (!clean) throw err('empty');
  await update(ref(db), {
    [`messages/${chatId}/${messageId}/text`]: clean,
    [`messages/${chatId}/${messageId}/editedAt`]: serverTimestamp(),
  });
}

// Herkesten sil: metin ve ek kaldırılır ("Bu mesaj silindi"). Dosyayı sunucu siler.
export async function deleteForEveryone(me, chatId, msg, myLastMessage) {
  const updates = {
    [`messages/${chatId}/${msg.id}/text`]: null,
    [`messages/${chatId}/${msg.id}/attachment`]: null,
    [`messages/${chatId}/${msg.id}/deleted`]: true,
  };
  if (myLastMessage && myLastMessage.ts === msg.ts && myLastMessage.from === msg.from) {
    updates[`userChats/${me}/${chatId}/lastMessage/text`] = 'Bu mesaj silindi';
  }
  await update(ref(db), updates);
}

export async function deleteForMe(me, chatId, messageIds) {
  const updates = {};
  for (const id of messageIds) updates[`hidden/${me}/${chatId}/${id}`] = true;
  await update(ref(db), updates);
}

export async function setReaction(me, chatId, messageId, emoji) {
  await update(ref(db), { [`messages/${chatId}/${messageId}/reactions/${me}`]: emoji || null });
}

export async function fetchMessage(chatId, messageId) {
  const snap = await get(ref(db, `messages/${chatId}/${messageId}`));
  return snap.exists() ? { id: messageId, ...snap.val() } : null;
}

export async function markChatRead(me, chatId) {
  await update(ref(db), {
    [`userChats/${me}/${chatId}/unread`]: 0,
    [`receipts/${chatId}/${me}/read`]: serverTimestamp(),
    [`receipts/${chatId}/${me}/delivered`]: serverTimestamp(),
  });
}

export async function markDelivered(me, chatId) {
  await update(ref(db), { [`receipts/${chatId}/${me}/delivered`]: serverTimestamp() });
}

// ── Engelleme ve şikâyet ────────────────────────────────────────────────
export async function setBlocked(me, other, blocked) {
  await update(ref(db), { [`blocks/${me}/${other}`]: blocked ? true : null });
}

export async function reportUser(me, { target, chatId, messageId, reason }) {
  const id = push(child(ref(db), 'reports')).key;
  const report = { from: me, target, reason: reason.slice(0, 500), ts: serverTimestamp() };
  if (chatId) report.chatId = chatId;
  if (messageId) report.messageId = messageId;
  await update(ref(db), { [`reports/${id}`]: report });
}

export async function dismissReport(reportId) {
  await update(ref(db), { [`reports/${reportId}`]: null });
}

// ── Gruplar (sunucu fonksiyonu "manageGroup") ───────────────────────────
export const groupAction = (data) => callable('manageGroup', data);

// ── Yönetici ────────────────────────────────────────────────────────────
export const adminSetUserDisabled = (uid, disabled) => callable('adminSetUserDisabled', { uid, disabled });

// ── Test bildirimi ──────────────────────────────────────────────────────
// Sunucu bildirimi birkaç saniye bekleyip gönderir; kullanıcı bu arada uygulamayı
// arka plana alıp kilit ekranında görebilir. Yalnızca kendi cihazlarına gider.
export const TEST_PUSH_DELAY_SECONDS = 5;

export async function sendTestPush(token) {
  const payload = { token: token || null, delaySeconds: TEST_PUSH_DELAY_SECONDS };
  if (!PUSH_WORKER_URL) return callable('sendTestPush', payload);
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch(`${PUSH_WORKER_URL}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `worker-${res.status}`);
    err.code = 'functions/unavailable';
    throw err;
  }
  return body;
}

// ── B planı: Cloudflare Worker bildirim uç noktası ──────────────────────
// A planında (Cloud Functions) PUSH_WORKER_URL boştur ve bu çağrı yapılmaz.
export function notifyWorker(kind, payload) {
  if (!PUSH_WORKER_URL || !auth.currentUser) return;
  auth.currentUser
    .getIdToken()
    .then((token) =>
      fetch(`${PUSH_WORKER_URL}/notify/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
        keepalive: true,
      })
    )
    .catch((e) => console.warn('[ChatApp] bildirim uç noktası', e));
}
