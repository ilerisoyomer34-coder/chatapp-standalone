// Veritabanı dinleyicileri. İstemci yalnızca kendi verisini dinler:
// userChats/{benimUid}, açık sohbetin mesajları (son 50, yukarı kaydırdıkça 50'şer), gelen/giden istekler.
// Kök düğüm asla dinlenmez. Çevrimdışı açılış için seçili düğümler IndexedDB'de önbelleklenir.
import { useEffect, useMemo, useRef, useState } from 'react';
import { equalTo, limitToLast, onValue, orderByChild, query, ref } from 'firebase/database';
import { db } from '../firebase.js';
import { cacheGet, cacheSet } from '../lib/cache.js';

export function useDbValue(path, { enabled = true, onError, cache = false } = {}) {
  const [state, setState] = useState({ value: undefined, loading: true });
  const errRef = useRef(onError);
  errRef.current = onError;
  useEffect(() => {
    if (!path || !enabled) {
      setState({ value: undefined, loading: false });
      return undefined;
    }
    let live = false;
    setState((s) => ({ value: s.value, loading: true }));
    if (cache) {
      cacheGet(`v:${path}`).then((v) => {
        if (!live && v !== undefined) setState({ value: v, loading: false, fromCache: true });
      });
    }
    return onValue(
      ref(db, path),
      (snap) => {
        live = true;
        const value = snap.val();
        setState({ value, loading: false });
        if (cache) cacheSet(`v:${path}`, value);
      },
      (err) => {
        live = true;
        console.warn(`[ChatApp] dinleme hatası: ${path}`, err);
        setState({ value: null, loading: false, error: err });
        errRef.current?.(err);
      }
    );
  }, [path, enabled, cache]);
  return state;
}

// Ortak önbellekli abonelik: aynı düğüm için tek dinleyici (profiller, sohbet düğümleri).
function makeNodeCache(prefix) {
  const entries = new Map(); // id -> { value, subs, unsub }
  function subscribe(id, cb) {
    let entry = entries.get(id);
    if (!entry) {
      entry = { value: undefined, subs: new Set(), unsub: null };
      entries.set(id, entry);
      cacheGet(`n:${prefix}/${id}`).then((v) => {
        if (entry.value === undefined && v !== undefined) {
          entry.value = v;
          entry.subs.forEach((fn) => fn());
        }
      });
      entry.unsub = onValue(
        ref(db, `${prefix}/${id}`),
        (snap) => {
          entry.value = snap.exists() ? { id, uid: id, ...snap.val() } : null;
          cacheSet(`n:${prefix}/${id}`, entry.value);
          entry.subs.forEach((fn) => fn());
        },
        () => {
          entry.value = entry.value === undefined ? null : entry.value;
          entry.subs.forEach((fn) => fn());
        }
      );
    }
    entry.subs.add(cb);
    return () => {
      entry.subs.delete(cb);
      if (entry.subs.size === 0) {
        entry.unsub?.();
        entries.delete(id);
      }
    };
  }
  return function useNodes(ids) {
    const key = useMemo(() => Array.from(new Set((ids || []).filter(Boolean))).sort().join(','), [ids]);
    const [, force] = useState(0);
    useEffect(() => {
      if (!key) return undefined;
      const rerender = () => force((n) => n + 1);
      const unsubs = key.split(',').map((id) => subscribe(id, rerender));
      rerender();
      return () => unsubs.forEach((u) => u());
    }, [key]);
    const out = {};
    if (key) key.split(',').forEach((id) => (out[id] = entries.get(id)?.value));
    return out;
  };
}

export const useProfiles = makeNodeCache('users');
export const useChatNodes = makeNodeCache('chats');

export function useUserChats(uid) {
  const { value, loading } = useDbValue(uid ? `userChats/${uid}` : null, { cache: true });
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
  return { chats, loading: loading && value === undefined };
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

// Açık sohbetin son `limit` mesajı (ts sıralı). Limit artınca önceki liste korunur (titreme olmaz).
export function useMessages(chatId, limit = 50) {
  const [state, setState] = useState({ chatId: null, list: [], loading: true });
  useEffect(() => {
    if (!chatId) {
      setState({ chatId: null, list: [], loading: false });
      return undefined;
    }
    let live = false;
    setState((s) => (s.chatId === chatId ? { ...s, loading: true } : { chatId, list: [], loading: true }));
    cacheGet(`m:${chatId}`).then((cached) => {
      if (!live && Array.isArray(cached)) setState((s) => (s.chatId === chatId && !s.list.length ? { chatId, list: cached, loading: false, fromCache: true } : s));
    });
    const q = query(ref(db, `messages/${chatId}`), orderByChild('ts'), limitToLast(limit));
    return onValue(
      q,
      (snap) => {
        live = true;
        const list = [];
        snap.forEach((s) => {
          list.push({ id: s.key, ...s.val() });
        });
        list.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        setState({ chatId, list, loading: false, limit });
        cacheSet(`m:${chatId}`, list.slice(-50));
      },
      (err) => {
        live = true;
        console.warn('[ChatApp] mesajlar okunamadı', err);
        setState({ chatId, list: [], loading: false, error: err });
      }
    );
  }, [chatId, limit]);
  if (state.chatId !== chatId) return { chatId, list: [], loading: true, hasMore: false };
  return { ...state, hasMore: state.list.length >= limit };
}

// Karşı tarafın çevrimiçi / son görülme bilgisi (gizlilik ayarı reddederse null).
export function usePresence(uid) {
  const online = useDbValue(uid ? `presence/${uid}/online` : null);
  const lastSeen = useDbValue(uid ? `presence/${uid}/lastSeen` : null);
  return { online: online.value === true, lastSeen: typeof lastSeen.value === 'number' ? lastSeen.value : null, hidden: !!lastSeen.error };
}
