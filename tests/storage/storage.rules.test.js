// Cloud Storage güvenlik kuralı testleri (Storage + Firestore emülatörü).
// Sohbet üyeliği Firestore'daki chatAccess/{chatId} belgesinden okunur.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

const uid = (name) => (name + '0'.repeat(28)).slice(0, 28);
const ALICE = uid('alice');
const BOB = uid('bob');
const EVE = uid('eve');
const CHAT = [ALICE, BOB].sort().join('_');
const GROUP = '-Ngrup1';

let env;
const hostPort = (v, d) => (v || d).split(':');

beforeAll(async () => {
  const [sh, sp] = hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9199');
  const [fh, fp] = hostPort(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  env = await initializeTestEnvironment({
    projectId: 'demo-chatapp',
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: sh, port: Number(sp) },
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: fh, port: Number(fp) },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    await setDoc(doc(fs, 'chatAccess', CHAT), { type: 'direct', members: { [ALICE]: true, [BOB]: true }, admins: {} });
    await setDoc(doc(fs, 'chatAccess', GROUP), { type: 'group', members: { [ALICE]: true, [BOB]: true }, admins: { [ALICE]: true } });
    await uploadBytes(ref(ctx.storage(), `chats/${CHAT}/m1/a.txt`), new Uint8Array([1, 2, 3]), {
      contentType: 'text/plain',
      customMetadata: { uploader: ALICE },
    });
  });
});

const storage = (who) => (who ? env.authenticatedContext(who).storage() : env.unauthenticatedContext().storage());
const bytes = (n) => new Uint8Array(n);

describe('sohbet ekleri', () => {
  it('üye okuyabilir, üye olmayan ve giriş yapmamış okuyamaz', async () => {
    await assertSucceeds(getBytes(ref(storage(BOB), `chats/${CHAT}/m1/a.txt`)));
    await assertFails(getBytes(ref(storage(EVE), `chats/${CHAT}/m1/a.txt`)));
    await assertFails(getBytes(ref(storage(null), `chats/${CHAT}/m1/a.txt`)));
  });
  it('üye kendi adına yükler; başkası adına veya üye değilse yükleyemez', async () => {
    const meta = (u) => ({ contentType: 'application/pdf', customMetadata: { uploader: u } });
    await assertSucceeds(uploadBytes(ref(storage(BOB), `chats/${CHAT}/m2/b.pdf`), bytes(10), meta(BOB)));
    await assertFails(uploadBytes(ref(storage(BOB), `chats/${CHAT}/m3/b.pdf`), bytes(10), meta(ALICE)));
    await assertFails(uploadBytes(ref(storage(EVE), `chats/${CHAT}/m4/b.pdf`), bytes(10), meta(EVE)));
  });
  it('25 MB üstü reddedilir', async () => {
    await assertFails(
      uploadBytes(ref(storage(BOB), `chats/${CHAT}/m5/big.bin`), bytes(25 * 1024 * 1024 + 1), { customMetadata: { uploader: BOB } })
    );
  });
  it('yalnızca yükleyen silebilir', async () => {
    await assertFails(deleteObject(ref(storage(BOB), `chats/${CHAT}/m1/a.txt`)));
    await assertSucceeds(deleteObject(ref(storage(ALICE), `chats/${CHAT}/m1/a.txt`)));
  });
});

describe('profil ve grup fotoğrafları', () => {
  it('profil fotoğrafını yalnızca sahibi yükler; en fazla 2 MB görsel', async () => {
    const img = { contentType: 'image/jpeg' };
    await assertSucceeds(uploadBytes(ref(storage(ALICE), `avatars/${ALICE}/avatar.jpg`), bytes(1000), img));
    await assertFails(uploadBytes(ref(storage(BOB), `avatars/${ALICE}/avatar.jpg`), bytes(1000), img));
    await assertFails(uploadBytes(ref(storage(ALICE), `avatars/${ALICE}/avatar.jpg`), bytes(2 * 1024 * 1024 + 1), img));
    await assertFails(uploadBytes(ref(storage(ALICE), `avatars/${ALICE}/x.html`), bytes(10), { contentType: 'text/html' }));
    await assertSucceeds(getBytes(ref(storage(BOB), `avatars/${ALICE}/avatar.jpg`)));
  });
  it('grup fotoğrafını yalnızca grup yöneticisi yükler', async () => {
    const img = { contentType: 'image/jpeg' };
    await assertSucceeds(uploadBytes(ref(storage(ALICE), `groups/${GROUP}/photo.jpg`), bytes(1000), img));
    await assertFails(uploadBytes(ref(storage(BOB), `groups/${GROUP}/photo.jpg`), bytes(1000), img));
    await assertSucceeds(getBytes(ref(storage(BOB), `groups/${GROUP}/photo.jpg`)));
    await assertFails(getBytes(ref(storage(EVE), `groups/${GROUP}/photo.jpg`)));
  });
});
