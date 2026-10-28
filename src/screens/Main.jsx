import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import ChatView from '../components/chat/ChatView.jsx';
import InAppBanner from '../components/InAppBanner.jsx';
import { ActionSheet } from '../components/Modal.jsx';
import NotificationCard from '../components/NotificationCard.jsx';
import { Avatar, IconButton, SectionTitle, Toast } from '../components/ui.jsx';
import { db } from '../firebase.js';
import { useChatNodes, useDbValue, useIncomingRequests, useOutgoingRequests, useProfiles, useUserChats } from '../hooks/data.js';
import {
  chatIdFor,
  ensureUserChat,
  markChatRead,
  markDelivered,
  markRequestSeen,
  respondChatRequest,
  searchUsernames,
  sendChatRequest,
  setChatPref,
} from '../lib/api.js';
import { isMuted, MAX_PINNED, muteItems } from '../lib/chatPrefs.js';
import { friendlyError } from '../lib/errors.js';
import { formatListTime } from '../lib/format.js';
import { Icon } from '../lib/icons.jsx';
import { setActiveChat, startPresence } from '../lib/presence.js';
import { setAppBadge, syncPushToken } from '../lib/push.js';
import { playNotificationSound, unlockAudio } from '../lib/sound.js';
import { onServiceWorkerMessage, readChatParam } from '../lib/sw.js';
import { normalizeUsername } from '../lib/username.js';

const Settings = lazy(() => import('../components/Settings.jsx'));
const AdminPanel = lazy(() => import('../components/AdminPanel.jsx'));
const CreateGroup = lazy(() => import('../components/CreateGroup.jsx'));

const DAY = 86400000;
const chatUrl = (chatId) => {
  const url = new URL(window.location.href);
  url.searchParams.delete('source');
  url.searchParams.delete('view');
  if (chatId) url.searchParams.set('chat', chatId);
  else url.searchParams.delete('chat');
  return url.toString();
};
// Bire bir sohbet kimliği "uidA_uidB" (uid'lerde alt çizgi yok); grup kimlikleri push anahtarıdır.
const looksDirect = (chatId) => /^[A-Za-z0-9]{20,128}_[A-Za-z0-9]{20,128}$/.test(chatId);

function useConnected() {
  const [connected, setConnected] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    let timer = null;
    const unsub = onValue(ref(db, '.info/connected'), (snap) => {
      clearTimeout(timer);
      if (snap.val() === true) setConnected(true);
      // Açılıştaki kısa bağlantı süresinde bant yanıp sönmesin (cihaz çevrimdışıysa hemen göster).
      else if (navigator.onLine === false) setConnected(false);
      else timer = setTimeout(() => setConnected(false), 2500);
    });
    const onOffline = () => setConnected(false);
    window.addEventListener('offline', onOffline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('offline', onOffline);
      unsub();
    };
  }, []);
  return connected;
}

