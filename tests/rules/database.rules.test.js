// Realtime Database güvenlik kuralı testleri.
// Çalıştırma: npm run test:rules  (Firebase Emulator gerekir: Java 21+)
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/database';

const TS = firebase.database.ServerValue.TIMESTAMP;
const uid = (name) => (name + '0'.repeat(28)).slice(0, 28);
const ALICE = uid('alice');
const BOB = uid('bob');
const CAROL = uid('carol');
const ADMIN = uid('admin');
const MALLORY = uid('mallory');
const chatIdOf = (a, b) => [a, b].sort().join('_');
const AB = chatIdOf(ALICE, BOB);

let env;

function profile(username, name) {
  return { username, name, color: '#00A884', createdAt: 1700000000000 };
}

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref().set({
      users: {
        [ALICE]: profile('alice', 'Alice'),
        [BOB]: profile('bob', 'Bob'),
        [CAROL]: profile('carol', 'Carol'),
        [ADMIN]: profile('admin', 'Yönetici'),
        [MALLORY]: { ...profile('mallory', 'Mallory'), disabled: true },
      },
      usernames: { alice: ALICE, bob: BOB, carol: CAROL, admin: ADMIN, mallory: MALLORY },
      admins: { [ADMIN]: true },
      requests: {
        [`${ALICE}_${BOB}`]: { from: ALICE, to: BOB, status: 'accepted', ts: 1700000000000 },
      },
      chats: {
        [AB]: { type: 'direct', members: { [ALICE]: true, [BOB]: true }, createdAt: 1700000000000 },
      },
      messages: {
        [AB]: {
          m1: { from: ALICE, text: 'Merhaba', ts: 1700000000001 },
        },
      },
    });
  });
}

const db = (who) => (who ? env.authenticatedContext(who).database() : env.unauthenticatedContext().database());

beforeAll(async () => {
  const [host, port] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-chatapp',
    database: { rules: readFileSync('database.rules.json', 'utf8'), host, port: Number(port) },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearDatabase();
  await seed();
});

describe('giriş yapmamış kullanıcı', () => {
  it('kökten (/.json) hiçbir şey okuyamaz', async () => {
    await assertFails(db(null).ref().get());
  });
  it('profil, kullanıcı adı, sohbet ve mesaj okuyamaz', async () => {
    await assertFails(db(null).ref(`users/${ALICE}`).get());
    await assertFails(db(null).ref('usernames/alice').get());
    await assertFails(db(null).ref(`chats/${AB}`).get());
    await assertFails(db(null).ref(`messages/${AB}`).get());
  });
  it('hiçbir yere yazamaz', async () => {
    await assertFails(db(null).ref('usernames/yeni').set('x'.repeat(28)));
    await assertFails(db(null).ref(`messages/${AB}/m2`).set({ from: ALICE, text: 'x', ts: TS }));
    await assertFails(db(null).ref('db').set({ users: {} }));
  });
});

