// Grup sohbeti işlemleri (callable "manageGroup"). Üyelik ve yöneticilik yalnızca sunucuda değişir;
// en fazla 50 üye, yalnızca sohbet ettiğin kişileri ekleyebilirsin. Her değişiklik bir sistem mesajı yazar.
import { ServerValue, type Database } from 'firebase-admin/database';
import { HttpsError } from 'firebase-functions/v2/https';
import { displayName } from './notify.js';
import { chatIdFor } from './text.js';
import { normalizeUpdates, type Updates } from './updates.js';

export const MAX_GROUP_MEMBERS = 50;
const UID_RE = /^[A-Za-z0-9]{1,128}$/;
const CHAT_RE = /^[A-Za-z0-9_-]{1,200}$/;
const STORAGE_URL = 'https://firebasestorage.googleapis.com/';

interface GroupNode {
  type: string;
  name?: string;
  members: Record<string, boolean>;
  admins?: Record<string, boolean>;
}

function cleanName(v: unknown): string {
  const name = typeof v === 'string' ? v.trim() : '';
  if (!name || Array.from(name).length > 60) throw new HttpsError('invalid-argument', 'Grup adı 1–60 karakter olmalı.');
  return name;
}

function uidList(v: unknown): string[] {
  if (!Array.isArray(v) || v.length > MAX_GROUP_MEMBERS) throw new HttpsError('invalid-argument', 'Geçersiz üye listesi.');
  const out = Array.from(new Set(v));
  if (!out.every((u) => typeof u === 'string' && UID_RE.test(u))) throw new HttpsError('invalid-argument', 'Geçersiz üye listesi.');
  return out as string[];
}

function chatIdOf(v: unknown): string {
  if (typeof v !== 'string' || !CHAT_RE.test(v)) throw new HttpsError('invalid-argument', 'Geçersiz grup.');
  return v;
}

async function loadGroup(db: Database, chatId: string): Promise<GroupNode> {
  const chat = (await db.ref(`chats/${chatId}`).get()).val();
  if (!chat || chat.type !== 'group') throw new HttpsError('not-found', 'Grup bulunamadı.');
  return chat as GroupNode;
}

const memberIds = (g: GroupNode) => Object.keys(g.members || {}).filter((u) => g.members[u] === true);
const adminIds = (g: GroupNode) => Object.keys(g.admins || {}).filter((u) => g.admins?.[u] === true && g.members[u] === true);

function assertMember(g: GroupNode, uid: string) {
  if (g.members?.[uid] !== true) throw new HttpsError('permission-denied', 'Bu grubun üyesi değilsin.');
}

function assertAdmin(g: GroupNode, uid: string) {
  assertMember(g, uid);
  if (g.admins?.[uid] !== true) throw new HttpsError('permission-denied', 'Bu işlem için grup yöneticisi olmalısın.');
}

// Yalnızca bire bir sohbet ettiğin (isteği kabul edilmiş) kişileri gruba ekleyebilirsin.
async function assertContacts(db: Database, actor: string, uids: string[]) {
  for (const u of uids) {
    const [chat, disabled] = await Promise.all([
      db.ref(`chats/${chatIdFor(actor, u)}/type`).get(),
      db.ref(`users/${u}/disabled`).get(),
    ]);
    if (!chat.exists() || disabled.val() === true) {
      throw new HttpsError('failed-precondition', 'Yalnızca sohbet ettiğin kişileri gruba ekleyebilirsin.');
    }
  }
}

function systemMessage(db: Database, updates: Updates, chatId: string, actor: string, type: string, text: string) {
  const id = db.ref(`messages/${chatId}`).push().key as string;
  updates[`messages/${chatId}/${id}`] = { from: actor, system: type, text, ts: ServerValue.TIMESTAMP };
  return id;
}

async function names(db: Database, uids: string[]): Promise<string> {
  return (await Promise.all(uids.map((u) => displayName(db, u)))).join(', ');
}

export interface GroupResult {
  chatId: string;
  deletedGroup?: boolean;
}

