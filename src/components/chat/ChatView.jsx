import { Fragment, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { onDisconnect, ref, set } from 'firebase/database';
import { db } from '../../firebase.js';
import { EMPTY, useDbValue, useMessages, usePresence, useProfiles } from '../../hooks/data.js';
import {
  canEdit,
  deleteForEveryone,
  deleteForMe,
  editMessage,
  fetchMessage,
  markChatRead,
  newMessageId,
  REACTIONS,
  sendMessage,
  setBlocked,
  setReaction,
} from '../../lib/api.js';
import { muteItems } from '../../lib/chatPrefs.js';
import { friendlyError } from '../../lib/errors.js';
import { dayDiff, formatDaySeparator, formatLastSeen, formatSize } from '../../lib/format.js';
import { Icon } from '../../lib/icons.jsx';
import { MAX_ATTACHMENT, uploadAttachment } from '../../lib/storage.js';
import { confirmDialog } from '../dialogs.jsx';
import { ActionSheet } from '../Modal.jsx';
import { Avatar, IconButton } from '../ui.jsx';
import Composer from './Composer.jsx';
import MessageBubble from './MessageBubble.jsx';

const ImageViewer = lazy(() => import('./ImageViewer.jsx'));
const ForwardDialog = lazy(() => import('./ForwardDialog.jsx'));
const ReportDialog = lazy(() => import('../ReportDialog.jsx'));
const ProfileSheet = lazy(() => import('../ProfileSheet.jsx'));
const GroupInfo = lazy(() => import('../GroupInfo.jsx'));

const TYPING_IDLE_MS = 4000;
const PAGE = 50;

export default function ChatView({
  t,
  me,
  chatId,
  chat,
  userChat,
  blockedByMe,
  desktop,
  onBack,
  toast,
  forwardTargets,
  onOpenChat,
  onMute,
}) {
  const myUid = me.uid;
  const isGroup = chat?.type === 'group';
  const memberIds = useMemo(() => {
    if (chat?.members) return Object.keys(chat.members).filter((u) => chat.members[u] === true);
    return isGroup ? [] : chatId.split('_');
  }, [chat, chatId, isGroup]);
  const amMember = !chat || chat.members?.[myUid] === true;
  const otherUid = !isGroup ? memberIds.find((u) => u !== myUid) || null : null;
  const profiles = useProfiles(useMemo(() => [...memberIds, myUid], [memberIds, myUid]));
  const other = otherUid ? profiles[otherUid] : null;

  const [limit, setLimit] = useState(PAGE);
  const { list, loading, hasMore } = useMessages(amMember ? chatId : null, limit);
  const hidden = useDbValue(`hidden/${myUid}/${chatId}`).value || EMPTY;
  const receipts = useDbValue(amMember ? `receipts/${chatId}` : null).value || EMPTY;
  const typingNode = useDbValue(amMember ? `typing/${chatId}` : null).value || EMPTY;
  const presence = usePresence(otherUid);

  const messages = useMemo(() => list.filter((m) => !hidden[m.id]), [list, hidden]);
  const byId = useMemo(() => new Map(list.map((m) => [m.id, m])), [list]);

  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [muteMenu, setMuteMenu] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [reporting, setReporting] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [search, setSearch] = useState({ open: false, q: '', idx: 0 });
  const [focusId, setFocusId] = useState(null);
  const [extraReplies, setExtraReplies] = useState({});
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);

  const scrollerRef = useRef(null);
  const typingRef = useRef({ timer: null, active: false });
  const lastIdRef = useRef(null);
  const firstIdRef = useRef(null);
  const prependRef = useRef(null);
  const sentByMeRef = useRef(false);
  const pendingIds = useRef(new Set());
  const [, bump] = useState(0);

  // ── yazıyor bayrağı: onDisconnect ile temizlenir, 4 sn işlem yoksa kaldırılır ──
  const typingPath = `typing/${chatId}/${myUid}`;
  const stopTyping = useCallback(() => {
    clearTimeout(typingRef.current.timer);
    if (typingRef.current.active) {
      typingRef.current.active = false;
      set(ref(db, typingPath), null).catch(() => {});
    }
  }, [typingPath]);
  const onTyping = useCallback(
    (active) => {
      if (!active) return stopTyping();
      clearTimeout(typingRef.current.timer);
      if (!typingRef.current.active) {
        typingRef.current.active = true;
        const r = ref(db, typingPath);
        onDisconnect(r)
          .remove()
          .catch(() => {});
        set(r, true).catch(() => {});
      }
      typingRef.current.timer = setTimeout(stopTyping, TYPING_IDLE_MS);
      return undefined;
    },
    [typingPath, stopTyping]
  );
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && stopTyping();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      stopTyping();
    };
  }, [stopTyping]);

  // ── okundu bilgisi ──
  const others = memberIds.filter((u) => u !== myUid);
  const myRead = Number(receipts[myUid]?.read) || 0;
  const minOf = (field) =>
    others.length
      ? Math.min(
          ...others.map((u) => Math.max(Number(receipts[u]?.[field]) || 0, field === 'delivered' ? Number(receipts[u]?.read) || 0 : 0))
        )
      : 0;
  const othersRead = minOf('read');
  const othersDelivered = minOf('delivered');
  const lastIncomingTs = useMemo(() => {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].from !== myUid) return Number(list[i].ts) || 0;
    return 0;
  }, [list, myUid]);
  const unread = userChat ? userChat.unread : 0;
  const markingRef = useRef(0);
  useEffect(() => {
    if (!amMember) return undefined;
    let timer = null;
    const tryMark = () => {
      clearTimeout(timer);
      if (document.visibilityState !== 'visible') return;
      if (!(unread > 0 || lastIncomingTs > myRead)) return;
      const wait = 1500 - (Date.now() - markingRef.current);
      if (wait > 0) {
        timer = setTimeout(tryMark, wait);
        return;
      }
      markingRef.current = Date.now();
      markChatRead(myUid, chatId).catch((err) => console.warn('[ChatApp] okundu', err));
    };
    tryMark();
    document.addEventListener('visibilitychange', tryMark);
    window.addEventListener('focus', tryMark);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', tryMark);
      window.removeEventListener('focus', tryMark);
    };
  }, [chatId, myUid, unread, lastIncomingTs, myRead, amMember]);

  const statusOf = (m) => {
    if (pendingIds.current.has(m.id)) return 'pending';
    const ts = Number(m.ts) || 0;
    if (othersRead >= ts) return 'read';
    if (othersDelivered >= ts) return 'delivered';
    return 'sent';
  };

  // ── kaydırma ──
  const scrollToBottom = useCallback((smooth) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setNewCount(0);
  }, []);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(bottom);
    if (bottom) setNewCount(0);
    // Yukarı kaydırdıkça 50'şer eski mesaj.
    if (el.scrollTop < 60 && hasMore && !loading && !prependRef.current) {
      prependRef.current = { height: el.scrollHeight, top: el.scrollTop };
      setLimit((l) => l + PAGE);
    }
  };

  useLayoutEffect(() => {
    if (loading && !list.length) return;
    const el = scrollerRef.current;
    const first = messages[0];
    const last = messages[messages.length - 1];
    const lastId = last ? last.id : '';
    if (prependRef.current && el) {
      // Eski mesajlar eklendi: görünen konumu koru.
      el.scrollTop = el.scrollHeight - prependRef.current.height + prependRef.current.top;
      prependRef.current = null;
    } else if (lastIdRef.current === null) {
      scrollToBottom(false);
    } else if (lastId && lastId !== lastIdRef.current) {
      if (atBottom || (last.from === myUid && sentByMeRef.current)) scrollToBottom(true);
      else if (last.from !== myUid) setNewCount((n) => n + 1);
    }
    sentByMeRef.current = false;
    lastIdRef.current = lastId;
    firstIdRef.current = first ? first.id : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading]);

  useEffect(() => {
    if (!loading && prependRef.current && !hasMore) prependRef.current = null;
  }, [loading, hasMore]);

  const typingOthers = Object.keys(typingNode).filter((u) => u !== myUid && typingNode[u] === true);
  useEffect(() => {
    if (typingOthers.length && atBottom) scrollToBottom(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typingOthers.length]);

  const jumpTo = useCallback((id) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setFocusId(id);
      setTimeout(() => setFocusId((f) => (f === id ? null : f)), 1600);
    }
  }, []);

  // Yanıtlanan mesaj yüklenmemişse bir kez getir.
  useEffect(() => {
    const missing = messages.filter((m) => m.replyTo && !byId.has(m.replyTo) && !(m.replyTo in extraReplies)).map((m) => m.replyTo);
    if (!missing.length) return;
    Promise.all(missing.map((id) => fetchMessage(chatId, id).catch(() => null))).then((found) => {
      setExtraReplies((prev) => {
        const next = { ...prev };
        missing.forEach((id, i) => (next[id] = found[i]));
        return next;
      });
    });
  }, [messages, byId, extraReplies, chatId]);

  // ── gönderme ──
  const send = (text) => {
    const id = newMessageId(chatId);
    const reply = replyTo;
    setReplyTo(null);
    stopTyping();
    sentByMeRef.current = true;
    pendingIds.current.add(id);
    bump((n) => n + 1);
    sendMessage(myUid, chatId, { id, text, replyTo: reply ? reply.id : undefined })
      .catch((err) => {
        friendlyError(err, 'mesaj gönderme');
        toast('Mesaj gönderilemedi. Yeniden dene.', 'no');
      })
      .finally(() => {
        pendingIds.current.delete(id);
        bump((n) => n + 1);
      });
  };

  const startUpload = (file, extra = {}) => {
    if (file.size > MAX_ATTACHMENT) {
      toast(`"${file.name}" 25 MB'tan büyük; gönderilemez.`, 'no');
      return;
    }
    const id = newMessageId(chatId);
    const reply = replyTo;
    setReplyTo(null);
    const handle = uploadAttachment(chatId, id, file, {
      onProgress: (p) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: p } : x))),
    });
    setUploads((u) => [...u, { id, name: file.name, size: file.size, type: file.type, progress: 0, handle }]);
    sentByMeRef.current = true;
    handle.promise
      .then((att) => sendMessage(myUid, chatId, { id, attachment: { ...att, ...extra }, replyTo: reply ? reply.id : undefined }))
      .catch((err) => {
        if (err && err.code === 'storage/canceled') return;
        toast(friendlyError(err, 'dosya gönderme'), 'no');
      })
      .finally(() => setUploads((u) => u.filter((x) => x.id !== id)));
  };

  // ── mesaj işlemleri ──
  const myLast = userChat?.lastMessage || null;
  const onReactionClick = useCallback(
    (msg, mine) => {
      if (mine) setReaction(myUid, chatId, msg.id, null).catch((err) => toast(friendlyError(err, 'tepki'), 'no'));
      else setMenuFor(msg);
    },
    [myUid, chatId, toast]
  );

  const doDelete = async (msg) => {
    const mine = msg.from === myUid && !msg.deleted;
    if (!mine) {
      if (
        await confirmDialog({ title: 'Mesaj silinsin mi?', text: 'Mesaj yalnızca senden silinir.', okText: 'Benden sil', danger: true })
      ) {
        deleteForMe(myUid, chatId, [msg.id]).catch((err) => toast(friendlyError(err, 'silme'), 'no'));
      }
      return;
    }
    setMenuFor({ ...msg, _deleteChoice: true });
  };

  const menuItems = (msg) => {
    if (msg._deleteChoice) {
      return [
        {
          label: 'Herkesten sil',
          icon: 'trash',
          danger: true,
          onClick: () => deleteForEveryone(myUid, chatId, msg, myLast).catch((err) => toast(friendlyError(err, 'silme'), 'no')),
        },
        {
          label: 'Benden sil',
          icon: 'trash',
          onClick: () => deleteForMe(myUid, chatId, [msg.id]).catch((err) => toast(friendlyError(err, 'silme'), 'no')),
        },
      ];
    }
    const mine = msg.from === myUid;
    const items = [];
    if (!msg.deleted) items.push({ label: 'Yanıtla', icon: 'reply', onClick: () => setReplyTo(msg) });
    if (!msg.deleted && msg.text)
      items.push({
        label: 'Kopyala',
        icon: 'copy',
        onClick: () =>
          navigator.clipboard
            .writeText(msg.text)
            .then(() => toast('Kopyalandı'))
            .catch(() => toast('Kopyalanamadı', 'no')),
      });
    if (canEdit(msg, myUid)) items.push({ label: 'Düzenle', icon: 'edit', hint: '15 dk', onClick: () => setEditing(msg) });
    if (!msg.deleted) items.push({ label: 'İlet', icon: 'forward', onClick: () => setForwarding(msg) });
    items.push({ label: 'Sil', icon: 'trash', danger: true, onClick: () => doDelete(msg) });
    if (!mine && !msg.deleted)
      items.push({ label: 'Şikâyet et', icon: 'flag', danger: true, onClick: () => setReporting({ target: msg.from, messageId: msg.id }) });
    return items;
  };

  const reactionRow = (msg) =>
    msg.deleted || msg._deleteChoice ? null : (
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '12px 10px 4px' }}>
        {REACTIONS.map((e) => {
          const active = msg.reactions && msg.reactions[myUid] === e;
          return (
            <button
              key={e}
              type="button"
              aria-label={`Tepki: ${e}`}
              aria-pressed={active}
              onClick={() => {
                setMenuFor(null);
                setReaction(myUid, chatId, msg.id, active ? null : e).catch((err) => toast(friendlyError(err, 'tepki'), 'no'));
              }}
              className="cx-tap"
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                border: 'none',
                fontSize: 25,
                background: active ? t.surface : 'transparent',
                boxShadow: active ? `0 0 0 2px ${t.accent}` : 'none',
              }}
            >
              {e}
            </button>
          );
        })}
      </div>
    );

  // ── arama ──
  const term = search.open ? search.q.trim() : '';
  const matches = useMemo(() => {
    if (!term) return [];
    const needle = term.toLocaleLowerCase('tr-TR');
    return messages.filter((m) => !m.deleted && m.text && m.text.toLocaleLowerCase('tr-TR').includes(needle)).map((m) => m.id);
  }, [messages, term]);
  useEffect(() => {
    if (matches.length) jumpTo(matches[Math.min(search.idx, matches.length - 1)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, search.idx, matches.length]);

  // ── başlık ──
  const name = isGroup ? chat?.name || 'Grup' : other === null ? 'Silinmiş hesap' : other?.name || '…';
  let subtitle = '';
  if (typingOthers.length) {
    subtitle = isGroup
      ? typingOthers.length === 1
        ? `${profiles[typingOthers[0]]?.name || 'Biri'} yazıyor…`
        : `${typingOthers.length} kişi yazıyor…`
      : 'yazıyor…';
  } else if (isGroup) {
    subtitle = memberIds
      .map((u) => (u === myUid ? 'Sen' : profiles[u]?.name))
      .filter(Boolean)
      .join(', ');
  } else if (presence.online) subtitle = 'çevrimiçi';
  else if (presence.lastSeen) subtitle = formatLastSeen(presence.lastSeen);
  else if (other?.username) subtitle = `@${other.username}`;

  const muted = userChat && (userChat.muted === true || (typeof userChat.muted === 'number' && userChat.muted > Date.now()));
  const headerItems = isGroup
    ? [
        { label: 'Grup bilgisi', icon: 'users', onClick: () => setGroupInfoOpen(true) },
        { label: 'Sohbette ara', icon: 'search', onClick: () => setSearch({ open: true, q: '', idx: 0 }) },
        muted
          ? { label: 'Sesi aç', icon: 'bell', onClick: () => onMute(chatId, null) }
          : { label: 'Sessize al', icon: 'bellOff', onClick: () => setMuteMenu(true) },
      ]
    : [
        { label: 'Kişi bilgisi', icon: 'user', onClick: () => setProfileOpen(true) },
        { label: 'Sohbette ara', icon: 'search', onClick: () => setSearch({ open: true, q: '', idx: 0 }) },
        muted
          ? { label: 'Sesi aç', icon: 'bell', onClick: () => onMute(chatId, null) }
          : { label: 'Sessize al', icon: 'bellOff', onClick: () => setMuteMenu(true) },
        otherUid
          ? {
              label: blockedByMe ? 'Engeli kaldır' : 'Engelle',
              icon: 'slash',
              danger: !blockedByMe,
              onClick: async () => {
                if (
                  !blockedByMe &&
                  !(await confirmDialog({
                    title: `${name} engellensin mi?`,
                    text: 'Engellenen kişi sana mesaj ve istek gönderemez, bildirim almazsın.',
                    okText: 'Engelle',
                    danger: true,
                  }))
                )
                  return;
                setBlocked(myUid, otherUid, !blockedByMe)
                  .then(() => toast(blockedByMe ? 'Engel kaldırıldı' : 'Engellendi'))
                  .catch((err) => toast(friendlyError(err, 'engelleme'), 'no'));
              },
            }
          : null,
        otherUid ? { label: 'Şikâyet et', icon: 'flag', danger: true, onClick: () => setReporting({ target: otherUid }) } : null,
      ];

  // ── mesaj kutusu durumu ──
  let disabledNotice = null;
  if (!amMember) disabledNotice = 'Bu grubun üyesi değilsin.';
  else if (!isGroup && other === null) disabledNotice = 'Bu hesap silindi.';
  else if (!isGroup && other?.disabled) disabledNotice = 'Bu hesap devre dışı bırakıldı; mesaj gönderilemez.';

  const replyName = replyTo ? (replyTo.from === myUid ? 'Sen' : profiles[replyTo.from]?.name || 'Kullanıcı') : '';

  return (
    <div
      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', background: t.chatBg, position: 'relative' }}
    >
      {/* başlık */}
      <div
        style={{
          minHeight: 62,
          paddingTop: 'env(safe-area-inset-top)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingLeft: desktop ? 14 : 6,
          paddingRight: 6,
          background: t.appbarBg,
          color: t.appbarText,
          zIndex: 3,
        }}
      >
        {!desktop ? <IconButton label="Geri" icon="back" onClick={onBack} size={38} iconSize={23} /> : null}
        {search.open ? (
          <>
            <input
              autoFocus
              value={search.q}
              onChange={(e) => setSearch({ open: true, q: e.target.value, idx: 0 })}
              onKeyDown={(e) => e.key === 'Escape' && setSearch({ open: false, q: '', idx: 0 })}
              placeholder="Sohbette ara…"
              aria-label="Sohbette ara"
              style={{
                flex: 1,
                minWidth: 0,
                height: 38,
                borderRadius: 10,
                border: 'none',
                padding: '0 12px',
                fontSize: 15,
                background: 'rgba(255,255,255,.16)',
                color: 'inherit',
                outline: 'none',
              }}
            />
            <span style={{ fontSize: 12.5, opacity: 0.85, minWidth: 44, textAlign: 'center' }}>
              {term ? `${matches.length ? Math.min(search.idx, matches.length - 1) + 1 : 0}/${matches.length}` : ''}
            </span>
            <IconButton
              label="Önceki"
              icon="chevronUp"
              onClick={() => setSearch((s) => ({ ...s, idx: s.idx > 0 ? s.idx - 1 : Math.max(0, matches.length - 1) }))}
              size={36}
            />
            <IconButton
              label="Sonraki"
              icon="chevronDown"
              onClick={() => setSearch((s) => ({ ...s, idx: matches.length ? (s.idx + 1) % matches.length : 0 }))}
              size={36}
            />
            <IconButton label="Aramayı kapat" icon="x" onClick={() => setSearch({ open: false, q: '', idx: 0 })} size={36} />
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => (isGroup ? setGroupInfoOpen(true) : setProfileOpen(true))}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                border: 'none',
                background: 'none',
                color: 'inherit',
                textAlign: 'left',
                padding: 0,
              }}
            >
              <Avatar
                name={name}
                uid={isGroup ? chatId : otherUid}
                color={isGroup ? undefined : other?.color}
                photoURL={isGroup ? chat?.photoURL : other?.photoURL}
                size={42}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 15.5,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {name}
                </span>
                <span
                  aria-live="polite"
                  style={{
                    display: 'block',
                    fontSize: 12,
                    opacity: 0.85,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {subtitle}
                </span>
              </span>
            </button>
            {muted ? <Icon name="bellOff" size={17} style={{ opacity: 0.8 }} /> : null}
            <IconButton label="Sohbet menüsü" icon="more" onClick={() => setHeaderMenu(true)} size={40} />
          </>
        )}
      </div>

      {/* mesajlar */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="cx-scroll"
        style={{ flex: 1, overflowY: 'auto', padding: '14px clamp(12px,7%,90px)', display: 'flex', flexDirection: 'column', gap: 4 }}
      >
        {!hasMore || !amMember ? (
          <div
            style={{
              alignSelf: 'center',
              background: t.infoPill,
              color: t.infoPillText,
              padding: '8px 16px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 600,
              margin: '6px 0 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textAlign: 'center',
              maxWidth: 340,
              lineHeight: 1.45,
              boxShadow: '0 1px 3px rgba(0,0,0,.08)',
            }}
          >
            <Icon name="lock" size={16} />
            Bağlantın şifreli (HTTPS).
          </div>
        ) : (
          <div style={{ alignSelf: 'center', padding: 10, color: t.textSecondary, fontSize: 12.5 }}>
            {loading ? <span className="cx-spinner" aria-label="Eski mesajlar yükleniyor" /> : 'Eski mesajlar için yukarı kaydır'}
          </div>
        )}
        {term && hasMore ? (
          <button
            type="button"
            onClick={() => setLimit((l) => l + 200)}
            className="cx-tap"
            style={{
              alignSelf: 'center',
              border: 'none',
              borderRadius: 14,
              padding: '6px 14px',
              background: t.bg,
              color: t.accentText,
              fontWeight: 700,
              fontSize: 12.5,
              marginBottom: 8,
            }}
          >
            Daha eski mesajlarda da ara
          </button>
        ) : null}
        {loading && !messages.length ? (
          <div style={{ alignSelf: 'center', color: t.textSecondary, padding: 20 }}>
            <span className="cx-spinner" aria-label="Yükleniyor" />
          </div>
        ) : null}
        {!loading && amMember && messages.length === 0 && !uploads.length ? (
          <div
            style={{
              alignSelf: 'center',
              background: t.systemPill,
              color: t.textSecondary,
              padding: '6px 14px',
              borderRadius: 13,
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            Sohbet başladı. İlk mesajı sen yaz 👋
          </div>
        ) : null}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const ts = Number(m.ts) || Date.now();
          const newDay = !prev || dayDiff(Number(prev.ts) || Date.now(), ts) !== 0;
          const mine = m.from === myUid && !m.system;
          const reply = m.replyTo ? byId.get(m.replyTo) || extraReplies[m.replyTo] || null : null;
          return (
            <Fragment key={m.id}>
              {newDay ? (
                <div
                  style={{
                    alignSelf: 'center',
                    background: t.systemPill,
                    color: t.textSecondary,
                    padding: '5px 12px',
                    borderRadius: 9,
                    fontSize: 12,
                    fontWeight: 600,
                    margin: '8px 0',
                    boxShadow: '0 1px 2px rgba(0,0,0,.06)',
                  }}
                >
                  {formatDaySeparator(ts)}
                </div>
              ) : null}
              <MessageBubble
                t={t}
                msg={m}
                mine={mine}
                myUid={myUid}
                isGroup={isGroup}
                sender={profiles[m.from]}
                showSender={!prev || prev.from !== m.from || prev.system || newDay}
                status={mine ? statusOf(m) : null}
                reply={reply}
                replySender={reply ? profiles[reply.from] : null}
                onMenu={setMenuFor}
                onOpenImage={setViewer}
                onJump={jumpTo}
                onReactionClick={onReactionClick}
                searchTerm={term}
                focused={focusId === m.id}
              />
            </Fragment>
          );
        })}
        {uploads.map((u) => (
          <div
            key={u.id}
            style={{
              alignSelf: 'flex-end',
              maxWidth: '80%',
              background: t.bubbleSent,
              color: t.bubbleText,
              borderRadius: '12px 12px 4px 12px',
              padding: '8px 10px',
              boxShadow: '0 1px 1.5px rgba(0,0,0,.13)',
              minWidth: 220,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon
                name={(u.type || '').startsWith('audio/') ? 'mic' : (u.type || '').startsWith('image/') ? 'image' : 'file'}
                size={22}
                color={t.accent}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {(u.type || '').startsWith('audio/') ? 'Sesli mesaj' : u.name}
                </div>
                <div style={{ fontSize: 11.5, color: t.timeColor }}>
                  {Math.round(u.progress * 100)}% · {formatSize(u.size)}
                </div>
              </div>
              <IconButton
                label="Yüklemeyi iptal et"
                icon="x"
                onClick={() => u.handle.cancel()}
                size={30}
                iconSize={16}
                color={t.textSecondary}
              />
            </div>
            <div
              style={{ height: 4, borderRadius: 2, background: 'rgba(128,128,128,.25)', marginTop: 8, overflow: 'hidden' }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(u.progress * 100)}
            >
              <div style={{ height: '100%', width: `${Math.max(3, u.progress * 100)}%`, background: t.accent, transition: 'width .2s' }} />
            </div>
          </div>
        ))}
        {typingOthers.length ? (
          <div
            aria-label="Yazıyor"
            style={{
              alignSelf: 'flex-start',
              background: t.bubbleRecv,
              padding: '12px 15px',
              borderRadius: '12px 12px 12px 4px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              boxShadow: '0 1px 1.5px rgba(0,0,0,.13)',
            }}
          >
            <span className="cx-typing-dot" />
            <span className="cx-typing-dot" />
            <span className="cx-typing-dot" />
          </div>
        ) : null}
      </div>

      {newCount > 0 && !atBottom ? (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="cx-tap"
          style={{
            position: 'absolute',
            right: 18,
            bottom: 92,
            zIndex: 4,
            border: 'none',
            borderRadius: 18,
            background: t.accent,
            color: '#fff',
            padding: '8px 14px',
            fontWeight: 700,
            fontSize: 13,
            boxShadow: '0 6px 18px rgba(0,0,0,.25)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          Yeni mesaj <Icon name="arrowDown" size={15} />
        </button>
      ) : null}

      {blockedByMe && !disabledNotice ? (
        <div
          style={{
            padding: '12px 18px calc(12px + env(safe-area-inset-bottom))',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            justifyContent: 'center',
            background: t.bg,
            color: t.textSecondary,
            fontSize: 13.5,
            flexWrap: 'wrap',
          }}
        >
          Bu kişiyi engelledin.
          <button
            type="button"
            onClick={() => setBlocked(myUid, otherUid, false).catch((err) => toast(friendlyError(err, 'engel'), 'no'))}
            className="cx-tap"
            style={{ border: 'none', borderRadius: 10, padding: '7px 14px', background: t.accent, color: '#fff', fontWeight: 700 }}
          >
            Engeli kaldır
          </button>
        </div>
      ) : (
        <Composer
          t={t}
          chatId={chatId}
          disabledNotice={disabledNotice}
          replyTo={replyTo}
          replyName={replyName}
          editing={editing}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
          onSend={send}
          onSaveEdit={(text) => {
            const msg = editing;
            setEditing(null);
            if (!canEdit(msg, myUid)) return toast('Mesajlar yalnızca 15 dakika içinde düzenlenebilir.', 'no');
            if (text.trim() === msg.text) return undefined;
            editMessage(chatId, msg.id, text).catch((err) => toast(friendlyError(err, 'düzenleme'), 'no'));
            return undefined;
          }}
          onFiles={(files) => files.forEach((f) => startUpload(f))}
          onVoice={({ file, duration }) => startUpload(file, { duration: Math.round(duration * 10) / 10 })}
          onTyping={onTyping}
          toast={toast}
        />
      )}

      {menuFor ? (
        <ActionSheet
          t={t}
          title={menuFor._deleteChoice ? 'Mesaj silinsin mi?' : undefined}
          header={reactionRow(menuFor)}
          items={menuItems(menuFor)}
          onClose={() => setMenuFor(null)}
        />
      ) : null}
      {headerMenu ? <ActionSheet t={t} items={headerItems} onClose={() => setHeaderMenu(false)} /> : null}
      {muteMenu ? (
        <ActionSheet
          t={t}
          title="Bildirimleri sessize al"
          items={muteItems((until) => onMute(chatId, until))}
          onClose={() => setMuteMenu(false)}
        />
      ) : null}
      <Suspense fallback={null}>
        {viewer ? <ImageViewer attachment={viewer} onClose={() => setViewer(null)} /> : null}
        {forwarding ? (
          <ForwardDialog
            t={t}
            me={me}
            message={forwarding}
            fromChatId={chatId}
            targets={forwardTargets}
            onClose={() => setForwarding(null)}
            onDone={(n, firstChat) => {
              setForwarding(null);
              toast(n > 1 ? `${n} sohbete iletildi` : 'İletildi');
              if (n === 1 && firstChat && firstChat !== chatId) onOpenChat(firstChat);
            }}
            toast={toast}
          />
        ) : null}
        {reporting ? (
          <ReportDialog
            t={t}
            me={me}
            chatId={chatId}
            {...reporting}
            targetName={profiles[reporting.target]?.name}
            onClose={() => setReporting(null)}
            toast={toast}
          />
        ) : null}
        {profileOpen && otherUid ? (
          <ProfileSheet t={t} uid={otherUid} profile={other} presence={presence} onClose={() => setProfileOpen(false)} />
        ) : null}
        {groupInfoOpen && isGroup ? (
          <GroupInfo
            t={t}
            me={me}
            chatId={chatId}
            chat={chat}
            profiles={profiles}
            contacts={forwardTargets.filter((x) => x.type === 'direct')}
            onClose={() => setGroupInfoOpen(false)}
            toast={toast}
            onLeft={onBack}
          />
        ) : null}
      </Suspense>
    </div>
  );
}
