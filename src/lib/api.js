// Veritabanı işlemleri. Tüm yazmalar update() ile yalnızca ilgili yollara yapılır;
// zaman damgaları sunucu zamanı (serverTimestamp) ile yazılır.
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  child,
  endAt,
  get,
  limitToFirst,
  orderByKey,
  push,
  query,
  ref,
  runTransaction,
  serverTimestamp,
  startAt,
  update,
} from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions, PUSH_WORKER_URL } from '../firebase.js';
import { colorFor, messagePreview } from './format.js';
import { normalizeUsername } from './username.js';

export const MAX_TEXT = 4000;
export const MAX_INLINE_ATTACHMENT = 5 * 1024 * 1024;

export const chatIdFor = (a, b) => [a, b].sort().join('_');
export const otherMember = (chatId, me) => chatId.split('_').find((u) => u !== me) || null;

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
  if (!result.committed || result.snapshot.val() !== uid) {
    const err = new Error('username-taken');
    err.code = 'username-taken';
    throw err;
  }
  await update(ref(db), {
    [`users/${uid}/username`]: uname,
    [`users/${uid}/name`]: name.trim(),
    [`users/${uid}/about`]: '',
    [`users/${uid}/color`]: colorFor(uid),
    [`users/${uid}/createdAt`]: serverTimestamp(),
  });
  return uname;
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

export async function fetchProfile(uid) {
  const snap = await get(ref(db, `users/${uid}`));
  return snap.exists() ? { uid, ...snap.val() } : null;
}

// ── İstekler ────────────────────────────────────────────────────────────
export async function sendChatRequest(me, to) {
  const id = `${me}_${to}`;
  await update(ref(db), {
    [`requests/${id}`]: { from: me, to, status: 'pending', ts: serverTimestamp() },
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
  await update(ref(db), {
    [`userChats/${me}/${chatId}/updatedAt`]: serverTimestamp(),
  });
}

// ── Mesajlar ────────────────────────────────────────────────────────────
export function newMessageId(chatId) {
  return push(child(ref(db), `messages/${chatId}`)).key;
}

export async function sendMessage(me, chatId, { id, text, attachment }) {
  const messageId = id || newMessageId(chatId);
  const msg = { from: me, ts: serverTimestamp() };
  const clean = (text || '').trim();
  if (clean) msg.text = clean.slice(0, MAX_TEXT);
  const updates = {};
  if (attachment) {
    msg.attachment = { name: attachment.name.slice(0, 200), size: attachment.size, type: (attachment.type || 'application/octet-stream').slice(0, 100), inline: true };
    updates[`attachments/${chatId}/${messageId}`] = attachment.data;
  }
  updates[`messages/${chatId}/${messageId}`] = msg;
  updates[`userChats/${me}/${chatId}/lastMessage`] = { text: messagePreview(msg).slice(0, 200), from: me, ts: serverTimestamp() };
  updates[`userChats/${me}/${chatId}/updatedAt`] = serverTimestamp();
  updates[`userChats/${me}/${chatId}/unread`] = 0;
  updates[`typing/${chatId}/${me}`] = null;
  await update(ref(db), updates);
  notifyWorker('message', { chatId, messageId });
  return messageId;
}

export async function loadAttachmentData(chatId, messageId) {
  const snap = await get(ref(db, `attachments/${chatId}/${messageId}`));
  return snap.val();
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

// ── Yönetici ────────────────────────────────────────────────────────────
export async function adminSetUserDisabled(uid, disabled) {
  const fn = httpsCallable(functions, 'adminSetUserDisabled');
  const res = await fn({ uid, disabled });
  return res.data;
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
    .catch((err) => console.warn('[ChatApp] bildirim uç noktası', err));
}
