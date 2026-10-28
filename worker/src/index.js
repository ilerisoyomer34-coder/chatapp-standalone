// ChatApp — B planı: Cloudflare Workers bildirim uç noktası (Blaze planı olmadan).
//
// İstemci mesajı yazdıktan sonra POST /notify/message { chatId, messageId } çağırır
// (Authorization: Bearer <Firebase ID token>). Worker:
//   1. ID token'ı Google'ın açık anahtarlarıyla doğrular (aud/iss/exp kontrolü),
//   2. gönderenin sohbet üyesi olduğunu ve mesajın gerçekten var olduğunu kontrol eder,
//   3. alıcıların userChats kaydını günceller (unread +1, lastMessage),
//   4. FCM HTTP v1 API'sine servis hesabıyla "data" bildirimi gönderir.
// Servis hesabı anahtarı yalnızca Worker'ın gizli değişkeninde (SERVICE_ACCOUNT_JSON) durur.

const GOOGLE_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = [
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/firebase.messaging',
].join(' ');
const TTL_SECONDS = 60 * 60 * 24;
const ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

// ── yardımcılar ─────────────────────────────────────────────────────────
const enc = new TextEncoder();

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const jsonB64url = (obj) => bytesToB64url(enc.encode(JSON.stringify(obj)));

function decodePart(part) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
}

function truncate(value, max) {
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max).join('') + '…' : value;
}

function cleanText(msg) {
  return typeof msg.text === 'string' ? msg.text.replace(/\s+/g, ' ').trim() : '';
}

function kindOf(a) {
  const type = (a && a.type) || '';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
}

export function messagePreview(msg) {
  if (msg.deleted) return 'Bu mesaj silindi';
  const text = cleanText(msg);
  if (text) return truncate(text, 199);
  if (!msg.attachment) return '';
  const k = kindOf(msg.attachment);
  if (k === 'image') return '📷 Fotoğraf';
  if (k === 'audio') return '🎤 Sesli mesaj';
  return truncate(`📎 ${msg.attachment.name || 'Dosya'}`, 199);
}

export function notificationBody(msg) {
  const text = cleanText(msg);
  if (!msg.attachment) return text ? truncate(text, 100) : 'Yeni mesaj';
  const k = kindOf(msg.attachment);
  const label = k === 'image' ? 'Fotoğraf' : k === 'audio' ? 'Sesli mesaj' : `Dosya: ${msg.attachment.name || 'dosya'}`;
  return truncate(text ? `${label}: ${text}` : label, 100);
}

const isMuted = (v, now) => v === true || (typeof v === 'number' && v > now);
const chatIdFor = (a, b) => [a, b].sort().join('_');

// ── Firebase ID token doğrulama ─────────────────────────────────────────
let jwksCache = { keys: null, until: 0 };

async function googleKeys(fetchImpl, now) {
  if (jwksCache.keys && jwksCache.until > now) return jwksCache.keys;
  const res = await fetchImpl(GOOGLE_JWKS);
  if (!res.ok) throw new HttpError(503, 'jwks-unavailable');
  const body = await res.json();
  const maxAge = Number((/max-age=(\d+)/.exec(res.headers.get('cache-control') || '') || [])[1]) || 3600;
  jwksCache = { keys: body.keys || [], until: now + maxAge * 1000 };
  return jwksCache.keys;
}

