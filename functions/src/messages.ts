// Mesaj düzenlenince / herkesten silinince: sohbet listesi önizlemesini güncelle,
// silinen mesajın Storage dosyalarını kaldır.
import type { Database } from 'firebase-admin/database';
import { messagePreview, type ChatMessage } from './text.js';

export type PrefixDeleter = (prefix: string) => Promise<void>;

export async function handleMessageUpdated(
  db: Database,
  deletePrefix: PrefixDeleter,
  chatId: string,
  messageId: string,
  before: ChatMessage | null,
  after: ChatMessage | null
): Promise<{ previewUpdated: number; filesDeleted: boolean }> {
  const result = { previewUpdated: 0, filesDeleted: false };
  if (!before) return result;
  const nowDeleted = !before.deleted && !!(after && after.deleted);
  if ((nowDeleted || !after) && before.attachment) {
    await deletePrefix(`chats/${chatId}/${messageId}/`);
    result.filesDeleted = true;
  }
  const edited = !!after && !after.deleted && after.text !== before.text;
  if (!after || !(nowDeleted || edited)) return result;

  const members = (await db.ref(`chats/${chatId}/members`).get()).val() || {};
  const text = messagePreview(after);
  await Promise.all(
    Object.keys(members).map(async (uid) => {
      let changed = false;
      const res = await db.ref(`userChats/${uid}/${chatId}/lastMessage`).transaction((cur) => {
        changed = false;
        // İlk çağrıda yerel önbellek boş olabilir: null döndürürsek sunucu değeriyle yeniden denenir.
        if (cur === null) return null;
        if (cur.ts !== before.ts || cur.from !== before.from) return undefined;
        changed = true;
        return { ...cur, text };
      });
      if (res.committed && changed) result.previewUpdated++;
    })
  );
  return result;
}
