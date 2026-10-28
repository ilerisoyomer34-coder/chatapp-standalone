// B planı Worker testleri: ID token doğrulama, servis hesabı JWT'si ve
// bildirim mantığı (Realtime Database emülatörünün REST API'sine karşı).
// Çalıştırma: npm run test:emulator
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { notifyMessage, notifyRequest, restDb, sendTestPush, serviceAccessToken, verifyIdToken } from '../../worker/src/index.js';

const enc = new TextEncoder();
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const jsonPart = (o) => b64url(enc.encode(JSON.stringify(o)));
const PROJECT = 'chatapp-d8a5b';

let keyPair;
let publicJwk;

async function signJwt(header, payload, privateKey = keyPair.privateKey) {
  const unsigned = `${jsonPart(header)}.${jsonPart(payload)}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, enc.encode(unsigned));
  return `${unsigned}.${b64url(new Uint8Array(sig))}`;
}

beforeAll(async () => {
  keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  publicJwk = { ...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
});

describe('verifyIdToken', () => {
  const now = Date.now();
  const sec = Math.floor(now / 1000);
  const good = { aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: 'user123', iat: sec - 10, exp: sec + 3600 };
  const opts = () => ({ projectId: PROJECT, now, keys: [publicJwk] });

  it('geçerli token kullanıcı kimliğini döndürür', async () => {
    const tok = await signJwt({ alg: 'RS256', kid: 'k1' }, good);
    await expect(verifyIdToken(`Bearer ${tok}`, opts())).resolves.toBe('user123');
  });
  it('başka projenin, süresi dolmuş veya imzası bozuk token reddedilir', async () => {
    const other = await signJwt({ alg: 'RS256', kid: 'k1' }, { ...good, aud: 'baska-proje' });
    await expect(verifyIdToken(`Bearer ${other}`, opts())).rejects.toMatchObject({ code: 'bad-audience' });
    const expired = await signJwt({ alg: 'RS256', kid: 'k1' }, { ...good, exp: sec - 1 });
    await expect(verifyIdToken(`Bearer ${expired}`, opts())).rejects.toMatchObject({ code: 'expired' });
    const tok = await signJwt({ alg: 'RS256', kid: 'k1' }, good);
    const tampered = tok.split('.');
    tampered[1] = jsonPart({ ...good, sub: 'admin' });
    await expect(verifyIdToken(`Bearer ${tampered.join('.')}`, opts())).rejects.toMatchObject({ code: 'bad-signature' });
  });
  it('alg=none ve eksik token reddedilir', async () => {
    const none = `${jsonPart({ alg: 'none', kid: 'k1' })}.${jsonPart(good)}.`;
    await expect(verifyIdToken(`Bearer ${none}`, opts())).rejects.toMatchObject({ status: 401 });
    await expect(verifyIdToken(undefined, opts())).rejects.toMatchObject({ code: 'missing-token' });
  });
});

describe('serviceAccessToken', () => {
  it('servis hesabı ile imzalı JWT gönderir ve belirteci önbelleğe alır', async () => {
    const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)).toString('base64');
    const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
    const sa = JSON.stringify({ client_email: 'push@chatapp-d8a5b.iam.gserviceaccount.com', private_key: pem, private_key_id: 'abc' });
    let calls = 0;
    let assertion = '';
    const fetchImpl = async (url, init) => {
      calls++;
      assertion = new URLSearchParams(init.body).get('assertion');
      return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), { status: 200 });
    };
    await expect(serviceAccessToken(sa, { fetchImpl })).resolves.toBe('ya29.test');
    await expect(serviceAccessToken(sa, { fetchImpl })).resolves.toBe('ya29.test');
    expect(calls).toBe(1);
    const [h, p, s] = assertion.split('.');
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', keyPair.publicKey, Buffer.from(s, 'base64url'), enc.encode(`${h}.${p}`));
    expect(ok).toBe(true);
    expect(JSON.parse(Buffer.from(p, 'base64url'))).toMatchObject({
      iss: 'push@chatapp-d8a5b.iam.gserviceaccount.com',
      aud: 'https://oauth2.googleapis.com/token',
    });
  });
});

describe('notifyMessage / notifyRequest (emülatör)', () => {
  const A = 'alice0000000000000000000000';
  const B = 'bob000000000000000000000000';
  const AB = [A, B].sort().join('_');
  const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';
  const db = restDb({ databaseUrl: `http://${host}`, query: '?ns=worker-test', accessToken: 'owner' });
  const fakePush = () => {
    const calls = [];
    return { calls, send: async (uid, tokens, data) => (calls.push({ uid, tokens, data }), tokens.length) };
  };

  beforeEach(async () => {
    await db.put('', {
      users: { [A]: { name: 'Alice' }, [B]: { name: 'Bob' } },
      chats: { [AB]: { type: 'direct', members: { [A]: true, [B]: true } } },
      messages: { [AB]: { m1: { from: A, text: 'Selam Bob', ts: 1000 } } },
      userChats: { [B]: { [AB]: { unread: 1, updatedAt: 1 } } },
      pushTokens: { [B]: { ['tok' + 'x'.repeat(40)]: { platform: 'web', updatedAt: 1 } } },
      requests: { [`${A}_${B}`]: { from: A, to: B, status: 'pending', ts: 5 } },
    });
  });

  it('gönderen üye ve mesaj gerçekse alıcıyı günceller ve bildirir', async () => {
    const push = fakePush();
    const res = await notifyMessage({ db, push, uid: A, chatId: AB, messageId: 'm1', appPath: '/chatapp-standalone/' });
    expect(res.results).toEqual([{ uid: B, sent: 1 }]);
    expect(await db.get(`userChats/${B}/${AB}/unread`)).toBe(2);
    expect(await db.get(`userChats/${B}/${AB}/lastMessage`)).toEqual({ text: 'Selam Bob', from: A, ts: 1000 });
    expect(push.calls[0].data).toMatchObject({ title: 'Alice', body: 'Selam Bob', chatId: AB, badge: '2' });
  });
  it('aynı mesaj için ikinci çağrı bildirim göndermez', async () => {
    const push = fakePush();
    await notifyMessage({ db, push, uid: A, chatId: AB, messageId: 'm1', appPath: '/' });
    const again = await notifyMessage({ db, push, uid: A, chatId: AB, messageId: 'm1', appPath: '/' });
    expect(again).toEqual({ duplicate: true });
    expect(push.calls).toHaveLength(1);
  });
  it('başkasının mesajı veya üyesi olunmayan sohbet için reddeder', async () => {
    const push = fakePush();
    await expect(notifyMessage({ db, push, uid: B, chatId: AB, messageId: 'm1', appPath: '/' })).rejects.toMatchObject({ status: 403 });
    await expect(notifyMessage({ db, push, uid: A, chatId: AB, messageId: 'yok', appPath: '/' })).rejects.toMatchObject({ status: 404 });
    await expect(notifyMessage({ db, push, uid: A, chatId: '../x', messageId: 'm1', appPath: '/' })).rejects.toMatchObject({ status: 400 });
  });
  it('istek: yalnızca gönderen bildirebilir; kabulde gönderenin listesi oluşur', async () => {
    const push = fakePush();
    await expect(notifyRequest({ db, push, uid: B, requestId: `${A}_${B}`, appPath: '/' })).rejects.toMatchObject({ status: 403 });
    await expect(notifyRequest({ db, push, uid: A, requestId: `${A}_${B}`, appPath: '/' })).resolves.toEqual({ sent: 1 });
    await db.patch(`requests/${A}_${B}`, { status: 'accepted', respondedAt: 9 });
    await notifyRequest({ db, push, uid: B, requestId: `${A}_${B}`, appPath: '/' });
    expect(await db.get(`userChats/${A}/${AB}`)).toEqual({ unread: 0, updatedAt: 9 });
  });
  it('test bildirimi yalnızca çağıranın kendi cihazlarına gider', async () => {
    const push = fakePush();
    const tok = 'tok' + 'x'.repeat(40);
    await expect(sendTestPush({ db, push, uid: B })).resolves.toEqual({ tokens: 1, sent: 1 });
    expect(push.calls[0]).toMatchObject({ uid: B, tokens: [tok], data: { type: 'test', tag: 'chatapp-test' } });
    // Başkasının token'ı verilse bile yalnızca kendi kayıtlı cihazlarına gider.
    await expect(sendTestPush({ db, push, uid: A, token: tok })).resolves.toEqual({ tokens: 0, sent: 0 });
    expect(push.calls).toHaveLength(1);
  });
});