export async function verifyIdToken(authHeader, { projectId, fetchImpl = fetch, now = Date.now(), keys }) {
  const m = /^Bearer (.+)$/.exec(authHeader || '');
  if (!m) throw new HttpError(401, 'missing-token');
  const parts = m[1].split('.');
  if (parts.length !== 3) throw new HttpError(401, 'invalid-token');
  let header;
  let payload;
  try {
    header = decodePart(parts[0]);
    payload = decodePart(parts[1]);
  } catch {
    throw new HttpError(401, 'invalid-token');
  }
  if (header.alg !== 'RS256' || !header.kid) throw new HttpError(401, 'invalid-token');
  const jwks = keys || (await googleKeys(fetchImpl, now));
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw new HttpError(401, 'unknown-key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new HttpError(401, 'bad-signature');
  const sec = Math.floor(now / 1000);
  if (payload.aud !== projectId) throw new HttpError(401, 'bad-audience');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new HttpError(401, 'bad-issuer');
  if (typeof payload.exp !== 'number' || payload.exp <= sec) throw new HttpError(401, 'expired');
  if (typeof payload.iat !== 'number' || payload.iat > sec + 300) throw new HttpError(401, 'bad-iat');
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw new HttpError(401, 'bad-subject');
  return payload.sub;
}

// ── servis hesabıyla OAuth erişim belirteci ─────────────────────────────
let tokenCache = { token: null, until: 0 };

function pemToPkcs8(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return b64urlToBytes(b64.replace(/\+/g, '-').replace(/\//g, '_'));
}

export async function serviceAccessToken(serviceAccountJson, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (tokenCache.token && tokenCache.until > now) return tokenCache.token;
  const sa = JSON.parse(serviceAccountJson);
  const iat = Math.floor(now / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: sa.private_key_id };
  const claims = { iss: sa.client_email, scope: SCOPES, aud: OAUTH_TOKEN_URL, iat, exp: iat + 3600 };
  const unsigned = `${jsonB64url(header)}.${jsonB64url(claims)}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned));
  const res = await fetchImpl(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${bytesToB64url(sig)}`,
  });
  if (!res.ok) throw new HttpError(503, 'oauth-failed');
  const body = await res.json();
  tokenCache = { token: body.access_token, until: now + (Number(body.expires_in) || 3600) * 1000 - 60000 };
  return tokenCache.token;
}

// ── Realtime Database REST ──────────────────────────────────────────────
export function restDb({ databaseUrl, query = '', accessToken, fetchImpl = fetch }) {
  const url = (path) => `${databaseUrl.replace(/\/+$/, '')}/${path}.json${query}`;
  const call = async (method, path, body) => {
    const res = await fetchImpl(url(path), {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new HttpError(502, `db-${res.status}`);
    return res.json();
  };
  return {
    get: (path) => call('GET', path),
    patch: (path, body) => call('PATCH', path, body),
    put: (path, body) => call('PUT', path, body),
    remove: (path) => call('DELETE', path),
  };
}

// ── FCM HTTP v1 ─────────────────────────────────────────────────────────
export function fcmSender({ projectId, accessToken, db, fetchImpl = fetch }) {
  return {
    async send(uid, tokens, data) {
      let sent = 0;
      await Promise.all(
        tokens.map(async (token) => {
          const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: { token, data, webpush: { headers: { Urgency: 'high', TTL: String(TTL_SECONDS) } } } }),
          });
          if (res.ok) {
            sent++;
            return;
          }
          const err = await res.json().catch(() => ({}));
          const status = err.error && err.error.status;
          const details = JSON.stringify(err.error && err.error.details ? err.error.details : []);
          // Geçersiz/kaydı silinmiş token'ları temizle.
          if (res.status === 404 || status === 'NOT_FOUND' || /UNREGISTERED/.test(details) || (res.status === 400 && /registration token/i.test(JSON.stringify(err)))) {
            await db.remove(`pushTokens/${uid}/${token}`).catch(() => {});
          }
        })
      );
      return sent;
    },
  };
}

// ── bildirim mantığı (Cloud Functions sürümüyle aynı kurallar) ───────────
async function nameOf(db, uid) {
  const n = await db.get(`users/${uid}/name`);
  return typeof n === 'string' && n ? n : 'Biri';
}

