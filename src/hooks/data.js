// Veritabanı dinleyicileri. İstemci yalnızca kendi verisini dinler:
// userChats/{benimUid}, açık sohbetin mesajları (son 50), gelen/giden istekler.
// Kök düğüm asla dinlenmez.
import { useEffect, useMemo, useRef, useState } from 'react';
import { equalTo, limitToLast, onValue, orderByChild, query, ref } from 'firebase/database';
import { db } from '../firebase.js';

export function useDbValue(path, { enabled = true, onError } = {}) {
  const [state, setState] = useState({ value: undefined, loading: true });
  const errRef = useRef(onError);
  errRef.current = onError;
  useEffect(() => {
    if (!path || !enabled) {
      setState({ value: undefined, loading: false });
      return undefined;
    }
    setState((s) => ({ value: s.value, loading: true }));
    return onValue(
      ref(db, path),
      (snap) => setState({ value: snap.val(), loading: false }),
      (err) => {
        console.warn(`[ChatApp] dinleme hatası: ${path}`, err);
        setState({ value: null, loading: false });
        errRef.current?.(err);
      }
    );
  }, [path, enabled]);
  return state;
}

// Profil önbelleği: aynı kullanıcı için tek dinleyici.
const profileCache = new Map(); // uid -> { value, subs:Set, unsub }

function subscribeProfile(uid, cb) {
  let entry = profileCache.get(uid);
  if (!entry) {
    entry = { value: undefined, subs: new Set(), unsub: null };
    profileCache.set(uid, entry);
    entry.unsub = onValue(
      ref(db, `users/${uid}`),
      (snap) => {
        entry.value = snap.exists() ? { uid, ...snap.val() } : null;
        entry.subs.forEach((fn) => fn());
      },
      (err) => {
        console.warn('[ChatApp] profil okunamadı', err);
        entry.value = null;
        entry.subs.forEach((fn) => fn());
      }
    );
  }
  entry.subs.add(cb);
  return () => {
    entry.subs.delete(cb);
    if (entry.subs.size === 0) {
      entry.unsub?.();
      profileCache.delete(uid);
    }
  };
}

export function useProfiles(uids) {
  const key = useMemo(() => Array.from(new Set((uids || []).filter(Boolean))).sort().join(','), [uids]);
  const [, force] = useState(0);
  useEffect(() => {
    if (!key) return undefined;
    const rerender = () => force((n) => n + 1);
    const unsubs = key.split(',').map((uid) => subscribeProfile(uid, rerender));
    rerender();
    return () => unsubs.forEach((u) => u());
  }, [key]);
  const out = {};
  if (key) key.split(',').forEach((uid) => (out[uid] = profileCache.get(uid)?.value));
  return out;
}

export function useUserChats(uid) {
  const { value, loading } = useDbValue(uid ? `userChats/${uid}` : null);
  const chats = useMemo(
    () =>
      Object.entries(value || {}).map(([chatId, v]) => ({
        chatId,
        unread: Number(v?.unread) || 0,
        lastMessage: v?.lastMessage || null,
        updatedAt: Number(v?.updatedAt) || 0,
        muted: v?.muted,
        pinned: !!v?.pinned,
        archived: !!v?.archived,
      })),
    [value]
  );
  return { chats, loading };
}

function useQueryList(uid, field) {
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!uid) {
      setList([]);
      return undefined;
    }
    const q = query(ref(db, 'requests'), orderByChild(field), equalTo(uid));
    return onValue(
      q,
      (snap) => {
        const out = [];
        snap.forEach((s) => {
          out.push({ id: s.key, ...s.val() });
        });
        setList(out);
      },
      (err) => console.warn('[ChatApp] istekler okunamadı', err)
    );
  }, [uid, field]);
  return list;
}

export const useIncomingRequests = (uid) => useQueryList(uid, 'to');
export const useOutgoingRequests = (uid) => useQueryList(uid, 'from');

export function useMessages(chatId, limit = 50) {
  const [state, setState] = useState({ chatId: null, list: [], loading: true });
  useEffect(() => {
    if (!chatId) {
      setState({ chatId: null, list: [], loading: false });
      return undefined;
    }
    setState({ chatId, list: [], loading: true });
    const q = query(ref(db, `messages/${chatId}`), orderByChild('ts'), limitToLast(limit));
    return onValue(
      q,
      (snap) => {
        const list = [];
        snap.forEach((s) => {
          list.push({ id: s.key, ...s.val() });
        });
        list.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        setState({ chatId, list, loading: false });
      },
      (err) => {
        console.warn('[ChatApp] mesajlar okunamadı', err);
        setState({ chatId, list: [], loading: false });
      }
    );
  }, [chatId, limit]);
  return state.chatId === chatId ? state : { chatId, list: [], loading: true };
}
