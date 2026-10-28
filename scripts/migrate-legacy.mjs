#!/usr/bin/env node
// ChatApp — eski "db" düğümünden yeni sürüme tek seferlik geçiş betiği (Admin SDK, yerelde çalışır).
//
// Eski düğümde şifreler düz metin olarak açığa çıktığı için eski hesaplar güvenli sayılmaz:
// varsayılan plan temiz başlangıçtır (yedek al → sil). Aşağıdaki "reserve/link/chats"
// adımları isteğe bağlıdır ve yalnızca yönetici onayıyla kullanılır.
//
// Kurulum:
//   1. Firebase Console → Proje ayarları → Hizmet hesapları → "Yeni özel anahtar oluştur".
//      İnen JSON dosyasını depo DIŞINDA bir yere kaydet (ör. ~/gizli/chatapp-sa.json).
//   2. export GOOGLE_APPLICATION_CREDENTIALS=~/gizli/chatapp-sa.json
//   3. npm install   (depo kökünde)
//
// Komutlar:
//   node scripts/migrate-legacy.mjs backup
//       /db düğümünü backup/legacy-db-<tarih>.json dosyasına yazar (backup/ depoya girmez).
//   node scripts/migrate-legacy.mjs reserve --file backup/legacy-db-....json
//       Eski kullanıcı adlarını yeni biçime çevirip usernames altında "legacy:<eski>" olarak rezerve eder.
//   node scripts/migrate-legacy.mjs link <eskiKullaniciAdi> <yeniUid>
//       (Yönetici, kişinin gerçekten o olduğunu doğruladıktan sonra) rezerve adı yeni hesaba bağlar.
//   node scripts/migrate-legacy.mjs chats --file backup/legacy-db-....json
//       İki tarafı da bağlanmış eski bire bir sohbetleri ve metin mesajlarını yeni yapıya kopyalar.
//   node scripts/migrate-legacy.mjs sync-access
//       Tüm sohbetlerin Storage erişim belgelerini (Firestore chatAccess) yeniden yazar.
//   node scripts/migrate-legacy.mjs delete-legacy --yes
//       Eski /db düğümünü kalıcı olarak siler (önce mutlaka backup al).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';

const DATABASE_URL = process.env.DATABASE_URL || 'https://chatapp-d8a5b-default-rtdb.europe-west1.firebasedatabase.app';
const RESERVED_PREFIX = 'legacy:';
const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

export function normalizeUsername(raw) {
  return String(raw ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => TR[c])
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

const validUsername = (u) => /^[a-z0-9_]{3,20}$/.test(u);
const toArr = (v) => (!v ? [] : Array.isArray(v) ? v.filter(Boolean) : Object.values(v).filter(Boolean));

function args() {
  const [, , cmd, ...rest] = process.argv;
  const flags = {};
  const pos = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      const k = rest[i].slice(2);
      flags[k] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
    } else pos.push(rest[i]);
  }
  return { cmd, flags, pos };
}

function openDb() {
  const emulator = !!process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  if (!emulator && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS ayarlı değil (servis hesabı JSON dosyasının yolu).');
  }
  const app = initializeApp(
    emulator ? { projectId: 'demo-chatapp', databaseURL: DATABASE_URL } : { credential: applicationDefault(), databaseURL: DATABASE_URL }
  );
  return getDatabase(app);
}

async function loadLegacy(db, file) {
  if (file) return JSON.parse(readFileSync(file, 'utf8'));
  return (await db.ref('db').get()).val();
}