export async function notifyMessage({ db, push, uid, chatId, messageId, appPath, now = Date.now() }) {
  if (!ID_RE.test(chatId || '') || !ID_RE.test(messageId || '')) throw new HttpError(400, 'bad-input');
  const [msg, chat] = await Promise.all([db.get(`messages/${chatId}/${messageId}`), db.get(`chats/${chatId}`)]);
  if (!msg) throw new HttpError(404, 'no-message');
  if (msg.from !== uid) throw new HttpError(403, 'not-sender');
  if (!chat || !chat.members || chat.members[uid] !== true) throw new HttpError(403, 'not-member');
  // Aynı mesaj için ikinci çağrı yok sayılır.
  if (await db.get(`pushLog/${chatId}/${messageId}`)) return { duplicate: true };
  await db.put(`pushLog/${chatId}/${messageId}`, { '.sv': 'timestamp' });

  const ts = typeof msg.ts === 'number' ? msg.ts : now;
  const senderName = await nameOf(db, uid);
  const title = chat.type === 'group' ? `${chat.name || 'Grup'} · ${senderName}` : senderName;
  const body = notificationBody(msg);
  const lastMessage = { text: messagePreview(msg), from: uid, ts };
  const recipients = Object.keys(chat.members).filter((u) => u !== uid && chat.members[u] === true);

  const results = [];
  for (const r of recipients) {
    if ((await db.get(`blocks/${r}/${uid}`)) === true) {
      results.push({ uid: r, skipped: 'blocked' });
      continue;
    }
    await db.patch(`userChats/${r}/${chatId}`, { unread: { '.sv': { increment: 1 } } });
    const prevTs = await db.get(`userChats/${r}/${chatId}/lastMessage/ts`);
    if (!(typeof prevTs === 'number' && prevTs > ts)) await db.patch(`userChats/${r}/${chatId}`, { lastMessage, updatedAt: ts });

    const [uc, presence, tokensObj] = await Promise.all([db.get(`userChats/${r}`), db.get(`presence/${r}`), db.get(`pushTokens/${r}`)]);
    if (isMuted(uc && uc[chatId] && uc[chatId].muted, now)) {
      results.push({ uid: r, skipped: 'muted' });
      continue;
    }
    const p = presence || {};
    const online = !!(p.connections && Object.keys(p.connections).length) || p.online === true;
    if (online && p.activeChat === chatId) {
      results.push({ uid: r, skipped: 'active' });
      continue;
    }
    const tokens = Object.keys(tokensObj || {});
    if (!tokens.length) {
      results.push({ uid: r, skipped: 'no-tokens' });
      continue;
    }
    let badge = 0;
    for (const c of Object.values(uc || {})) if (!isMuted(c && c.muted, now)) badge += Number(c && c.unread) || 0;
    const sent = await push.send(r, tokens, {
      type: 'message',
      title,
      body,
      chatId,
      messageId,
      url: `${appPath}?chat=${encodeURIComponent(chatId)}`,
      tag: `chat-${chatId}`,
      ts: String(ts),
      badge: String(badge),
    });
    results.push({ uid: r, sent });
  }
  return { results };
}

