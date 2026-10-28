import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MAX_TEXT } from '../../lib/api.js';
import { colorFor, formatDuration, messagePreview } from '../../lib/format.js';
import { Icon } from '../../lib/icons.jsx';
import { canRecord, startRecording } from '../../lib/recorder.js';
import { IconButton } from '../ui.jsx';

const EMOJIS =
  '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🤢 🤮 🤧 😷 🤒 🤕 👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👋 🤚 🖐️ ✋ 👏 🙌 👐 🤲 🤝 🙏 💪 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 🔥 ⭐ 🎉 🎊 ✅ ❌ ⚽ 🏀 🎮 🚗 ✈️ 🌍 ☀️ 🌙 🍎 🍕 🎂 ☕'.split(
    ' '
  );
const MAX_ROWS = 5;
const LINE_HEIGHT = 21;
const CANCEL_SLIDE_PX = 90;
const MIN_VOICE_SECONDS = 0.8;

const finePointer = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: fine)').matches;

function ContextBar({ t, icon, color, title, text, onClose }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px 8px 12px',
        background: t.bg,
        borderRadius: 12,
        borderLeft: `4px solid ${color}`,
      }}
    >
      <Icon name={icon} size={18} color={color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color }}>{title}</div>
        <div style={{ fontSize: 13, color: t.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {text}
        </div>
      </div>
      <IconButton label="Vazgeç" icon="x" onClick={onClose} size={30} iconSize={16} color={t.textSecondary} />
    </div>
  );
}