export async function backup(db) {
  const data = (await db.ref('db').get()).val();
  if (!data) return console.log('Eski /db düğümü boş veya yok; yedek alınacak bir şey yok.');
  mkdirSync('backup', { recursive: true });
  const file = `backup/legacy-db-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(
    `Yedek yazıldı: ${file} (${Object.keys(data.users || {}).length} kullanıcı). Bu dosya şifreler içerir; paylaşma, iş bitince sil.`
  );
  return file;
}

export async function reserve(db, legacy) {
  const users = legacy && legacy.users ? Object.keys(legacy.users) : [];
  let reserved = 0;
  for (const old of users) {
    const name = normalizeUsername(old);
    if (!validUsername(name)) {
      console.warn(`atlandı (yeni kurala uymuyor): "${old}" → "${name}"`);
      continue;
    }
    const res = await db.ref(`usernames/${name}`).transaction((cur) => (cur === null ? RESERVED_PREFIX + old : undefined));
    if (res.committed) reserved++;
    else console.warn(`zaten alınmış: ${name}`);
  }
  console.log(`${reserved} kullanıcı adı rezerve edildi.`);
  return reserved;
}

export async function link(db, oldUsername, newUid) {
  const name = normalizeUsername(oldUsername);
  const current = (await db.ref(`usernames/${name}`).get()).val();
  if (typeof current !== 'string' || !current.startsWith(RESERVED_PREFIX)) throw new Error(`"${name}" rezerve değil (değer: ${current}).`);
  const profile = (await db.ref(`users/${newUid}`).get()).val();
  if (!profile || !profile.username) throw new Error(`Yeni hesap ${newUid} bulunamadı veya profili tamamlanmamış.`);
  await db.ref().update({
    [`usernames/${name}`]: newUid,
    [`usernames/${profile.username}`]: null,
    [`users/${newUid}/username`]: name,
    [`legacyLinks/${current.slice(RESERVED_PREFIX.length)}`]: newUid,
  });
  console.log(
    `"${current.slice(RESERVED_PREFIX.length)}" → ${newUid} bağlandı. Kullanıcı adı artık @${name} (eski geçici ad @${profile.username} serbest).`
  );
}

export async function chats(db, legacy) {
  const links = (await db.ref('legacyLinks').get()).val() || {};
  const oldChats = toArr(legacy && legacy.chats);
  const oldMessages = (legacy && legacy.messages) || {};
  let copied = 0;
  for (const c of oldChats) {
    const members = toArr(c.members);
    if (members.length !== 2) continue;
    const [u1, u2] = members.map((m) => links[m]);
    if (!u1 || !u2) continue;
    const chatId = [u1, u2].sort().join('_');
    if ((await db.ref(`chats/${chatId}`).get()).exists()) {
      console.log(`zaten var, atlandı: ${chatId}`);
      continue;
    }
    const msgs = toArr(oldMessages[c.id]).filter((m) => !m.system && m.from && links[m.from]);
    msgs.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const updates = {
      [`chats/${chatId}`]: { type: 'direct', members: { [u1]: true, [u2]: true }, createdAt: Number(c.ts) || Date.now() },
    };
    let last = null;
    for (const m of msgs) {
      const id = db.ref(`messages/${chatId}`).push().key;
      let text = typeof m.text === 'string' ? m.text.slice(0, 4000) : '';
      if (m.attachment) text = (text ? text + '\n' : '') + `📎 ${m.attachment.name || 'dosya'} (eski sürümden taşınmadı)`;
      if (!text) continue;
      const msg = { from: links[m.from], text, ts: Number(m.ts) || Date.now() };
      updates[`messages/${chatId}/${id}`] = msg;
      last = msg;
    }
    const lastMessage = last ? { text: last.text.replace(/\s+/g, ' ').slice(0, 199), from: last.from, ts: last.ts } : null;
    const updatedAt = last ? last.ts : Number(c.ts) || Date.now();
    for (const u of [u1, u2]) {
      updates[`userChats/${u}/${chatId}`] = lastMessage ? { unread: 0, updatedAt, lastMessage } : { unread: 0, updatedAt };
    }
    await db.ref().update(updates);
    copied++;
    console.log(`sohbet taşındı: ${chatId} (${msgs.length} mesaj)`);
  }
  console.log(`${copied} sohbet taşındı.`);
  return copied;
}

// Storage kurallarının okuduğu chatAccess/{chatId} belgelerini mevcut tüm sohbetler için yeniden yazar
// (fonksiyonlar dağıtılmadan önce kurulmuş sohbetler için bir kez çalıştır).
export async function syncAccess(db, fs) {
  const chatsVal = (await db.ref('chats').get()).val() || {};
  let n = 0;
  for (const [chatId, chat] of Object.entries(chatsVal)) {
    const onlyTrue = (m) => Object.fromEntries(Object.entries(m || {}).filter(([, v]) => v === true));
    await fs
      .collection('chatAccess')
      .doc(chatId)
      .set({ type: chat.type || 'direct', members: onlyTrue(chat.members), admins: onlyTrue(chat.admins) });
    n++;
  }
  console.log(`${n} sohbetin erişim belgesi yazıldı.`);
  return n;
}

export async function deleteLegacy(db, yes) {
  if (!yes) throw new Error('Silmek için --yes ekle (önce backup al!).');
  await db.ref('db').remove();
  console.log('Eski /db düğümü silindi.');
}

async function main() {
  const { cmd, flags, pos } = args();
  if (!cmd || cmd === 'help') {
    console.log(
      readFileSync(new URL(import.meta.url), 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('//'))
        .join('\n')
    );
    return;
  }
  const db = openDb();
  try {
    if (cmd === 'backup') await backup(db);
    else if (cmd === 'reserve') await reserve(db, await loadLegacy(db, flags.file));
    else if (cmd === 'link') {
      if (pos.length !== 2) throw new Error('Kullanım: link <eskiKullaniciAdi> <yeniUid>');
      await link(db, pos[0], pos[1]);
    } else if (cmd === 'chats') await chats(db, await loadLegacy(db, flags.file));
    else if (cmd === 'sync-access') await syncAccess(db, getFirestore(db.app));
    else if (cmd === 'delete-legacy') await deleteLegacy(db, flags.yes === true);
    else throw new Error(`Bilinmeyen komut: ${cmd}`);
  } finally {
    await db.app.delete();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Hata:', err.message);
    process.exit(1);
  });
}
