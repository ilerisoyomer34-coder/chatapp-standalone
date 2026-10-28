// Storage kuralları Realtime Database'i okuyamaz. Sohbet üyeleri ve grup yöneticileri
// Firestore'daki chatAccess/{chatId} belgesine yansıtılır; storage.rules bunu okur.
import type { Firestore } from 'firebase-admin/firestore';

interface ChatNode {
  type?: string;
  members?: Record<string, boolean>;
  admins?: Record<string, boolean>;
}

const onlyTrue = (m: Record<string, boolean> | undefined) =>
  Object.fromEntries(Object.entries(m || {}).filter(([, v]) => v === true));

export async function syncChatAccess(fs: Firestore, chatId: string, chat: ChatNode | null): Promise<'deleted' | 'set'> {
  const ref = fs.collection('chatAccess').doc(chatId);
  if (!chat || !chat.members) {
    await ref.delete();
    return 'deleted';
  }
  await ref.set({ type: chat.type || 'direct', members: onlyTrue(chat.members), admins: onlyTrue(chat.admins) });
  return 'set';
}
