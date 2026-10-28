// Çevrimiçi durumu: presence/{uid} = online, lastSeen, activeChat, connections/{connId}.
// activeChat: o an açık sohbet. Sohbetten çıkınca, sekme gizlenince ve bağlantı
// kopunca temizlenir; sunucu bu sohbet için bildirim göndermez.
import { onDisconnect, onValue, push, ref, serverTimestamp, update } from 'firebase/database';
import { db } from '../firebase.js';

let current = { uid: null, chatId: null, connected: false };

function writeActiveChat() {
  const { uid, chatId, connected } = current;
  if (!uid || !connected) return;
  const visible = document.visibilityState === 'visible';
  update(ref(db, `presence/${uid}`), { activeChat: visible && chatId ? chatId : null }).catch((err) =>
    console.warn('[ChatApp] activeChat', err)
  );
}

export function startPresence(uid) {
  current = { uid, chatId: null, connected: false };
  const presenceRef = ref(db, `presence/${uid}`);
  let connRef = null;

  const unsubConnected = onValue(ref(db, '.info/connected'), async (snap) => {
    current.connected = snap.val() === true;
    if (!current.connected) return;
    try {
      // Sunucu bağlantı koptuğunda bu yazmaları kendisi yapar.
      await onDisconnect(presenceRef).update({ online: false, lastSeen: serverTimestamp(), activeChat: null });
      connRef = push(ref(db, `presence/${uid}/connections`));
      await onDisconnect(connRef).remove();
      await update(ref(db), {
        [`presence/${uid}/connections/${connRef.key}`]: true,
        [`presence/${uid}/online`]: true,
        [`presence/${uid}/lastSeen`]: serverTimestamp(),
      });
      writeActiveChat();
    } catch (err) {
      console.warn('[ChatApp] presence', err);
    }
  });

  const onVisibility = () => writeActiveChat();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onVisibility);

  let stopped = false;
  return async function stopPresence() {
    if (stopped) return;
    stopped = true;
    unsubConnected();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onVisibility);
    const updates = {
      [`presence/${uid}/online`]: false,
      [`presence/${uid}/lastSeen`]: serverTimestamp(),
      [`presence/${uid}/activeChat`]: null,
    };
    if (connRef) updates[`presence/${uid}/connections/${connRef.key}`] = null;
    current = { uid: null, chatId: null, connected: false };
    try {
      await update(ref(db), updates);
      await onDisconnect(presenceRef).cancel();
    } catch (err) {
      console.warn('[ChatApp] presence kapatma', err);
    }
  };
}

export function setActiveChat(chatId) {
  if (current.chatId === chatId) return;
  current.chatId = chatId || null;
  writeActiveChat();
}