describe('kayıt ve kullanıcı adı', () => {
  const NEW = uid('newbie');
  it('yeni kullanıcı benzersiz kullanıcı adını transaction ile alır ve profil yazar', async () => {
    const d = db(NEW);
    const res = await d.ref('usernames/yeni_kisi').transaction((cur) => (cur === null ? NEW : undefined));
    if (!res.committed) throw new Error('transaction commit olmadı');
    await assertSucceeds(
      d.ref(`users/${NEW}`).set({ username: 'yeni_kisi', name: 'Yeni Kişi', color: '#25D366', createdAt: TS })
    );
  });
  it('alınmış kullanıcı adının üzerine yazamaz', async () => {
    await assertFails(db(NEW).ref('usernames/alice').set(NEW));
  });
  it('geçersiz biçimli kullanıcı adı reddedilir', async () => {
    await assertFails(db(NEW).ref('usernames/Büyük').set(NEW));
    await assertFails(db(NEW).ref('usernames/ab').set(NEW));
    await assertFails(db(NEW).ref('usernames/' + 'a'.repeat(21)).set(NEW));
  });
  it('başkası adına kullanıcı adı alınamaz', async () => {
    await assertFails(db(NEW).ref('usernames/baskasi').set(BOB));
  });
  it('profili olan kullanıcı ikinci kullanıcı adı alamaz', async () => {
    await assertFails(db(ALICE).ref('usernames/alice2').set(ALICE));
  });
  it('profil kullanıcı adı, sahibinin eşlemesi değilse yazılamaz', async () => {
    await assertFails(
      db(NEW).ref(`users/${NEW}`).set({ username: 'bob', name: 'Sahte', createdAt: TS })
    );
  });
  it('görünen ad 40 karakteri geçemez', async () => {
    await assertFails(db(ALICE).ref(`users/${ALICE}/name`).set('x'.repeat(41)));
    await assertSucceeds(db(ALICE).ref(`users/${ALICE}/name`).set('Alice Yılmaz'));
  });
  it('şifre benzeri veya bilinmeyen alan yazılamaz', async () => {
    await assertFails(db(ALICE).ref(`users/${ALICE}/pass`).set('123456'));
  });
  it('kullanıcı kendini devre dışı / etkin işaretleyemez', async () => {
    await assertFails(db(ALICE).ref(`users/${ALICE}/disabled`).set(true));
    await assertFails(db(MALLORY).ref(`users/${MALLORY}/disabled`).set(false));
  });
  it('başkasının profiline yazamaz', async () => {
    await assertFails(db(ALICE).ref(`users/${BOB}/name`).set('Hacklendi'));
  });
});

describe('kullanıcı listesi ve arama', () => {
  it('normal kullanıcı tek bir profili okuyabilir', async () => {
    await assertSucceeds(db(ALICE).ref(`users/${BOB}`).get());
  });
  it('normal kullanıcı tüm kullanıcı listesini indiremez', async () => {
    await assertFails(db(ALICE).ref('users').get());
    await assertFails(db(ALICE).ref('usernames').get());
  });
  it('kullanıcı adı ön ek araması en fazla 20 sonuçla yapılabilir', async () => {
    const d = db(ALICE);
    await assertSucceeds(d.ref('usernames').orderByKey().startAt('b').endAt('b').limitToFirst(20).get());
    await assertFails(d.ref('usernames').orderByKey().startAt('b').endAt('b').limitToFirst(21).get());
    await assertFails(d.ref('usernames').orderByKey().startAt('b').get());
  });
  it('yönetici kullanıcı listesini okuyabilir', async () => {
    await assertSucceeds(db(ADMIN).ref('users').get());
  });
  it('kimse kendini yönetici yapamaz', async () => {
    await assertFails(db(ALICE).ref(`admins/${ALICE}`).set(true));
    await assertSucceeds(db(ALICE).ref(`admins/${ALICE}`).get());
    await assertFails(db(ALICE).ref(`admins/${ADMIN}`).get());
  });
});

