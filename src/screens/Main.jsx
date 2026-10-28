import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import AdminPanel from '../components/AdminPanel.jsx';
import ChatView from '../components/ChatView.jsx';
import InAppBanner from '../components/InAppBanner.jsx';
import NotificationCard from '../components/NotificationCard.jsx';
import Settings from '../components/Settings.jsx';
import { Avatar, IconButton, SectionTitle, Toast } from '../components/ui.jsx';
import { db } from '../firebase.js';
import { useIncomingRequests, useOutgoingRequests, useProfiles, useUserChats } from '../hooks/data.js';
import {
  chatIdFor,
  ensureUserChat,
  markDelivered,
  markRequestSeen,
  otherMember,
  respondChatRequest,
  searchUsernames,
  sendChatRequest,
} from '../lib/api.js';
import { friendlyError } from '../lib/errors.js';
import { formatListTime } from '../lib/format.js';
import { Icon } from '../lib/icons.jsx';
import { setActiveChat, startPresence } from '../lib/presence.js';
import { setAppBadge, syncPushToken } from '../lib/push.js';
import { playNotificationSound, unlockAudio } from '../lib/sound.js';
import { onServiceWorkerMessage, readChatParam } from '../lib/sw.js';
import { normalizeUsername } from '../lib/username.js';

const DAY = 86400000;
const isMuted = (m) => m === true || (typeof m === 'number' && m > Date.now());
const chatUrl = (chatId) => {
  const url = new URL(window.location.href);
  url.searchParams.delete('source');
  if (chatId) url.searchParams.set('chat', chatId);
  else url.searchParams.delete('chat');
  return url.toString();
};

