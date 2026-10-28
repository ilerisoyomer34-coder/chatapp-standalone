import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { onDisconnect, ref, set } from 'firebase/database';
import { db } from '../firebase.js';
import { useDbValue, useMessages } from '../hooks/data.js';
import { loadAttachmentData, markChatRead, MAX_INLINE_ATTACHMENT, MAX_TEXT, newMessageId, sendMessage } from '../lib/api.js';
import { friendlyError } from '../lib/errors.js';
import { dayDiff, formatDaySeparator, formatSize, formatTime } from '../lib/format.js';
import { Icon } from '../lib/icons.jsx';
import { Avatar, IconButton } from './ui.jsx';

const EMOJIS = '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🤢 🤮 🤧 😷 🤒 🤕 👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👋 🤚 🖐️ ✋ 👏 🙌 👐 🤲 🤝 🙏 💪 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 🔥 ⭐ 🎉 🎊 ✅ ❌ ⚽ 🏀 🎮 🚗 ✈️ 🌍 ☀️ 🌙 🍎 🍕 🎂 ☕'.split(' ');
const TYPING_IDLE_MS = 4000;
const MAX_ROWS = 5;
const LINE_HEIGHT = 21;

const finePointer = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: fine)').matches;

function Attachment({ t, chatId, msg }) {
  const a = msg.attachment;
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const isImage = (a.type || '').startsWith('image/');

  const load = async () => {
    if (data) return data;
    setBusy(true);
    try {
      const d = await loadAttachmentData(chatId, msg.id);
      setData(d);
      return d;
    } catch (err) {
      console.error('[ChatApp] ek yüklenemedi', err);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    const d = await load();
    if (!d) return;
    const link = document.createElement('a');
    link.href = d;
    link.download = a.name || 'dosya';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  if (isImage && data) {
    return (
      <button type="button" onClick={download} title="İndir" style={{ display: 'block', marginTop: 4, padding: 0, border: 'none', background: 'none', borderRadius: 9, overflow: 'hidden', maxWidth: 260 }}>
        <img src={data} alt={a.name} style={{ display: 'block', maxWidth: '100%', maxHeight: 320, objectFit: 'cover' }} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={isImage ? load : download}
      className="cx-tap"
      style={{ marginTop: 6, padding: '9px 10px', borderRadius: 9, background: 'rgba(128,128,128,.13)', display: 'flex', alignItems: 'center', gap: 9, color: 'inherit', border: 'none', maxWidth: 280, width: '100%', textAlign: 'left' }}
    >
      {busy ? <span className="cx-spinner" aria-hidden="true" /> : <Icon name={isImage ? 'download' : 'paperclip'} size={22} />}
      <span style={{ minWidth: 0 }}>
        <b style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 14 }}>{isImage ? 'Fotoğrafı göster' : a.name}</b>
        <small style={{ opacity: 0.72 }}>{isImage ? `${a.name} · ` : ''}{formatSize(a.size)}</small>
      </span>
    </button>
  );
}

function StatusTick({ t, status }) {
  if (status === 'pending') return <Icon name="clock" size={13} color={t.timeColor} />;
  if (status === 'read') return <Icon name="checkCheck" size={16} color={t.readTick} />;
  if (status === 'delivered') return <Icon name="checkCheck" size={16} color={t.timeColor} />;
  return <Icon name="check" size={15} color={t.timeColor} />;
}

const STATUS_LABEL = { pending: 'Bekliyor', sent: 'Gönderildi', delivered: 'İletildi', read: 'Okundu' };

export default function ChatView({ t, me, chatId, other, otherUid, userChat, desktop, onBack, toast }) {
  const { list: messages, loading } = useMessages(chatId);
  const receipts = useDbValue(`receipts/${chatId}`).value || {};
  const typingNode = useDbValue(`typing/${chatId}`).value || {};

  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [pending, setPending] = useState(() => new Set());
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);

  const scrollerRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const typingRef = useRef({ timer: null, active: false });
  const lastIdRef = useRef(null);
  const sentByMeRef = useRef(false);

  const myUid = me.uid;
  const typingRefPath = `typing/${chatId}/${myUid}`;

  // ── yazıyor bayrağı: onDisconnect ile temizlenir, 4 sn işlem yoksa kaldırılır ──
  const stopTyping = useCallback(() => {
    clearTimeout(typingRef.current.timer);
    if (typingRef.current.active) {
      typingRef.current.active = false;
      set(ref(db, typingRefPath), null).catch(() => {});
    }
  }, [typingRefPath]);

  const touchTyping = useCallback(() => {
    clearTimeout(typingRef.current.timer);
    if (!typingRef.current.active) {
      typingRef.current.active = true;
      const r = ref(db, typingRefPath);
      onDisconnect(r).remove().catch(() => {});
      set(r, true).catch(() => {});
    }
    typingRef.current.timer = setTimeout(stopTyping, TYPING_IDLE_MS);
  }, [typingRefPath, stopTyping]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') stopTyping();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      stopTyping();
    };
  }, [stopTyping]);

  // Sohbet değişince taslak ve durum sıfırlanır.
  useEffect(() => {
    setDraft('');
    setAttachment(null);
    setEmojiOpen(false);
    setNewCount(0);
    setAtBottom(true);
    lastIdRef.current = null;
  }, [chatId]);

  // ── okundu bilgisi ──
  const myRead = Number(receipts[myUid]?.read) || 0;
  const otherRead = Number(receipts[otherUid]?.read) || 0;
  const otherDelivered = Math.max(Number(receipts[otherUid]?.delivered) || 0, otherRead);
  const lastIncomingTs = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].from !== myUid) return Number(messages[i].ts) || 0;
    return 0;
  }, [messages, myUid]);
  const unread = userChat ? userChat.unread : 0;
  const markingRef = useRef(0);

  useEffect(() => {
    let timer = null;
    const tryMark = () => {
      clearTimeout(timer);
      if (document.visibilityState !== 'visible') return;
      if (!(unread > 0 || lastIncomingTs > myRead)) return;
      // Art arda gelen mesajlarda yazmaları seyrelt ama son mesajı da mutlaka işaretle.
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
  }, [chatId, myUid, unread, lastIncomingTs, myRead]);

  // ── kaydırma: yalnızca en alttaysa veya kendi mesajımızsa en alta in ──
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
  };

  useLayoutEffect(() => {
    if (loading) return;
    const last = messages[messages.length - 1];
    const lastId = last ? last.id : null;
    if (lastIdRef.current === null) {
      scrollToBottom(false);
    } else if (lastId && lastId !== lastIdRef.current) {
      if (atBottom || (last.from === myUid && sentByMeRef.current)) scrollToBottom(true);
      else if (last.from !== myUid) setNewCount((n) => n + 1);
    }
    sentByMeRef.current = false;
    lastIdRef.current = lastId || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading]);

  const otherTyping = !!(otherUid && typingNode[otherUid]);
  useEffect(() => {
    if (otherTyping && atBottom) scrollToBottom(true);
  }, [otherTyping, atBottom, scrollToBottom]);

  // ── mesaj kutusu ──
  const autoGrow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS * LINE_HEIGHT + 20)}px`;
  };
  useLayoutEffect(autoGrow, [draft]);

  const onDraft = (e) => {
    const v = e.target.value.slice(0, MAX_TEXT);
    setDraft(v);
    if (v.trim()) touchTyping();
    else stopTyping();
  };

  const canSend = !!(draft.trim() || attachment);

  const send = () => {
    if (!canSend) return;
    const id = newMessageId(chatId);
    const payload = { id, text: draft, attachment };
    setDraft('');
    setAttachment(null);
    setEmojiOpen(false);
    stopTyping();
    sentByMeRef.current = true;
    setPending((p) => new Set(p).add(id));
    sendMessage(myUid, chatId, payload)
      .catch((err) => {
        friendlyError(err, 'mesaj gönderme');
        toast('Mesaj gönderilemedi. Yeniden dene.', 'no');
      })
      .finally(() =>
        setPending((p) => {
          const n = new Set(p);
          n.delete(id);
          return n;
        })
      );
    if (finePointer()) inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    // Masaüstünde Enter gönderir, Shift+Enter yeni satır; mobilde Enter yeni satır.
    if (finePointer() && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_INLINE_ATTACHMENT) {
      toast('Dosya en fazla 5 MB olabilir.', 'no');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAttachment({ name: file.name, type: file.type || 'application/octet-stream', size: file.size, data: reader.result });
    reader.onerror = () => toast('Dosya okunamadı.', 'no');
    reader.readAsDataURL(file);
  };

  const statusOf = (m) => {
    if (pending.has(m.id)) return 'pending';
    const ts = Number(m.ts) || 0;
    if (otherRead >= ts) return 'read';
    if (otherDelivered >= ts) return 'delivered';
    return 'sent';
  };

  const name = other?.name || 'Kullanıcı';
  const otherDisabled = other?.disabled === true;

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', background: t.chatBg, position: 'relative' }}>
      {/* başlık */}
      <div style={{ minHeight: 62, paddingTop: 'env(safe-area-inset-top)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 12, paddingRight: 12, background: t.appbarBg, color: t.appbarText, zIndex: 3 }}>
        {!desktop ? <IconButton label="Geri" icon="back" onClick={onBack} size={38} iconSize={23} /> : null}
        <Avatar name={name} uid={otherUid} color={other?.color} photoURL={other?.photoURL} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          <div style={{ fontSize: 12, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} aria-live="polite">
            {otherTyping ? 'yazıyor…' : other?.username ? `@${other.username}` : ''}
          </div>
        </div>
      </div>

      {/* mesajlar */}
      <div ref={scrollerRef} onScroll={onScroll} className="cx-scroll" style={{ flex: 1, overflowY: 'auto', padding: '18px clamp(14px,8%,90px)', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ alignSelf: 'center', background: t.infoPill, color: t.infoPillText, padding: '8px 16px', borderRadius: 12, fontSize: 12, fontWeight: 600, margin: '6px 0 14px', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'center', maxWidth: 340, lineHeight: 1.45, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
          <Icon name="lock" size={16} />
          Bağlantın şifreli (HTTPS).
        </div>
        {loading ? (
          <div style={{ alignSelf: 'center', color: t.textSecondary, padding: 20 }}>
            <span className="cx-spinner" aria-label="Yükleniyor" />
          </div>
        ) : null}
        {!loading && messages.length === 0 ? (
          <div style={{ alignSelf: 'center', background: t.systemPill, color: t.textSecondary, padding: '6px 14px', borderRadius: 13, fontSize: 12.5, fontWeight: 500 }}>
            Sohbet başladı. İlk mesajı sen yaz 👋
          </div>
        ) : null}
        {messages.map((m, i) => {
          const mine = m.from === myUid;
          const prev = messages[i - 1];
          const ts = Number(m.ts) || Date.now();
          const newDay = !prev || dayDiff(Number(prev.ts) || Date.now(), ts) !== 0;
          const status = mine ? statusOf(m) : null;
          return (
            <Fragment key={m.id}>
              {newDay ? (
                <div style={{ alignSelf: 'center', background: t.systemPill, color: t.textSecondary, padding: '5px 12px', borderRadius: 9, fontSize: 12, fontWeight: 600, margin: '8px 0', boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
                  {formatDaySeparator(ts)}
                </div>
              ) : null}
              <div
                style={{
                  maxWidth: '78%',
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  background: mine ? t.bubbleSent : t.bubbleRecv,
                  color: t.bubbleText,
                  padding: '7px 11px 6px',
                  borderRadius: mine ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  fontSize: 14.5,
                  lineHeight: 1.42,
                  boxShadow: '0 1px 1.5px rgba(0,0,0,.13)',
                }}
              >
                {m.deleted ? (
                  <span style={{ fontStyle: 'italic', opacity: 0.7 }}>Bu mesaj silindi</span>
                ) : (
                  <>
                    {m.text ? <span style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{m.text}</span> : null}
                    {m.attachment ? <Attachment t={t} chatId={chatId} msg={m} /> : null}
                  </>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, float: 'right', margin: '6px 0 -2px 10px', transform: 'translateY(4px)' }}>
                  {m.editedAt ? <span style={{ fontSize: 10.5, color: t.timeColor }}>düzenlendi</span> : null}
                  <span style={{ fontSize: 10.5, color: t.timeColor }}>{formatTime(ts)}</span>
                  {mine ? (
                    <span title={STATUS_LABEL[status]} aria-label={STATUS_LABEL[status]}>
                      <StatusTick t={t} status={status} />
                    </span>
                  ) : null}
                </span>
              </div>
            </Fragment>
          );
        })}
        {otherTyping ? (
          <div aria-label="Yazıyor" style={{ alignSelf: 'flex-start', background: t.bubbleRecv, padding: '12px 15px', borderRadius: '12px 12px 12px 4px', display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 1px 1.5px rgba(0,0,0,.13)' }}>
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
          style={{ position: 'absolute', right: 18, bottom: 92, zIndex: 4, border: 'none', borderRadius: 18, background: t.accent, color: '#fff', padding: '8px 14px', fontWeight: 700, fontSize: 13, boxShadow: '0 6px 18px rgba(0,0,0,.25)', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          Yeni mesaj <Icon name="arrowDown" size={15} />
        </button>
      ) : null}

      {/* mesaj kutusu */}
      {otherDisabled ? (
        <div style={{ padding: '14px 18px calc(14px + env(safe-area-inset-bottom))', textAlign: 'center', color: t.textSecondary, fontSize: 13.5, background: t.bg }}>
          Bu hesap devre dışı bırakıldı; mesaj gönderilemez.
        </div>
      ) : (
        <div style={{ flexShrink: 0, padding: '9px clamp(10px,6%,70px) calc(12px + env(safe-area-inset-bottom))', background: t.chatBg, display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
          {emojiOpen ? (
            <div className="cx-scroll" style={{ position: 'absolute', left: 'clamp(10px,6%,70px)', bottom: 'calc(100% - 4px)', width: 'min(340px, calc(100% - 20px))', maxHeight: 230, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3, padding: 10, background: t.bg, border: `1px solid ${t.divider}`, borderRadius: 16, boxShadow: '0 12px 38px rgba(0,0,0,.24)', zIndex: 8 }}>
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="cx-tap"
                  onClick={() => {
                    setDraft((d) => (d + e).slice(0, MAX_TEXT));
                    inputRef.current?.focus();
                  }}
                  style={{ height: 36, border: 'none', borderRadius: 8, background: 'transparent', fontSize: 23, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {e}
                </button>
              ))}
            </div>
          ) : null}
          {attachment ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', background: t.bg, border: `1px solid ${t.divider}`, borderRadius: 12, color: t.textPrimary }}>
              <Icon name="paperclip" size={20} color={t.accent} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {attachment.name} · {formatSize(attachment.size)}
              </span>
              <IconButton label="Dosyayı kaldır" icon="x" onClick={() => setAttachment(null)} size={30} iconSize={16} color={t.textSecondary} style={{ background: t.surface }} />
            </div>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 4, background: t.bg, borderRadius: 24, padding: '4px 6px', minHeight: 48, boxShadow: '0 1px 3px rgba(0,0,0,.08)', minWidth: 0 }}>
              <IconButton label="Emoji seç" icon="smile" onClick={() => setEmojiOpen((o) => !o)} size={40} iconSize={22} color={emojiOpen ? t.accent : t.textSecondary} />
              <textarea
                ref={inputRef}
                value={draft}
                onChange={onDraft}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Mesaj yaz…"
                aria-label="Mesaj"
                enterKeyHint={finePointer() ? 'send' : 'enter'}
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, lineHeight: `${LINE_HEIGHT}px`, color: t.textPrimary, resize: 'none', padding: '9px 2px', maxHeight: MAX_ROWS * LINE_HEIGHT + 20, overflowY: 'auto' }}
              />
              <input ref={fileRef} type="file" onChange={onFile} style={{ display: 'none' }} />
              <IconButton
                label="Dosya ekle"
                icon="paperclip"
                onClick={() => {
                  setEmojiOpen(false);
                  fileRef.current?.click();
                }}
                size={40}
                iconSize={22}
                color={t.textSecondary}
              />
            </div>
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              className="cx-tap"
              aria-label="Gönder"
              title="Gönder"
              style={{ width: 48, height: 48, borderRadius: '50%', border: 'none', background: canSend ? t.accent : t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: canSend ? '#fff' : t.textSecondary, flexShrink: 0, boxShadow: canSend ? `0 4px 12px ${t.accentShadow}` : 'none', opacity: canSend ? 1 : 0.75 }}
            >
              <Icon name="send" size={22} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