export default function Composer({
  t,
  chatId,
  disabledNotice,
  replyTo,
  replyName,
  editing,
  onCancelReply,
  onCancelEdit,
  onSend,
  onSaveEdit,
  onFiles,
  onVoice,
  onTyping,
  toast,
}) {
  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [rec, setRec] = useState(null); // { handle, startX, offset, seconds }
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const pressingRef = useRef(false);
  recRef.current = rec;

  useEffect(() => {
    setDraft('');
    setEmojiOpen(false);
  }, [chatId]);

  // Düzenleme modunda mevcut metni getir.
  useEffect(() => {
    if (editing) {
      setDraft(editing.text || '');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing]);

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS * LINE_HEIGHT + 20)}px`;
  }, [draft]);

  const recHandle = rec ? rec.handle : null;
  useEffect(() => {
    if (!recHandle) return undefined;
    const id = setInterval(() => setRec((r) => (r ? { ...r, seconds: (performance.now() - r.handle.started) / 1000 } : r)), 200);
    return () => clearInterval(id);
  }, [recHandle]);

  if (disabledNotice) {
    return (
      <div
        style={{
          padding: '14px 18px calc(14px + env(safe-area-inset-bottom))',
          textAlign: 'center',
          color: t.textSecondary,
          fontSize: 13.5,
          background: t.bg,
        }}
      >
        {disabledNotice}
      </div>
    );
  }

  const hasText = !!draft.trim();

  const submit = () => {
    if (!hasText) return;
    if (editing) onSaveEdit(draft);
    else onSend(draft);
    setDraft('');
    setEmojiOpen(false);
    onTyping(false);
    if (finePointer()) inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && (editing || replyTo)) {
      if (editing) onCancelEdit();
      else onCancelReply();
      return;
    }
    if (e.key !== 'Enter' || e.isComposing) return;
    // Masaüstünde Enter gönderir, Shift+Enter yeni satır; mobilde Enter yeni satır.
    if (finePointer() && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // ── sesli mesaj: basılı tut, sola kaydırarak iptal ──
  const beginRecording = async (e) => {
    if (!canRecord()) {
      toast('Bu tarayıcı sesli mesaj kaydını desteklemiyor.', 'no');
      return;
    }
    const startX = e.clientX;
    pressingRef.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    try {
      const handle = await startRecording();
      // İzin penceresi beklerken parmak kaldırıldıysa kaydı başlatma.
      if (!pressingRef.current) {
        handle.cancel();
        toast('Kaydetmek için mikrofon düğmesini basılı tut.', 'no');
        return;
      }
      setRec({ handle, startX, offset: 0, seconds: 0 });
    } catch (err) {
      console.warn('[ChatApp] mikrofon', err);
      toast(err && err.name === 'NotAllowedError' ? 'Mikrofon izni verilmedi.' : 'Kayıt başlatılamadı.', 'no');
    }
  };

  const moveRecording = (e) => {
    const r = recRef.current;
    if (!r) return;
    const offset = Math.min(0, e.clientX - r.startX);
    if (offset < -CANCEL_SLIDE_PX) {
      r.handle.cancel();
      setRec(null);
      toast('Kayıt iptal edildi', 'no');
      return;
    }
    setRec({ ...r, offset });
  };

  const endRecording = async () => {
    pressingRef.current = false;
    const r = recRef.current;
    if (!r) return;
    setRec(null);
    const result = await r.handle.stop();
    if (result.duration < MIN_VOICE_SECONDS) {
      toast('Kaydetmek için mikrofon düğmesini basılı tut.', 'no');
      return;
    }
    onVoice(result);
  };

  return (
    <div
      style={{
        flexShrink: 0,
        padding: '8px clamp(10px,6%,70px) calc(10px + env(safe-area-inset-bottom))',
        background: t.chatBg,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        position: 'relative',
      }}
    >
      {emojiOpen ? (
        <div
          className="cx-scroll"
          style={{
            position: 'absolute',
            left: 'clamp(10px,6%,70px)',
            bottom: 'calc(100% - 4px)',
            width: 'min(340px, calc(100% - 20px))',
            maxHeight: 230,
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            gap: 3,
            padding: 10,
            background: t.bg,
            border: `1px solid ${t.divider}`,
            borderRadius: 16,
            boxShadow: '0 12px 38px rgba(0,0,0,.24)',
            zIndex: 8,
          }}
        >
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className="cx-tap"
              aria-label={e}
              onClick={() => {
                setDraft((d) => (d + e).slice(0, MAX_TEXT));
                inputRef.current?.focus();
              }}
              style={{
                height: 36,
                border: 'none',
                borderRadius: 8,
                background: 'transparent',
                fontSize: 23,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {e}
            </button>
          ))}
        </div>
      ) : null}
      {replyTo && !editing ? (
        <ContextBar
          t={t}
          icon="reply"
          color={colorFor(replyTo.from)}
          title={replyName}
          text={messagePreview(replyTo) || '…'}
          onClose={onCancelReply}
        />
      ) : null}
      {editing ? (
        <ContextBar
          t={t}
          icon="edit"
          color={t.accent}
          title="Mesajı düzenle"
          text={editing.text}
          onClose={() => {
            setDraft('');
            onCancelEdit();
          }}
        />
      ) : null}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9 }}>
        {rec ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: t.bg,
              borderRadius: 24,
              padding: '0 16px',
              minHeight: 48,
              boxShadow: '0 1px 3px rgba(0,0,0,.08)',
              minWidth: 0,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#E53935', animation: 'recPulse 1s infinite' }} />
            <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 15, color: t.textPrimary }}>{formatDuration(rec.seconds)}</span>
            <span
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 13,
                color: t.textSecondary,
                transform: `translateX(${rec.offset}px)`,
                whiteSpace: 'nowrap',
              }}
            >
              ◀ İptal için kaydır
            </span>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'flex-end',
              gap: 4,
              background: t.bg,
              borderRadius: 24,
              padding: '4px 6px',
              minHeight: 48,
              boxShadow: '0 1px 3px rgba(0,0,0,.08)',
              minWidth: 0,
            }}
          >
            <IconButton
              label="Emoji seç"
              icon="smile"
              onClick={() => setEmojiOpen((o) => !o)}
              size={40}
              iconSize={22}
              color={emojiOpen ? t.accent : t.textSecondary}
            />
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                const v = e.target.value.slice(0, MAX_TEXT);
                setDraft(v);
                onTyping(!!v.trim());
              }}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={editing ? 'Mesajı düzenle…' : 'Mesaj yaz…'}
              aria-label="Mesaj"
              enterKeyHint={finePointer() ? 'send' : 'enter'}
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 15,
                lineHeight: `${LINE_HEIGHT}px`,
                color: t.textPrimary,
                resize: 'none',
                padding: '9px 2px',
                maxHeight: MAX_ROWS * LINE_HEIGHT + 20,
                overflowY: 'auto',
              }}
            />
            <input
              ref={fileRef}
              type="file"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = '';
                if (files.length) onFiles(files);
              }}
              style={{ display: 'none' }}
            />
            {!editing ? (
              <IconButton
                label="Dosya veya fotoğraf ekle"
                icon="paperclip"
                onClick={() => {
                  setEmojiOpen(false);
                  fileRef.current?.click();
                }}
                size={40}
                iconSize={22}
                color={t.textSecondary}
              />
            ) : null}
          </div>
        )}
        {hasText || editing ? (
          <button
            type="button"
            onClick={submit}
            disabled={!hasText}
            className="cx-tap"
            aria-label={editing ? 'Kaydet' : 'Gönder'}
            title={editing ? 'Kaydet' : 'Gönder'}
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              border: 'none',
              background: hasText ? t.accent : t.surface,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: hasText ? '#fff' : t.textSecondary,
              flexShrink: 0,
              boxShadow: hasText ? `0 4px 12px ${t.accentShadow}` : 'none',
            }}
          >
            <Icon name={editing ? 'check' : 'send'} size={22} />
          </button>
        ) : (
          <button
            type="button"
            className="cx-tap"
            aria-label="Sesli mesaj kaydetmek için basılı tut"
            title="Sesli mesaj: basılı tut"
            onPointerDown={beginRecording}
            onPointerMove={moveRecording}
            onPointerUp={endRecording}
            onPointerCancel={endRecording}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              border: 'none',
              background: rec ? '#E53935' : t.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              flexShrink: 0,
              boxShadow: `0 4px 12px ${t.accentShadow}`,
              touchAction: 'none',
              transform: rec ? 'scale(1.15)' : 'none',
              transition: 'transform .15s, background .15s',
            }}
          >
            <Icon name="mic" size={22} />
          </button>
        )}
      </div>
    </div>
  );
}