function useConnected() {
  const [connected, setConnected] = useState(true);
  useEffect(() => {
    let timer = null;
    const unsub = onValue(ref(db, '.info/connected'), (snap) => {
      clearTimeout(timer);
      if (snap.val() === true) setConnected(true);
      // Açılıştaki kısa bağlantı süresinde bant yanıp sönmesin.
      else timer = setTimeout(() => setConnected(false), 2500);
    });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, []);
  return connected;
}

export default function Main({ t, theme, desktop, user, me, isAdmin, onLogout, registerCleanup }) {
  const uid = me.uid;
  const [activeChat, setActive] = useState(null);
  const [view, setView] = useState('chats'); // chats | settings
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState({ q: '', list: [], loading: false });
  const [toastState, setToastState] = useState(null);
  const [banner, setBanner] = useState(null);
  const connected = useConnected();

  const toast = useCallback((text, kind) => setToastState({ text, kind, id: Date.now() }), []);
  const clearToast = useCallback(() => setToastState(null), []);
  const clearBanner = useCallback(() => setBanner(null), []);

  const { chats, loading: chatsLoading } = useUserChats(uid);
  const incoming = useIncomingRequests(uid);
  const outgoing = useOutgoingRequests(uid);
  const pendingIncoming = useMemo(() => incoming.filter((r) => r.status === 'pending'), [incoming]);

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

  // Bildirimden gelen ?chat=<id> ve servis çalışanının "open-chat" mesajı.
  const initialChatRef = useRef(readChatParam());
  useEffect(() => {
    const target = initialChatRef.current;
    if (!target) return;
    initialChatRef.current = null;
    if (target.split('_').includes(uid)) {
      window.history.replaceState(null, '', chatUrl(null));
      openChat(target);
    } else {
      window.history.replaceState(null, '', chatUrl(null));
    }
  }, [uid, openChat]);

  useEffect(
    () =>
      onServiceWorkerMessage((msg) => {
        if (msg.type === 'open-chat' && msg.chatId && String(msg.chatId).split('_').includes(uid)) openChat(msg.chatId);
        if (msg.type === 'open-requests') {
          setView('chats');
          closeChat();
        }
      }),
    [uid, openChat, closeChat]
  );

  // ── profiller ──
  const otherUids = useMemo(
    () => [
      ...chats.map((c) => otherMember(c.chatId, uid)),
      ...incoming.map((r) => r.from),
      ...outgoing.map((r) => r.to),
      ...results.list.map((r) => r.uid),
    ],
    [chats, incoming, outgoing, results.list, uid]
  );
  const profiles = useProfiles(otherUids);
  const nameOf = (id) => profiles[id]?.name || 'Kullanıcı';

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
      if (!first && ts > (prev[c.chatId] || 0) && visible && c.chatId !== activeChat && !isMuted(c.muted)) {
        setBanner({ kind: 'message', chatId: c.chatId, uid: otherMember(c.chatId, uid), body: lm.text || 'Yeni mesaj', at: Date.now() });
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
        setBanner({ kind: 'request', chatId: null, uid: fresh.from, at: Date.now() });
        playNotificationSound();
      }
    }
    seenRequestsRef.current = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      toast(friendlyError(err, 'istek gönderme') === 'Bu işlem için yetkin yok.' ? 'Bu kişiye şu anda istek gönderilemiyor.' : 'İstek gönderilemedi. Yeniden dene.', 'no');
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

  // ── listeler ──
  const sortedChats = useMemo(
    () =>
      [...chats]
        .filter((c) => !c.archived)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (Number(b.lastMessage?.ts) || b.updatedAt) - (Number(a.lastMessage?.ts) || a.updatedAt)),
    [chats]
  );
  const outgoingNotices = outgoing.filter((r) => r.status !== 'pending' && !r.seenBySender);
  const searching = q.length > 0;
  const chatSet = new Set(chats.map((c) => c.chatId));

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
    } else if (chatSet.has(cid)) {
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
    } else if (mine && mine.status === 'accepted') {
      label = 'Sohbet';
      icon = 'chat';
      action = () => openChat(cid);
      primary = false;
    }
    return { ...r, p, label, icon, action, disabled, primary };
  });

  const active = activeChat ? chats.find((c) => c.chatId === activeChat) : null;
  const activeOther = activeChat ? otherMember(activeChat, uid) : null;
  const showSidebar = desktop || !activeChat;
  const showChat = !!activeChat;

  const sidebar = view === 'settings' ? (
    <Settings t={t} me={me} email={user.email} theme={theme} onBack={() => setView('chats')} onLogout={onLogout} toast={toast} />
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* başlık */}
      <div style={{ minHeight: 62, paddingTop: 'env(safe-area-inset-top)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 18, paddingRight: 8, background: t.appbarBg, color: t.appbarText }}>
        <Avatar name={me.name} uid={uid} color={me.color} photoURL={me.photoURL} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.name}</div>
          <div style={{ fontSize: 12, opacity: 0.82 }}>@{me.username}</div>
        </div>
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
          <input
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Kullanıcı adı ara ve istek gönder…"
            aria-label="Kullanıcı adı ara"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 14.5, color: t.textPrimary }}
          />
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
                      <button
                        type="button"
                        onClick={() => (ok ? openChat(chatIdFor(uid, r.to)) : undefined)}
                        style={{ flex: 1, minWidth: 0, fontSize: 13, color: t.textPrimary, lineHeight: 1.45, paddingTop: 1, border: 'none', background: 'none', textAlign: 'left', padding: 0, cursor: ok ? 'pointer' : 'default' }}
                      >
                        {ok ? `${nameOf(r.to)} isteğini kabul etti — sohbet başladı.` : `${nameOf(r.to)} sohbet isteğini reddetti.`}
                      </button>
                      <IconButton label="Kapat" icon="x" onClick={() => markRequestSeen(uid, r).catch((err) => friendlyError(err, 'bildirim kapatma'))} size={24} iconSize={16} color={t.textSecondary} />
                    </div>
                  );
                })}
              </>
            ) : null}

            {isAdmin ? <AdminPanel t={t} me={me} toast={toast} /> : null}

            <SectionTitle t={t}>SOHBETLER</SectionTitle>
            {!chatsLoading && sortedChats.length === 0 ? (
              <div style={{ padding: '34px 28px', textAlign: 'center', color: t.textSecondary }}>
                <div style={{ width: 64, height: 64, borderRadius: 18, background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Icon name="chat" size={32} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary }}>Henüz sohbetin yok</div>
                <div style={{ fontSize: 13, marginTop: 7, lineHeight: 1.55 }}>
                  Yukarıdan bir <b>kullanıcı adı</b> ara ve sohbet isteği gönder. Karşı taraf onayladığında konuşmanız burada açılır.
                </div>
              </div>
            ) : null}
            {sortedChats.map((c) => {
              const other = otherMember(c.chatId, uid);
              const p = profiles[other];
              const lm = c.lastMessage;
              const ts = Number(lm?.ts) || c.updatedAt;
              const preview = lm ? (lm.from === uid ? `Sen: ${lm.text || ''}` : lm.text || '') : 'Sohbet başladı';
              const isActive = activeChat === c.chatId && desktop;
              return (
                <div
                  key={c.chatId}
                  role="button"
                  tabIndex={0}
                  onClick={() => openChat(c.chatId)}
                  onKeyDown={(e) => (e.key === 'Enter' ? openChat(c.chatId) : undefined)}
                  className="cx-row"
                  style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '9px 16px', background: isActive ? t.surface : 'transparent' }}
                >
                  <Avatar name={p?.name} uid={other} color={p?.color} photoURL={p?.photoURL} size={50} dim={p?.disabled} />
                  <div style={{ flex: 1, minWidth: 0, borderBottom: `1px solid ${t.divider}`, paddingBottom: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 15.5, fontWeight: 600, color: t.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p?.name || '…'}</span>
                      <span style={{ fontSize: 11.5, color: c.unread > 0 ? t.accent : t.textSecondary, flexShrink: 0, fontWeight: 500 }}>{formatListTime(ts)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 3 }}>
                      <span style={{ fontSize: 13, color: t.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{preview}</span>
                      {isMuted(c.muted) ? <Icon name="bellOff" size={14} color={t.textSecondary} /> : null}
                      {c.unread > 0 ? (
                        <span aria-label={`${c.unread} okunmamış mesaj`} style={{ background: isMuted(c.muted) ? t.textSecondary : t.accent, color: '#fff', minWidth: 19, height: 19, padding: '0 6px', borderRadius: 10, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {c.unread > 99 ? '99+' : c.unread}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{ height: 'calc(24px + env(safe-area-inset-bottom))' }} />
          </>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: t.canvas, minHeight: 0 }}>
      {showSidebar ? (
        <div style={{ width: desktop ? 380 : '100%', maxWidth: '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', background: t.bg, borderRight: `1px solid ${t.divider}`, height: '100%' }}>
          {sidebar}
        </div>
      ) : null}

      {showChat ? (
        <ChatView
          key={activeChat}
          t={t}
          me={me}
          chatId={activeChat}
          other={profiles[activeOther]}
          otherUid={activeOther}
          userChat={active}
          desktop={desktop}
          onBack={closeChat}
          toast={toast}
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

      <InAppBanner t={t} banner={banner} profile={banner ? profiles[banner.uid] : null} onOpen={(b) => (b.chatId ? openChat(b.chatId) : setView('chats'))} onClose={clearBanner} />
      <Toast t={t} toast={toastState} onDone={clearToast} />
    </div>
  );
}