describe('sohbet istekleri', () => {
  it('kullanıcı kendi adına istek gönderebilir', async () => {
    await assertSucceeds(
      db(CAROL).ref(`requests/${CAROL}_${ALICE}`).set({ from: CAROL, to: ALICE, status: 'pending', ts: TS })
    );
  });
  it('başkası adına istek gönderemez', async () => {
    await assertFails(
      db(CAROL).ref(`requests/${BOB}_${ALICE}`).set({ from: BOB, to: ALICE, status: 'pending', ts: TS })
    );
  });
  it('kendine veya devre dışı kullanıcıya istek gönderemez', async () => {
    await assertFails(
      db(CAROL).ref(`requests/${CAROL}_${CAROL}`).set({ from: CAROL, to: CAROL, status: 'pending', ts: TS })
    );
    await assertFails(
      db(CAROL).ref(`requests/${CAROL}_${MALLORY}`).set({ from: CAROL, to: MALLORY, status: 'pending', ts: TS })
    );
  });
  it('istekleri yalnızca kendisine gelen/kendi gönderdiği sorgu ile listeleyebilir', async () => {
    await assertSucceeds(db(BOB).ref('requests').orderByChild('to').equalTo(BOB).get());
    await assertSucceeds(db(ALICE).ref('requests').orderByChild('from').equalTo(ALICE).get());
    await assertFails(db(CAROL).ref('requests').orderByChild('to').equalTo(BOB).get());
    await assertFails(db(CAROL).ref('requests').get());
    await assertFails(db(CAROL).ref(`requests/${ALICE}_${BOB}`).get());
  });
  it('isteği yalnızca alıcı kabul/ret edebilir', async () => {
    await assertSucceeds(
      db(CAROL).ref(`requests/${CAROL}_${BOB}`).set({ from: CAROL, to: BOB, status: 'pending', ts: TS })
    );
    await assertFails(db(CAROL).ref(`requests/${CAROL}_${BOB}`).update({ status: 'accepted', respondedAt: TS }));
    await assertSucceeds(db(BOB).ref(`requests/${CAROL}_${BOB}`).update({ status: 'rejected', respondedAt: TS }));
  });
  it('gönderen sonucu "görüldü" işaretleyebilir ama durumu değiştiremez', async () => {
    await assertSucceeds(db(ALICE).ref(`requests/${ALICE}_${BOB}/seenBySender`).set(true));
    await assertFails(db(ALICE).ref(`requests/${ALICE}_${BOB}/status`).set('pending'));
  });
  it('gönderen bekleyen isteğini geri çekebilir, alıcı silemez', async () => {
    await assertSucceeds(
      db(CAROL).ref(`requests/${CAROL}_${BOB}`).set({ from: CAROL, to: BOB, status: 'pending', ts: TS })
    );
    await assertFails(db(BOB).ref(`requests/${CAROL}_${BOB}`).remove());
    await assertSucceeds(db(CAROL).ref(`requests/${CAROL}_${BOB}`).remove());
  });
  it('reddedilen istek 24 saat dolmadan yeniden gönderilemez', async () => {
    const id = `${CAROL}_${BOB}`;
    await env.withSecurityRulesDisabled((ctx) =>
      ctx.database().ref(`requests/${id}`).set({ from: CAROL, to: BOB, status: 'rejected', ts: Date.now() - 3600000 })
    );
    await assertFails(db(CAROL).ref(`requests/${id}`).set({ from: CAROL, to: BOB, status: 'pending', ts: TS }));
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref(`requests/${id}/ts`).set(Date.now() - 2 * 86400000));
    await assertSucceeds(db(CAROL).ref(`requests/${id}`).set({ from: CAROL, to: BOB, status: 'pending', ts: TS }));
  });
  it('karşı taraf zaten istek göndermişse ters istek gönderilemez', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      ctx.database().ref(`requests/${BOB}_${CAROL}`).set({ from: BOB, to: CAROL, status: 'pending', ts: 1 })
    );
    await assertFails(
      db(CAROL).ref(`requests/${CAROL}_${BOB}`).set({ from: CAROL, to: BOB, status: 'pending', ts: TS })
    );
  });
  it('engellenen kullanıcı istek gönderemez', async () => {
    await assertSucceeds(db(ALICE).ref(`blocks/${ALICE}/${CAROL}`).set(true));
    await assertFails(
      db(CAROL).ref(`requests/${CAROL}_${ALICE}`).set({ from: CAROL, to: ALICE, status: 'pending', ts: TS })
    );
  });
});

