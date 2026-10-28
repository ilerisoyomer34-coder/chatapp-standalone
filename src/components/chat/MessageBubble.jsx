import { memo, useRef } from 'react';
import { colorFor, formatTime, messagePreview } from '../../lib/format.js';
import { Icon } from '../../lib/icons.jsx';
import Attachment from './Attachment.jsx';

const LONG_PRESS_MS = 450;

function Highlight({ text, term }) {
  if (!term) return text;
  const lower = text.toLocaleLowerCase('tr-TR');
  const needle = term.toLocaleLowerCase('tr-TR');
  const parts = [];
  let i = 0;
  let k = 0;
  while (needle && (k = lower.indexOf(needle, i)) !== -1) {
    if (k > i) parts.push(text.slice(i, k));
    parts.push(
      <mark key={k} style={{ background: '#FFD86B', color: '#111', borderRadius: 3 }}>
        {text.slice(k, k + needle.length)}
      </mark>
    );
    i = k + needle.length;
  }
  parts.push(text.slice(i));
  return parts;
}

function StatusTick({ t, status }) {
  if (status === 'pending') return <Icon name="clock" size={13} color={t.timeColor} />;
  if (status === 'read') return <Icon name="checkCheck" size={16} color={t.readTick} />;
  if (status === 'delivered') return <Icon name="checkCheck" size={16} color={t.timeColor} />;
  return <Icon name="check" size={15} color={t.timeColor} />;
}

const STATUS_LABEL = { pending: 'Bekliyor', sent: 'Gönderildi', delivered: 'İletildi', read: 'Okundu' };

