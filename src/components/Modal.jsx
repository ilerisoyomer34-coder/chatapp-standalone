import { useEffect, useRef } from 'react';
import { Icon } from '../lib/icons.jsx';

const isDesktop = () => typeof window !== 'undefined' && window.innerWidth >= 860;

// Masaüstünde ortada pencere, mobilde alttan açılan sayfa. Esc ve dışarı tıklama kapatır.
export function Modal({ t, title, onClose, children, footer, width = 420, labelledBy }) {
  const boxRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    const first = boxRef.current?.querySelector('input, textarea, button, [tabindex]');
    first?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      if (prev && prev.focus) prev.focus({ preventScroll: true });
    };
  }, [onClose]);
  const desktop = isDesktop();
  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: t.overlay,
        display: 'flex',
        alignItems: desktop ? 'center' : 'flex-end',
        justifyContent: 'center',
        animation: 'fadeUp .18s ease',
      }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : title}
        aria-labelledby={labelledBy}
        style={{
          width: desktop ? `min(${width}px, calc(100vw - 32px))` : '100%',
          maxHeight: desktop ? 'min(720px, calc(100vh - 48px))' : '88vh',
          background: t.bg,
          color: t.textPrimary,
          borderRadius: desktop ? 18 : '18px 18px 0 0',
          boxShadow: '0 24px 60px rgba(0,0,0,.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          paddingBottom: desktop ? 0 : 'env(safe-area-inset-bottom)',
        }}
      >
        {title ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 10px 10px 18px',
              borderBottom: `1px solid ${t.divider}`,
            }}
          >
            <div style={{ flex: 1, fontSize: 16.5, fontWeight: 700 }}>{title}</div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="cx-tap"
              style={{
                width: 36,
                height: 36,
                border: 'none',
                borderRadius: '50%',
                background: 'none',
                color: t.textSecondary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="x" size={20} />
            </button>
          </div>
        ) : null}
        <div className="cx-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {children}
        </div>
        {footer ? (
          <div style={{ padding: 12, borderTop: `1px solid ${t.divider}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ActionSheet({ t, title, items, onClose, header }) {
  return (
    <Modal t={t} title={title} onClose={onClose} width={360}>
      {header}
      <div role="menu" style={{ padding: '6px 0' }}>
        {items.filter(Boolean).map((it) => (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              it.onClick();
            }}
            className="cx-row"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '13px 20px',
              border: 'none',
              background: 'none',
              color: it.danger ? t.error : t.textPrimary,
              fontSize: 15,
              textAlign: 'left',
            }}
          >
            {it.icon ? <Icon name={it.icon} size={20} color={it.danger ? t.error : t.textSecondary} /> : null}
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.hint ? <span style={{ fontSize: 12.5, color: t.textSecondary }}>{it.hint}</span> : null}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function Button({ t, children, onClick, kind = 'primary', disabled, busy, type = 'button', style }) {
  const palette = {
    primary: { bg: t.accent, fg: '#fff', border: 'none' },
    danger: { bg: t.error, fg: '#fff', border: 'none' },
    ghost: { bg: 'transparent', fg: t.textSecondary, border: 'none' },
    outline: { bg: 'transparent', fg: t.accent, border: `1.5px solid ${t.accent}` },
  }[kind];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className="cx-tap"
      style={{
        height: 40,
        padding: '0 16px',
        borderRadius: 11,
        border: palette.border,
        background: palette.bg,
        color: palette.fg,
        fontWeight: 700,
        fontSize: 14,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      {busy ? <span className="cx-spinner" aria-hidden="true" style={{ width: 15, height: 15 }} /> : null}
      {children}
    </button>
  );
}

export function Toggle({ t, checked, onChange, label, description, disabled }) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 0',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14.5, color: t.textPrimary }}>{label}</span>
        {description ? (
          <span style={{ display: 'block', fontSize: 12.5, color: t.textSecondary, marginTop: 2, lineHeight: 1.45 }}>{description}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="cx-visually-hidden"
      />
      <span
        aria-hidden="true"
        style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          background: checked ? t.accent : t.divider,
          position: 'relative',
          transition: 'background .15s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 21 : 3,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,.3)',
            transition: 'left .15s',
          }}
        />
      </span>
    </label>
  );
}

export function TextInput({ t, label, id, error, multiline, ...props }) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div style={{ marginBottom: 12 }}>
      {label ? (
        <label htmlFor={id} style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: t.textSecondary, marginBottom: 6 }}>
          {label}
        </label>
      ) : null}
      <Tag
        id={id}
        {...props}
        style={{
          width: '100%',
          minHeight: multiline ? 72 : 44,
          padding: multiline ? '10px 12px' : '0 12px',
          borderRadius: 11,
          border: `1.5px solid ${error ? t.error : t.divider}`,
          background: t.surface,
          color: t.textPrimary,
          fontSize: 15,
          outline: 'none',
          resize: multiline ? 'vertical' : undefined,
          fontFamily: 'inherit',
        }}
      />
      {error ? <div style={{ color: t.error, fontSize: 12.5, marginTop: 5, fontWeight: 600 }}>{error}</div> : null}
    </div>
  );
}