describe('sohbet oluşturma', () => {
  it('kabul edilmiş istek olmadan sohbet kurulamaz', async () => {
    const cid = chatIdOf(ALICE, CAROL);
    await assertFails(
      db(CAROL).ref(`chats/${cid}`).set({ type: 'direct', members: { [ALICE]: true, [CAROL]: true }, createdAt: TS })
    );
  });
  it('istek kabulü ile sohbet aynı güncellemede kurulabilir', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      ctx.database().ref(`requests/${CAROL}_${BOB}`).set({ from: CAROL, to: BOB, status: 'pending', ts: 1 })
    );
    const cid = chatIdOf(BOB, CAROL);
    await assertSucceeds(
      db(BOB).ref().update({
        [`requests/${CAROL}_${BOB}/status`]: 'accepted',
        [`requests/${CAROL}_${BOB}/respondedAt`]: TS,
        [`chats/${cid}`]: { type: 'direct', members: { [BOB]: true, [CAROL]: true }, createdAt: TS },
        [`userChats/${BOB}/${cid}`]: { unread: 0, updatedAt: TS },
      })
    );
  });
  it('sohbete üçüncü kişi eklenemez, var olan sohbet değiştirilemez', async () => {
    await assertFails(db(ALICE).ref(`chats/${AB}/members/${CAROL}`).set(true));
  });
  it('üye olmayan sohbeti okuyamaz', async () => {
    await assertFails(db(CAROL).ref(`chats/${AB}`).get());
    await assertSucceeds(db(BOB).ref(`chats/${AB}`).get());
  });
});

describe('mesajlar', () => {
  it('üye kendi adına, sunucu zamanıyla mesaj yazabilir', async () => {
    await assertSucceeds(db(BOB).ref(`messages/${AB}/m2`).set({ from: BOB, text: 'Selam', ts: TS }));
  });
  it('başkası adına mesaj yazılamaz', async () => {
    await assertFails(db(BOB).ref(`messages/${AB}/m2`).set({ from: ALICE, text: 'Sahte', ts: TS }));
  });
  it('istemci saatiyle (ts != now) mesaj yazılamaz', async () => {
    await assertFails(db(BOB).ref(`messages/${AB}/m2`).set({ from: BOB, text: 'Selam', ts: 123 }));
  });
  it('4000 karakterden uzun mesaj reddedilir', async () => {
    await assertFails(db(BOB).ref(`messages/${AB}/m2`).set({ from: BOB, text: 'x'.repeat(4001), ts: TS }));
    await assertSucceeds(db(BOB).ref(`messages/${AB}/m2`).set({ from: BOB, text: 'x'.repeat(4000), ts: TS }));
  });
  it('üye olmayan mesajları okuyamaz ve yazamaz', async () => {
    await assertFails(db(CAROL).ref(`messages/${AB}`).get());
    await assertFails(db(CAROL).ref(`messages/${AB}`).orderByChild('ts').limitToLast(50).get());
    await assertFails(db(CAROL).ref(`messages/${AB}/m2`).set({ from: CAROL, text: 'Merhaba', ts: TS }));
  });
  it('üye son 50 mesajı ts sırasıyla okuyabilir', async () => {
    await assertSucceeds(db(BOB).ref(`messages/${AB}`).orderByChild('ts').limitToLast(50).get());
  });
  it('başkasının mesajı düzenlenemez veya silinemez', async () => {
    await assertFails(db(BOB).ref(`messages/${AB}/m1/text`).set('Değişti'));
    await assertFails(db(BOB).ref(`messages/${AB}/m1`).remove());
  });
  it('sahibi kendi mesajını düzenleyebilir ve silebilir', async () => {
    await assertSucceeds(db(ALICE).ref(`messages/${AB}/m1`).update({ text: 'Merhaba!', editedAt: TS }));
    await assertSucceeds(db(ALICE).ref(`messages/${AB}/m1`).remove());
  });
  it('mesaj zamanı sonradan değiştirilemez', async () => {
    await assertFails(db(ALICE).ref(`messages/${AB}/m1/ts`).set(TS));
  });
  it('devre dışı bırakılan kullanıcı okuyamaz ve yazamaz', async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref(`users/${BOB}/disabled`).set(true));
    await assertFails(db(BOB).ref(`messages/${AB}`).get());
    await assertFails(db(BOB).ref(`messages/${AB}/m2`).set({ from: BOB, text: 'x', ts: TS }));
  });
  it('ek verisini yalnızca mesajın sahibi aynı güncellemede yazabilir', async () => {
    await assertSucceeds(
      db(BOB).ref().update({
        [`messages/${AB}/m3`]: { from: BOB, ts: TS, attachment: { name: 'a.txt', size: 3, type: 'text/plain', inline: true } },
        [`attachments/${AB}/m3`]: 'data:text/plain;base64,YWJj',
      })
    );
    await assertFails(db(BOB).ref(`attachments/${AB}/m1`).set('data:text/plain;base64,YWJj'));
    await assertFails(db(CAROL).ref(`attachments/${AB}/m3`).get());
    await assertSucceeds(db(ALICE).ref(`attachments/${AB}/m3`).get());
  });
});