export async function manageGroup(db: Database, actor: string, data: Record<string, unknown>): Promise<GroupResult> {
  const action = data && data.action;
  const actorName = await displayName(db, actor);

  if (action === 'create') {
    const name = cleanName(data.name);
    const members = uidList(data.members).filter((u) => u !== actor);
    if (!members.length) throw new HttpsError('invalid-argument', 'Gruba en az bir kişi ekle.');
    if (members.length + 1 > MAX_GROUP_MEMBERS) throw new HttpsError('invalid-argument', `Bir grupta en fazla ${MAX_GROUP_MEMBERS} kişi olabilir.`);
    await assertContacts(db, actor, members);
    const chatId = db.ref('chats').push().key as string;
    const updates: Updates = {
      [`chats/${chatId}`]: {
        type: 'group',
        name,
        members: Object.fromEntries([actor, ...members].map((u) => [u, true])),
        admins: { [actor]: true },
        createdBy: actor,
        createdAt: ServerValue.TIMESTAMP,
      },
    };
    const text = `${actorName}, "${name}" grubunu oluşturdu.`;
    updates[`userChats/${actor}/${chatId}`] = { unread: 0, updatedAt: ServerValue.TIMESTAMP, lastMessage: { text, from: actor, ts: ServerValue.TIMESTAMP } };
    for (const m of members) updates[`userChats/${m}/${chatId}`] = { unread: 0, updatedAt: ServerValue.TIMESTAMP };
    systemMessage(db, updates, chatId, actor, 'created', text);
    await db.ref().update(updates);
    return { chatId };
  }

  const chatId = chatIdOf(data && data.chatId);
  const group = await loadGroup(db, chatId);
  const updates: Updates = {};

  if (action === 'add') {
    assertAdmin(group, actor);
    const fresh = uidList(data.members).filter((u) => group.members[u] !== true);
    if (!fresh.length) throw new HttpsError('invalid-argument', 'Eklenecek yeni kişi yok.');
    if (memberIds(group).length + fresh.length > MAX_GROUP_MEMBERS) {
      throw new HttpsError('failed-precondition', `Bir grupta en fazla ${MAX_GROUP_MEMBERS} kişi olabilir.`);
    }
    await assertContacts(db, actor, fresh);
    for (const u of fresh) {
      updates[`chats/${chatId}/members/${u}`] = true;
      updates[`userChats/${u}/${chatId}`] = { unread: 0, updatedAt: ServerValue.TIMESTAMP };
    }
    systemMessage(db, updates, chatId, actor, 'added', `${actorName}, gruba yeni üye ekledi: ${await names(db, fresh)}`);
  } else if (action === 'remove') {
    assertAdmin(group, actor);
    const target = typeof data.uid === 'string' ? data.uid : '';
    if (target === actor) throw new HttpsError('invalid-argument', 'Kendini çıkarmak için "Gruptan ayrıl"ı kullan.');
    if (group.members[target] !== true) throw new HttpsError('not-found', 'Bu kişi grupta değil.');
    Object.assign(updates, membershipRemoval(chatId, target));
    systemMessage(db, updates, chatId, actor, 'removed', `${actorName}, gruptan çıkardı: ${await displayName(db, target)}`);
  } else if (action === 'leave') {
    assertMember(group, actor);
    const remaining = memberIds(group).filter((u) => u !== actor);
    Object.assign(updates, membershipRemoval(chatId, actor));
    if (!remaining.length) {
      // Son üye ayrıldı: grubu tamamen sil.
      Object.assign(updates, { [`chats/${chatId}`]: null, [`messages/${chatId}`]: null, [`typing/${chatId}`]: null, [`receipts/${chatId}`]: null });
      await db.ref().update(normalizeUpdates(updates));
      return { chatId, deletedGroup: true };
    }
    let text = `${actorName} gruptan ayrıldı.`;
    if (adminIds(group).filter((u) => u !== actor).length === 0) {
      updates[`chats/${chatId}/admins/${remaining[0]}`] = true;
      text += ` ${await displayName(db, remaining[0])} artık grup yöneticisi.`;
    }
    systemMessage(db, updates, chatId, actor, 'left', text);
  } else if (action === 'setAdmin') {
    assertAdmin(group, actor);
    const target = typeof data.uid === 'string' ? data.uid : '';
    if (group.members[target] !== true) throw new HttpsError('not-found', 'Bu kişi grupta değil.');
    const makeAdmin = data.admin === true;
    if (!makeAdmin && adminIds(group).filter((u) => u !== target).length === 0) {
      throw new HttpsError('failed-precondition', 'Grupta en az bir yönetici olmalı.');
    }
    updates[`chats/${chatId}/admins/${target}`] = makeAdmin ? true : null;
    const targetName = await displayName(db, target);
    systemMessage(db, updates, chatId, actor, 'admin', makeAdmin ? `${actorName}, ${targetName} adlı üyeyi yönetici yaptı.` : `${actorName}, ${targetName} adlı üyenin yöneticiliğini kaldırdı.`);
  } else if (action === 'update') {
    assertAdmin(group, actor);
    if (data.name !== undefined) {
      const name = cleanName(data.name);
      updates[`chats/${chatId}/name`] = name;
      systemMessage(db, updates, chatId, actor, 'renamed', `${actorName}, grup adını "${name}" olarak değiştirdi.`);
    }
    if (data.photoURL !== undefined) {
      const url = data.photoURL;
      if (url !== null && (typeof url !== 'string' || !url.startsWith(STORAGE_URL) || url.length > 2048)) {
        throw new HttpsError('invalid-argument', 'Geçersiz fotoğraf.');
      }
      updates[`chats/${chatId}/photoURL`] = url;
      systemMessage(db, updates, chatId, actor, 'photo', url ? `${actorName}, grup fotoğrafını değiştirdi.` : `${actorName}, grup fotoğrafını kaldırdı.`);
    }
    if (!Object.keys(updates).length) throw new HttpsError('invalid-argument', 'Değişiklik yok.');
  } else {
    throw new HttpsError('invalid-argument', 'Bilinmeyen işlem.');
  }

  await db.ref().update(normalizeUpdates(updates));
  return { chatId };
}

export function membershipRemoval(chatId: string, uid: string): Updates {
  return {
    [`chats/${chatId}/members/${uid}`]: null,
    [`chats/${chatId}/admins/${uid}`]: null,
    [`userChats/${uid}/${chatId}`]: null,
    [`typing/${chatId}/${uid}`]: null,
    [`receipts/${chatId}/${uid}`]: null,
  };
}