function useLongPress(onLong) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  const clear = () => {
    clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown(e) {
      if (e.pointerType === 'mouse') return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        if (navigator.vibrate) navigator.vibrate(15);
        onLong();
      }, LONG_PRESS_MS);
    },
    onPointerMove(e) {
      if (!timer.current || !start.current) return;
      if (Math.abs(e.clientX - start.current.x) > 10 || Math.abs(e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onContextMenu(e) {
      e.preventDefault();
      if (!fired.current) onLong();
    },
  };
}

function MessageBubble({
  t,
  msg,
  mine,
  isGroup,
  sender,
  showSender,
  status,
  reply,
  replySender,
  onMenu,
  onOpenImage,
  onJump,
  onReactionClick,
  searchTerm,
  focused,
  myUid,
}) {
  const press = useLongPress(() => onMenu(msg));
  if (msg.system) {
    return (
      <div
        id={`msg-${msg.id}`}
        style={{
          alignSelf: 'center',
          background: t.systemPill,
          color: t.textSecondary,
          padding: '5px 12px',
          borderRadius: 9,
          fontSize: 12.5,
          fontWeight: 500,
          margin: '6px 0',
          maxWidth: '85%',
          textAlign: 'center',
          boxShadow: '0 1px 2px rgba(0,0,0,.06)',
        }}
      >
        {msg.text}
      </div>
    );
  }
  const reactions = msg.reactions ? Object.entries(msg.reactions) : [];
  const counts = {};
  for (const [, e] of reactions) counts[e] = (counts[e] || 0) + 1;
  const mineReaction = msg.reactions ? msg.reactions[myUid] : null;
  const ts = Number(msg.ts) || Date.now();

  return (
    <div
      id={`msg-${msg.id}`}
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '80%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: mine ? 'flex-end' : 'flex-start',
        marginBottom: reactions.length ? 10 : 0,
      }}
    >
      <div
        {...press}
        role="group"
        aria-label={mine ? 'Gönderdiğin mesaj' : `${sender?.name || 'Kullanıcı'} mesajı`}
        style={{
          position: 'relative',
          background: mine ? t.bubbleSent : t.bubbleRecv,
          color: t.bubbleText,
          padding: msg.attachment && !msg.text ? '4px 4px 6px' : '6px 10px 6px',
          borderRadius: mine ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
          fontSize: 14.5,
          lineHeight: 1.42,
          boxShadow: focused ? `0 0 0 2px ${t.accent}` : '0 1px 1.5px rgba(0,0,0,.13)',
          WebkitUserSelect: 'text',
          userSelect: 'text',
          WebkitTouchCallout: 'none',
          transition: 'box-shadow .3s',
        }}
      >
        <button
          type="button"
          aria-label="Mesaj seçenekleri"
          onClick={() => onMenu(msg)}
          className="cx-msg-more"
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 26,
            height: 22,
            border: 'none',
            borderRadius: 8,
            background: mine ? t.bubbleSent : t.bubbleRecv,
            color: t.textSecondary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
          }}
        >
          <Icon name="chevronDown" size={16} />
        </button>
        {isGroup && !mine && showSender ? (
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: colorFor(msg.from),
              marginBottom: 2,
              padding: msg.attachment && !msg.text ? '2px 6px 0' : 0,
            }}
          >
            {sender?.name || 'Silinmiş hesap'}
          </div>
        ) : null}
        {msg.forwarded && !msg.deleted ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              fontStyle: 'italic',
              color: t.textSecondary,
              marginBottom: 2,
            }}
          >
            <Icon name="forward" size={13} /> İletildi
          </div>
        ) : null}
        {msg.replyTo && !msg.deleted ? (
          <button
            type="button"
            onClick={() => reply && onJump(reply.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              border: 'none',
              borderLeft: `4px solid ${reply ? colorFor(reply.from) : t.divider}`,
              borderRadius: 7,
              background: 'rgba(128,128,128,.14)',
              color: 'inherit',
              padding: '5px 8px',
              margin: '2px 0 5px',
              cursor: reply ? 'pointer' : 'default',
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 700, color: reply ? colorFor(reply.from) : t.textSecondary }}>
              {reply ? (reply.from === myUid ? 'Sen' : replySender?.name || 'Kullanıcı') : ''}
            </div>
            <div
              style={{
                fontSize: 13,
                color: t.textSecondary,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 260,
              }}
            >
              {reply ? messagePreview(reply) || '…' : 'Mesaj bulunamadı'}
            </div>
          </button>
        ) : null}
        {msg.deleted ? (
          <span style={{ fontStyle: 'italic', opacity: 0.72, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="slash" size={14} /> Bu mesaj silindi
          </span>
        ) : (
          <>
            {msg.attachment ? <Attachment t={t} attachment={msg.attachment} onOpenImage={onOpenImage} /> : null}
            {msg.text ? (
              <span
                style={{
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                  display: msg.attachment ? 'block' : 'inline',
                  padding: msg.attachment ? '4px 6px 0' : 0,
                }}
              >
                <Highlight text={msg.text} term={searchTerm} />
              </span>
            ) : null}
          </>
        )}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            float: 'right',
            margin: '6px 0 -2px 10px',
            transform: 'translateY(4px)',
            padding: msg.attachment && !msg.text ? '0 6px' : 0,
          }}
        >
          {msg.editedAt && !msg.deleted ? (
            <span style={{ fontSize: 10.5, color: t.timeColor, fontStyle: 'italic' }}>düzenlendi</span>
          ) : null}
          <span style={{ fontSize: 10.5, color: t.timeColor }}>{formatTime(ts)}</span>
          {mine && !msg.deleted ? (
            <span title={STATUS_LABEL[status]} aria-label={STATUS_LABEL[status]}>
              <StatusTick t={t} status={status} />
            </span>
          ) : null}
        </span>
      </div>
      {reactions.length ? (
        <button
          type="button"
          onClick={() => onReactionClick(msg, mineReaction)}
          aria-label={`Tepkiler: ${Object.entries(counts)
            .map(([e, n]) => `${e} ${n}`)
            .join(', ')}`}
          className="cx-tap"
          style={{
            marginTop: -8,
            marginRight: mine ? 8 : 0,
            marginLeft: mine ? 0 : 8,
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: '2px 7px',
            borderRadius: 12,
            border: `1px solid ${t.divider}`,
            background: t.bg,
            color: t.textPrimary,
            fontSize: 13,
            boxShadow: '0 1px 3px rgba(0,0,0,.12)',
          }}
        >
          {Object.keys(counts).slice(0, 4).join('')}
          {reactions.length > 1 ? <span style={{ fontSize: 11.5, color: t.textSecondary, marginLeft: 3 }}>{reactions.length}</span> : null}
        </button>
      ) : null}
    </div>
  );
}

export default memo(MessageBubble);