export async function notifyRequest({ db, push, uid, requestId, appPath, now = Date.now() }) {
  if (!ID_RE.test(requestId || '')) throw new HttpError(400, 'bad-input');
  const req = await db.get(`requests/${requestId}`);
  if (!req || requestId !== `${req.from}_${req.to}`) throw new HttpError(404, 'no-request');

  if (req.status === 'pending' && req.from === uid) {
    const logKey = `pushLog/requests/${requestId}_${req.ts}`;
    if (await db.get(logKey)) return { duplicate: true };
    await db.put(logKey, { '.sv': 'timestamp' });
    if ((await db.get(`blocks/${req.to}/${req.from}`)) === true) return { skipped: 'blocked' };
    const tokens = Object.keys((await db.get(`pushTokens/${req.to}`)) || {});
    if (!tokens.length) return { skipped: 'no-tokens' };
    const name = await nameOf(db, req.from);
    const sent = await push.send(req.to, tokens, {
      type: 'request',
      title: 'Yeni sohbet isteği',
      body: `${name} sana sohbet isteği gönderdi.`,
      requestId,
      url: appPath,
      tag: `request-${requestId}`,
      ts: String(req.ts || now),
    });
    return { sent };
  }

  if (req.status === 'accepted' && req.to === uid) {
    const logKey = `pushLog/requests/${requestId}_accepted_${req.respondedAt}`;
    if (await db.get(logKey)) return { duplicate: true };
    await db.put(logKey, { '.sv': 'timestamp' });
    const chatId = chatIdFor(req.from, req.to);
    if (!(await db.get(`userChats/${req.from}/${chatId}`))) {
      await db.patch(`userChats/${req.from}/${chatId}`, { unread: 0, updatedAt: req.respondedAt || now });
    }
    if ((await db.get(`blocks/${req.from}/${req.to}`)) === true) return { skipped: 'blocked' };
    const tokens = Object.keys((await db.get(`pushTokens/${req.from}`)) || {});
    if (!tokens.length) return { skipped: 'no-tokens' };
    const name = await nameOf(db, req.to);
    const sent = await push.send(req.from, tokens, {
      type: 'request-accepted',
      title: name,
      body: `${name} sohbet isteğini kabul etti. Artık yazışabilirsiniz.`,
      chatId,
      url: `${appPath}?chat=${encodeURIComponent(chatId)}`,
      tag: `chat-${chatId}`,
      ts: String(req.respondedAt || now),
    });
    return { sent };
  }
  throw new HttpError(403, 'not-allowed');
}

// Test bildirimi: yalnızca çağıranın kendi cihazlarına (Cloud Functions'taki sendTestPush ile aynı).
export async function sendTestPush({ db, push, uid, token, now = Date.now() }) {
  const all = Object.keys((await db.get(`pushTokens/${uid}`)) || {});
  const tokens = typeof token === 'string' && all.includes(token) ? [token] : all;
  if (!tokens.length) return { tokens: 0, sent: 0 };
  const sent = await push.send(uid, tokens, {
    type: 'test',
    title: 'ChatApp',
    body: 'Test bildirimi: bildirimler bu cihazda çalışıyor.',
    url: '/chatapp-standalone/',
    tag: 'chatapp-test',
    ts: String(now),
  });
  return { tokens: tokens.length, sent };
}

// ── HTTP giriş noktası ──────────────────────────────────────────────────
function corsHeaders(env, origin) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env, request.headers.get('Origin') || '');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405, cors);
    try {
      const uid = await verifyIdToken(request.headers.get('Authorization'), { projectId: env.PROJECT_ID });
      const body = await request.json().catch(() => ({}));
      const accessToken = await serviceAccessToken(env.SERVICE_ACCOUNT_JSON);
      const db = restDb({ databaseUrl: env.DATABASE_URL, accessToken });
      const push = fcmSender({ projectId: env.PROJECT_ID, accessToken, db });
      const appPath = env.APP_PATH || '/chatapp-standalone/';
      const path = new URL(request.url).pathname;
      let result;
      if (path === '/notify/message') result = await notifyMessage({ db, push, uid, chatId: body.chatId, messageId: body.messageId, appPath });
      else if (path === '/notify/request') result = await notifyRequest({ db, push, uid, requestId: body.requestId, appPath });
      else if (path === '/test') {
        const delay = Math.min(Math.max(Number(body.delaySeconds) || 0, 0), 10);
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay * 1000));
        result = await sendTestPush({ db, push, uid, token: body.token });
      }
      else throw new HttpError(404, 'not-found');
      return json({ ok: true, ...result }, 200, cors);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) console.error('worker hata', err);
      return json({ error: err instanceof HttpError ? err.code : 'internal' }, status, cors);
    }
  },
};