export default function Main({ t, theme, desktop, user, me, isAdmin, onLogout, onAccountDeleted, registerCleanup }) {
  const uid = me.uid;
  const [activeChat, setActive] = useState(null);
  const [view, setView] = useState('chats'); // chats | settings
  const [showArchived, setShowArchived] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState({ q: '', list: [], loading: false });
  const [toastState, setToastState] = useState(null);
  const [banner, setBanner] = useState(null);
  const [chatMenu, setChatMenu] = useState(null);
  const [muteFor, setMuteFor] = useState(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const pressRef = useRef(null);
  const connected = useConnected();

  const toast = useCallback((text, kind) => setToastState({ text, kind, id: Date.now() }), []);
  const clearToast = useCallback(() => setToastState(null), []);
  const clearBanner = useCallback(() => setBanner(null), []);

  const { chats, loading: chatsLoading } = useUserChats(uid);
  const incoming = useIncomingRequests(uid);
  const outgoing = useOutgoingRequests(uid);
  const blocks = useDbValue(`blocks/${uid}`).value || {};
  const pendingIncoming = useMemo(() => incoming.filter((r) => r.status === 'pending' && blocks[r.from] !== true), [incoming, blocks]);

  // ── oturum: presence + push token + temizlik ──
  useEffect(() => {
    const stop = startPresence(uid);
    registerCleanup(stop);
    syncPushToken(uid).catch((err) => console.warn('[ChatApp] push token', err));
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      stop();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [uid, registerCleanup]);

  // ── sohbet açma/kapama: geçmiş (geri tuşu) + ?chat= + presence.activeChat ──
  const openChat = useCallback((chatId) => {
    if (!chatId) return;
    setView('chats');
    setQueryText('');
    setActive(chatId);
    if (window.history.state && window.history.state.chat) window.history.replaceState({ chat: chatId }, '', chatUrl(chatId));
    else window.history.pushState({ chat: chatId }, '', chatUrl(chatId));
  }, []);

  const closeChat = useCallback(() => {
    if (window.history.state && window.history.state.chat) {
      window.history.back();
    } else {
      setActive(null);
      window.history.replaceState(null, '', chatUrl(null));
    }
  }, []);

  useEffect(() => {
    const onPop = () => setActive(readChatParam());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    setActiveChat(activeChat);
  }, [activeChat]);

  // Bildirimden gelen ?chat=<id>, ana ekran kısayolları (?view=) ve servis çalışanının "open-chat" mesajı.
  const initialRef = useRef({ chat: readChatParam(), view: new URL(window.location.href).searchParams.get('view') });
  useEffect(() => {
    const { chat: target, view: v } = initialRef.current;
    initialRef.current = {};
    if (target || v) window.history.replaceState(null, '', chatUrl(null));
    if (target) openChat(target);
    else if (v === 'settings') setView('settings');
    else if (v === 'new-group') setCreatingGroup(true);
  }, [openChat]);

  useEffect(
    () =>
      onServiceWorkerMessage((msg) => {
        if (msg.type === 'open-chat' && msg.chatId) openChat(msg.chatId);
        if (msg.type === 'open-requests') {
          setView('chats');
          closeChat();
        }
      }),
    [openChat, closeChat]
  );

  // ── sohbet düğümleri ve profiller ──
  const chatIds = useMemo(() => chats.map((c) => c.chatId), [chats]);
  const chatNodes = useChatNodes(chatIds);
  const directOther = useCallback(
    (chatId) => {
      const node = chatNodes[chatId];
      if (node && node.type === 'group') return null;
      if (node && node.members) return Object.keys(node.members).find((u) => u !== uid) || null;
      return looksDirect(chatId) ? chatId.split('_').find((u) => u !== uid) || null : null;
    },
    [chatNodes, uid]
  );
  const otherUids = useMemo(
    () => [
      ...chats.map((c) => directOther(c.chatId)),
      ...chats.map((c) => c.lastMessage && c.lastMessage.from),
      ...incoming.map((r) => r.from),
      ...outgoing.map((r) => r.to),
      ...results.list.map((r) => r.uid),
    ],
    [chats, incoming, outgoing, results.list, directOther]
  );
  const profiles = useProfiles(otherUids);
  const nameOf = (id) => profiles[id]?.name || 'Kullanıcı';

  const metaOf = useCallback(
    (chatId) => {
      const node = chatNodes[chatId];
      if (node && node.type === 'group') {
        return { type: 'group', name: node.name || 'Grup', photoURL: node.photoURL, avatarKey: chatId };
      }
      const other = directOther(chatId);
      const p = other ? profiles[other] : undefined;
      return { type: 'direct', uid: other, name: p === null ? 'Silinmiş hesap' : p?.name || '…', username: p?.username, color: p?.color, photoURL: p?.photoURL, avatarKey: other, disabled: p?.disabled };
    },
    [chatNodes, directOther, profiles]
  );

  // ── okunmamış rozeti ──
  const totalUnread = useMemo(() => chats.reduce((sum, c) => sum + (isMuted(c.muted) ? 0 : c.unread), 0), [chats]);
  useEffect(() => {
    setAppBadge(totalUnread);
    document.title = totalUnread > 0 ? `(${totalUnread}) ChatApp – Ömer İlerisoy` : 'ChatApp – Ömer İlerisoy';
  }, [totalUnread]);

  // ── iletildi bilgisi + uygulama içi bant/ses ──
  const deliveredRef = useRef({});
  const lastSeenRef = useRef(null);
  useEffect(() => {
    if (chatsLoading) return;
    const first = lastSeenRef.current === null;
    const prev = lastSeenRef.current || {};
    const next = {};
    for (const c of chats) {
      const lm = c.lastMessage;
      const ts = lm ? Number(lm.ts) || 0 : 0;
      next[c.chatId] = ts;
      if (!lm || lm.from === uid) continue;
      if (c.unread > 0 && deliveredRef.current[c.chatId] !== ts) {
        deliveredRef.current[c.chatId] = ts;
        markDelivered(uid, c.chatId).catch(() => {});
      }
      const visible = document.visibilityState === 'visible';
      if (!first && ts > (prev[c.chatId] || 0) && visible && c.chatId !== activeChat && !isMuted(c.muted) && c.unread > 0) {
        setBanner({ kind: 'message', chatId: c.chatId, from: lm.from, body: lm.text || 'Yeni mesaj', at: Date.now() });
        playNotificationSound();
      }
    }
    lastSeenRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, chatsLoading]);

  const seenRequestsRef = useRef(null);
  useEffect(() => {
    const ids = new Set(pendingIncoming.map((r) => r.id));
    if (seenRequestsRef.current && document.visibilityState === 'visible') {
      const fresh = pendingIncoming.find((r) => !seenRequestsRef.current.has(r.id));
      if (fresh) {
        setBanner({ kind: 'request', chatId: null, from: fresh.from, at: Date.now() });
        playNotificationSound();
      }
    }
    seenRequestsRef.current = ids;
  }, [pendingIncoming]);

  // Kabul edilen giden isteklerin sohbeti listemizde yoksa ekle (sunucu gecikirse yedek).
  const ensuredRef = useRef(new Set());
  useEffect(() => {
    if (chatsLoading) return;
    for (const r of outgoing) {
      if (r.status !== 'accepted') continue;
      const cid = chatIdFor(uid, r.to);
      if (chats.some((c) => c.chatId === cid) || ensuredRef.current.has(cid)) continue;
      ensuredRef.current.add(cid);
      ensureUserChat(uid, cid).catch((err) => console.warn('[ChatApp] sohbet listesi', err));
    }
  }, [outgoing, chats, chatsLoading, uid]);

  // ── arama (kullanıcı adı ön eki, en fazla 20 sonuç) ──
  const q = normalizeUsername(queryText.replace(/^@/, ''));
  useEffect(() => {
    if (!q) {
      setResults({ q: '', list: [], loading: false });
      return undefined;
    }
    setResults((r) => ({ ...r, q, loading: true }));
    const id = setTimeout(() => {
      searchUsernames(q)
        .then((list) => setResults({ q, list: list.filter((r) => r.uid !== uid), loading: false }))
        .catch((err) => {
          friendlyError(err, 'arama');
          setResults({ q, list: [], loading: false });
        });
    }, 250);
    return () => clearTimeout(id);
  }, [q, uid]);

  const doSendRequest = async (to) => {
    try {
      await sendChatRequest(uid, to);
      toast('Sohbet isteği gönderildi');
    } catch (err) {
      const msg = friendlyError(err, 'istek gönderme');
      toast(msg === 'Bu işlem için yetkin yok.' ? 'Bu kişiye şu anda istek gönderilemiyor.' : msg, 'no');
    }
  };

  const doRespond = async (r, accept) => {
    try {
      const cid = await respondChatRequest(uid, r, accept);
      toast(accept ? 'Kabul edildi · sohbet başladı' : 'İstek reddedildi', accept ? 'ok' : 'no');
      if (accept && cid) openChat(cid);
    } catch (err) {
      toast(friendlyError(err, 'istek yanıtlama'), 'no');
    }
  };

  const pref = (chatId, prefs, okText) =>
    setChatPref(uid, chatId, prefs)
      .then(() => okText && toast(okText))
      .catch((err) => toast(friendlyError(err, 'sohbet ayarı'), 'no'));
  const onMute = useCallback((chatId, until) => pref(chatId, { muted: until || null }, until ? 'Sessize alındı' : 'Sesi açıldı'), [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── listeler ──
  const sorted = useMemo(
    () => [...chats].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (Number(b.lastMessage?.ts) || b.updatedAt) - (Number(a.lastMessage?.ts) || a.updatedAt)),
    [chats]
  );
  const archivedChats = sorted.filter((c) => c.archived);
  const visibleChats = showArchived ? archivedChats : sorted.filter((c) => !c.archived);
  const archivedUnread = archivedChats.reduce((n, c) => n + (c.unread > 0 ? 1 : 0), 0);
  const pinnedCount = chats.filter((c) => c.pinned && !c.archived).length;
  const outgoingNotices = outgoing.filter((r) => r.status !== 'pending' && !r.seenBySender);
  const searching = q.length > 0;
  const chatSet = new Set(chatIds);

  const forwardTargets = useMemo(
    () => sorted.filter((c) => metaOf(c.chatId).type === 'group' || (directOther(c.chatId) && blocks[directOther(c.chatId)] !== true)).map((c) => ({ chatId: c.chatId, ...metaOf(c.chatId) })),
    [sorted, metaOf, directOther, blocks]
  );

  const resultRows = results.list.map((r) => {
    const p = profiles[r.uid];
    const cid = chatIdFor(uid, r.uid);
    const mine = outgoing.find((o) => o.to === r.uid);
    const theirs = pendingIncoming.find((i) => i.from === r.uid);
    let label = 'İstek Gönder';
    let icon = 'userPlus';
    let action = () => doSendRequest(r.uid);
    let disabled = false;
    let primary = true;
    if (p && p.disabled) {
      label = 'Devre dışı';
      icon = 'x';
      disabled = true;
      primary = false;
    } else if (blocks[r.uid]) {
      label = 'Engelli';
      icon = 'slash';
      disabled = true;
      primary = false;
    } else if (chatSet.has(cid) || (mine && mine.status === 'accepted')) {
      label = 'Sohbet';
      icon = 'chat';
      action = () => openChat(cid);
      primary = false;
    } else if (theirs) {
      label = 'Yanıtla';
      icon = 'bell';
      action = () => setQueryText('');
      primary = false;
    } else if (mine && (mine.status === 'pending' || (mine.status === 'rejected' && Number(mine.ts) > Date.now() - DAY))) {
      label = 'Gönderildi';
      icon = 'clock';
      disabled = true;
      primary = false;
    }
    return { ...r, p, label, icon, action, disabled, primary };
  });

  const active = activeChat ? chats.find((c) => c.chatId === activeChat) : null;
  const activeOther = activeChat ? directOther(activeChat) : null;
  const showSidebar = desktop || !activeChat;
  const showChat = !!activeChat;

  const chatMenuItems = (c) => [
    c.pinned
      ? { label: 'Sabitlemeyi kaldır', icon: 'pin', onClick: () => pref(c.chatId, { pinned: null }) }
      : {
          label: 'Sabitle',
          icon: 'pin',
          onClick: () => (pinnedCount >= MAX_PINNED ? toast(`En fazla ${MAX_PINNED} sohbet sabitlenebilir.`, 'no') : pref(c.chatId, { pinned: true })),
        },
    c.archived ? { label: 'Arşivden çıkar', icon: 'archive', onClick: () => pref(c.chatId, { archived: null }, 'Arşivden çıkarıldı') } : { label: 'Arşivle', icon: 'archive', onClick: () => pref(c.chatId, { archived: true, pinned: null }, 'Arşivlendi') },
    isMuted(c.muted) ? { label: 'Sesi aç', icon: 'bell', onClick: () => onMute(c.chatId, null) } : { label: 'Sessize al', icon: 'bellOff', onClick: () => setMuteFor(c.chatId) },
    c.unread > 0 ? { label: 'Okundu olarak işaretle', icon: 'checkCheck', onClick: () => markChatRead(uid, c.chatId).catch(() => {}) } : null,
  ];

  const chatRow = (c) => {
    const meta = metaOf(c.chatId);
    const lm = c.lastMessage;
    const ts = Number(lm?.ts) || c.updatedAt;
    let preview = 'Sohbet başladı';
    if (lm) {
      if (lm.system) preview = lm.text || '';
      else if (lm.from === uid) preview = `Sen: ${lm.text || ''}`;
      else if (meta.type === 'group' && profiles[lm.from]) preview = `${profiles[lm.from].name}: ${lm.text || ''}`;
      else preview = lm.text || '';
    }
    const isActive = activeChat === c.chatId && desktop;
    const cancelPress = () => clearTimeout(pressRef.current);
    return (
      <div
        key={c.chatId}
        role="button"
        tabIndex={0}
        onClick={() => openChat(c.chatId)}
        onKeyDown={(e) => (e.key === 'Enter' ? openChat(c.chatId) : undefined)}
        onContextMenu={(e) => {
          e.preventDefault();
          setChatMenu(c);
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return;
          cancelPress();
          pressRef.current = setTimeout(() => {
            if (navigator.vibrate) navigator.vibrate(15);
            setChatMenu(c);
          }, 500);
        }}
        onPointerUp={cancelPress}
        onPointerMove={cancelPress}
        onPointerCancel={cancelPress}
        className="cx-row"
        style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '9px 16px', background: isActive ? t.surface : 'transparent', WebkitTouchCallout: 'none', userSelect: 'none' }}
      >
        <Avatar name={meta.name} uid={meta.avatarKey} color={meta.color} photoURL={meta.photoURL} size={50} dim={meta.disabled} />
        <div style={{ flex: 1, minWidth: 0, borderBottom: `1px solid ${t.divider}`, paddingBottom: 11 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 15.5, fontWeight: 600, color: t.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
              {meta.type === 'group' ? <Icon name="users" size={15} color={t.textSecondary} /> : null}
              {meta.name}
            </span>
            <span style={{ fontSize: 11.5, color: c.unread > 0 && !isMuted(c.muted) ? t.accent : t.textSecondary, flexShrink: 0, fontWeight: 500 }}>{formatListTime(ts)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 3 }}>
            <span style={{ fontSize: 13, color: t.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{preview}</span>
            {isMuted(c.muted) ? <Icon name="bellOff" size={14} color={t.textSecondary} /> : null}
            {c.pinned ? <Icon name="pin" size={14} color={t.textSecondary} /> : null}
            {c.unread > 0 ? (
              <span aria-label={`${c.unread} okunmamış mesaj`} style={{ background: isMuted(c.muted) ? t.textSecondary : t.accent, color: '#fff', minWidth: 19, height: 19, padding: '0 6px', borderRadius: 10, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {c.unread > 99 ? '99+' : c.unread}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const sidebar =
    view === 'settings' ? (
      <Suspense fallback={<div style={{ flex: 1 }} />}>
        <Settings t={t} me={me} email={user.email} theme={theme} onBack={() => setView('chats')} onLogout={onLogout} onAccountDeleted={onAccountDeleted} toast={toast} />
      </Suspense>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* başlık */}
        <div style={{ minHeight: 62, paddingTop: 'env(safe-area-inset-top)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 6, background: t.appbarBg, color: t.appbarText }}>
          <button type="button" onClick={() => setView('settings')} aria-label="Profil ve ayarlar" style={{ border: 'none', background: 'none', padding: 0, borderRadius: '50%' }}>
            <Avatar name={me.name} uid={uid} color={me.color} photoURL={me.photoURL} size={38} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.name}</div>
            <div style={{ fontSize: 12, opacity: 0.82 }}>@{me.username}</div>
          </div>
          <IconButton label="Yeni grup" icon="users" onClick={() => setCreatingGroup(true)} />
          <IconButton label={theme.mode === 'dark' ? 'Açık tema' : 'Koyu tema'} icon={theme.mode === 'dark' ? 'sun' : 'moon'} onClick={theme.toggle} />
          <IconButton label="Ayarlar" icon="settings" onClick={() => setView('settings')} />
        </div>

        {!connected ? (
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: t.warn, color: '#fff', fontSize: 13, fontWeight: 600 }}>
            <Icon name="wifiOff" size={16} />
            Bağlantı yok, mesajlar bağlanınca gönderilecek.
          </div>
        ) : null}

        {/* arama */}
        <div style={{ padding: '12px 14px 8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: t.surface, border: `1.5px solid ${queryText ? t.accent : t.divider}`, borderRadius: 12, padding: '0 14px', height: 44 }}>
            <Icon name="search" size={19} color={t.textSecondary} />
            <input value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="Kullanıcı adı ara ve istek gönder…" aria-label="Kullanıcı adı ara" autoCapitalize="off" autoCorrect="off" spellCheck={false} style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 14.5, color: t.textPrimary }} />
            {queryText ? <IconButton label="Aramayı temizle" icon="x" onClick={() => setQueryText('')} size={28} iconSize={17} color={t.textSecondary} /> : null}
          </div>
        </div>

        <div className="cx-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {searching ? (
            <>
              <SectionTitle t={t}>ARAMA SONUÇLARI</SectionTitle>
              {results.loading && results.list.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: t.textSecondary }}>
                  <span className="cx-spinner" aria-label="Aranıyor" />
                </div>
              ) : null}
              {!results.loading && results.list.length === 0 ? (
                <div style={{ padding: '30px 24px', textAlign: 'center', color: t.textSecondary }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    <Icon name="searchOff" size={28} />
                  </div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: t.textPrimary }}>"@{q}" bulunamadı</div>
                  <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>Bu kullanıcı adıyla başlayan kimse yok. Doğru yazdığından emin ol.</div>
                </div>
              ) : null}
              {resultRows.map((r) => (
                <div key={r.uid} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 16px' }}>
                  <Avatar name={r.p?.name || r.username} uid={r.uid} color={r.p?.color} photoURL={r.p?.photoURL} size={48} dim={r.p?.disabled} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: t.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.p?.name || '…'}</div>
                    <div style={{ fontSize: 13, color: t.textSecondary }}>@{r.username}</div>
                  </div>
                  <button
                    type="button"
                    onClick={r.action}
                    disabled={r.disabled}
                    className="cx-tap"
                    style={{ padding: '9px 15px', borderRadius: 21, border: 'none', background: r.primary ? t.accent : t.surface, color: r.primary ? '#fff' : r.disabled ? t.textSecondary : t.accent, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, opacity: r.disabled ? 0.7 : 1, whiteSpace: 'nowrap' }}
                  >
                    <Icon name={r.icon} size={15} />
                    {r.label}
                  </button>
                </div>
              ))}
            </>
          ) : (
            <>
              <NotificationCard t={t} uid={uid} toast={toast} />

              {pendingIncoming.length ? (
                <>
                  <SectionTitle t={t} color={t.accent} icon="bell">
                    GELEN İSTEKLER ({pendingIncoming.length})
                  </SectionTitle>
                  {pendingIncoming.map((r) => {
                    const p = profiles[r.from];
                    return (
                      <div key={r.id} style={{ margin: '8px 12px', background: t.bg, border: `1px solid ${t.divider}`, borderRadius: 15, padding: 13, boxShadow: '0 3px 14px rgba(0,0,0,.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Avatar name={p?.name} uid={r.from} color={p?.color} photoURL={p?.photoURL} size={46} ring />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary }}>{p?.name || '…'}</div>
                            <div style={{ fontSize: 12.5, color: t.textSecondary }}>{p?.username ? `@${p.username} · ` : ''}sohbet isteği</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 9, marginTop: 11 }}>
                          <button type="button" onClick={() => doRespond(r, false)} className="cx-tap" style={{ flex: 1, height: 38, borderRadius: 10, border: 'none', background: t.surface, color: t.textSecondary, fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <Icon name="x" size={15} />
                            Reddet
                          </button>
                          <button type="button" onClick={() => doRespond(r, true)} className="cx-tap" style={{ flex: 1, height: 38, borderRadius: 10, border: 'none', background: t.accent, color: '#fff', fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: `0 4px 12px ${t.accentShadow}` }}>
                            <Icon name="check" size={15} />
                            Kabul et
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : null}

              {outgoingNotices.length ? (
                <>
                  <SectionTitle t={t}>BİLDİRİMLER</SectionTitle>
                  {outgoingNotices.map((r) => {
                    const ok = r.status === 'accepted';
                    return (
                      <div key={r.id} style={{ margin: '7px 12px', display: 'flex', alignItems: 'flex-start', gap: 11, background: t.bg, border: `1px solid ${t.divider}`, borderRadius: 13, padding: '11px 13px' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 9, background: ok ? t.accent : t.error, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                          <Icon name={ok ? 'check' : 'x'} size={17} />
                        </div>
                        <button type="button" onClick={() => (ok ? openChat(chatIdFor(uid, r.to)) : undefined)} style={{ flex: 1, minWidth: 0, fontSize: 13, color: t.textPrimary, lineHeight: 1.45, border: 'none', background: 'none', textAlign: 'left', padding: 0, cursor: ok ? 'pointer' : 'default' }}>
                          {ok ? `${nameOf(r.to)} isteğini kabul etti — sohbet başladı.` : `${nameOf(r.to)} sohbet isteğini reddetti.`}
                        </button>
                        <IconButton label="Bildirimi kapat" icon="x" onClick={() => markRequestSeen(uid, r).catch((err) => friendlyError(err, 'bildirim kapatma'))} size={24} iconSize={16} color={t.textSecondary} />
                      </div>
                    );
                  })}
                </>
              ) : null}

              {isAdmin ? (
                <Suspense fallback={null}>
                  <AdminPanel t={t} me={me} toast={toast} />
                </Suspense>
              ) : null}

              {showArchived ? (
                <button type="button" onClick={() => setShowArchived(false)} className="cx-row" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px 6px', border: 'none', background: 'none', color: t.accent, fontWeight: 700, fontSize: 13 }}>
                  <Icon name="back" size={18} /> ARŞİVLENMİŞ SOHBETLER
                </button>
              ) : (
                <>
                  <SectionTitle t={t}>SOHBETLER</SectionTitle>
                  {archivedChats.length ? (
                    <button type="button" onClick={() => setShowArchived(true)} className="cx-row" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: '10px 16px 10px 28px', border: 'none', background: 'none', color: t.textPrimary, fontSize: 15, fontWeight: 600, textAlign: 'left' }}>
                      <Icon name="archive" size={20} color={t.accent} />
                      <span style={{ flex: 1 }}>Arşivlenmiş</span>
                      <span style={{ fontSize: 12.5, color: archivedUnread ? t.accent : t.textSecondary, fontWeight: 700 }}>{archivedUnread || archivedChats.length}</span>
                    </button>
                  ) : null}
                </>
              )}
              {!chatsLoading && visibleChats.length === 0 ? (
                <div style={{ padding: '34px 28px', textAlign: 'center', color: t.textSecondary }}>
                  <div style={{ width: 64, height: 64, borderRadius: 18, background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <Icon name={showArchived ? 'archive' : 'chat'} size={32} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary }}>{showArchived ? 'Arşiv boş' : 'Henüz sohbetin yok'}</div>
                  {!showArchived ? (
                    <div style={{ fontSize: 13, marginTop: 7, lineHeight: 1.55 }}>
                      Yukarıdan bir <b>kullanıcı adı</b> ara ve sohbet isteği gönder. Karşı taraf onayladığında konuşmanız burada açılır.
                    </div>
                  ) : null}
                </div>
              ) : null}
              {visibleChats.map(chatRow)}
              <div style={{ padding: '14px 16px', textAlign: 'center', fontSize: 11.5, color: t.textSecondary }}>Sohbete uzun basarak sabitleyebilir, arşivleyebilir veya sessize alabilirsin.</div>
              <div style={{ height: 'calc(12px + env(safe-area-inset-bottom))' }} />
            </>
          )}
        </div>
      </div>
    );

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: t.canvas, minHeight: 0 }}>
      {showSidebar ? (
        <div style={{ width: desktop ? 380 : '100%', maxWidth: '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', background: t.bg, borderRight: `1px solid ${t.divider}`, height: '100%' }}>{sidebar}</div>
      ) : null}

      {showChat ? (
        <ChatView
          key={activeChat}
          t={t}
          me={me}
          chatId={activeChat}
          chat={chatNodes[activeChat]}
          userChat={active}
          blockedByMe={!!(activeOther && blocks[activeOther])}
          desktop={desktop}
          onBack={closeChat}
          toast={toast}
          forwardTargets={forwardTargets}
          onOpenChat={openChat}
          onMute={onMute}
        />
      ) : desktop ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40, background: t.emptyBg }}>
          <div style={{ width: 110, height: 110, borderRadius: '50%', background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.accent, marginBottom: 24 }}>
            <Icon name="messageCircle" size={56} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: t.textPrimary, letterSpacing: -0.3 }}>ChatApp Web</div>
          <div style={{ fontSize: 15, color: t.textSecondary, marginTop: 12, maxWidth: 400, lineHeight: 1.6 }}>
            Soldan bir sohbet seç ya da bir <b>kullanıcı adı</b> arayıp istek gönder. Onaylanan istekler sohbete dönüşür.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 28, fontSize: 13, color: t.textSecondary, fontWeight: 600 }}>
            <Icon name="lock" size={16} />
            Bağlantın şifreli (HTTPS)
          </div>
        </div>
      ) : null}

      {chatMenu ? <ActionSheet t={t} title={metaOf(chatMenu.chatId).name} items={chatMenuItems(chatMenu)} onClose={() => setChatMenu(null)} /> : null}
      {muteFor ? <ActionSheet t={t} title="Bildirimleri sessize al" items={muteItems((until) => onMute(muteFor, until))} onClose={() => setMuteFor(null)} /> : null}
      {creatingGroup ? (
        <Suspense fallback={null}>
          <CreateGroup
            t={t}
            contacts={forwardTargets.filter((x) => x.type === 'direct' && x.uid && !x.disabled).map((x) => ({ uid: x.uid, name: x.name, username: x.username, color: x.color, photoURL: x.photoURL }))}
            onClose={() => setCreatingGroup(false)}
            onCreated={(chatId) => {
              setCreatingGroup(false);
              toast('Grup kuruldu');
              openChat(chatId);
            }}
            toast={toast}
          />
        </Suspense>
      ) : null}
      <InAppBanner t={t} banner={banner} profile={banner ? profiles[banner.from] : null} chatName={banner && banner.chatId ? metaOf(banner.chatId) : null} onOpen={(b) => (b.chatId ? openChat(b.chatId) : setView('chats'))} onClose={clearBanner} />
      <Toast t={t} toast={toastState} onDone={clearToast} />
    </div>
  );
}