describe('kişisel düğümler', () => {
  it('herkes yalnızca kendi userChats düğümüne yazar ve onu okur', async () => {
    await assertSucceeds(db(ALICE).ref(`userChats/${ALICE}/${AB}`).update({ unread: 0, updatedAt: TS }));
    await assertFails(db(ALICE).ref(`userChats/${BOB}/${AB}/unread`).set(99));
    await assertFails(db(ALICE).ref(`userChats/${BOB}`).get());
  });
  it('yazıyor bayrağı yalnızca kendi adına ve üye olunan sohbete', async () => {
    await assertSucceeds(db(ALICE).ref(`typing/${AB}/${ALICE}`).set(true));
    await assertFails(db(ALICE).ref(`typing/${AB}/${BOB}`).set(true));
    await assertFails(db(CAROL).ref(`typing/${AB}/${CAROL}`).set(true));
    await assertFails(db(CAROL).ref(`typing/${AB}`).get());
  });
  it('presence: herkes kendininkine yazar; activeChat yalnızca sahibine açık', async () => {
    await assertSucceeds(db(ALICE).ref(`presence/${ALICE}`).update({ online: true, activeChat: AB }));
    await assertFails(db(ALICE).ref(`presence/${BOB}/online`).set(true));
    await assertSucceeds(db(BOB).ref(`presence/${ALICE}/online`).get());
    await assertFails(db(BOB).ref(`presence/${ALICE}/activeChat`).get());
  });
  it('push token yalnızca sahibince yazılır/okunur', async () => {
    const token = 'tok_' + 'x'.repeat(150);
    await assertSucceeds(db(ALICE).ref(`pushTokens/${ALICE}/${token}`).set({ platform: 'android', updatedAt: TS }));
    await assertFails(db(BOB).ref(`pushTokens/${ALICE}`).get());
    await assertFails(db(BOB).ref(`pushTokens/${ALICE}/${token}`).remove());
  });
  it('engel listesi yalnızca sahibine açık', async () => {
    await assertSucceeds(db(ALICE).ref(`blocks/${ALICE}/${BOB}`).set(true));
    await assertFails(db(BOB).ref(`blocks/${ALICE}`).get());
    await assertFails(db(BOB).ref(`blocks/${ALICE}/${BOB}`).remove());
  });
  it('okundu/iletildi bilgisi yalnızca kendi adına, sunucu zamanıyla', async () => {
    await assertSucceeds(db(BOB).ref(`receipts/${AB}/${BOB}`).update({ read: TS, delivered: TS }));
    await assertFails(db(BOB).ref(`receipts/${AB}/${ALICE}`).update({ read: TS }));
    await assertFails(db(BOB).ref(`receipts/${AB}/${BOB}`).update({ read: 1 }));
    await assertSucceeds(db(ALICE).ref(`receipts/${AB}`).get());
    await assertFails(db(CAROL).ref(`receipts/${AB}`).get());
  });
  it('eski "db" düğümü tamamen kapalı', async () => {
    await assertFails(db(ALICE).ref('db').get());
    await assertFails(db(ALICE).ref('db/users/alice').set({ pass: '1234' }));
  });
});
