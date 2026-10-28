import { useEffect } from 'react';
import { colorFor, initials } from '../lib/format.js';
import { Icon } from '../lib/icons.jsx';

export function Avatar({ name, uid, color, photoURL, size = 46, dim = false, ring = false }) {
  const bg = color || colorFor(uid || name);
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: Math.round(size * 0.35),
        fontWeight: 700,
        flexShrink: 0,
        opacity: dim ? 0.6 : 1,
        overflow: 'hidden',
        animation: ring ? 'pulseRing 2s infinite' : undefined,
      }}
    >
      {photoURL ? <img src={photoURL} alt="" width={size} height={size} style={{ objectFit: 'cover' }} /> : initials(name)}
    </div>
  );
}

export function Field({ t, label, icon, prefix, id, error, ...inputProps }) {
  return (
    <div>
      <label
        htmlFor={id}
        style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: t.textSecondary, marginBottom: 7, letterSpacing: 0.2 }}
      >
        {label}
      </label>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          background: t.surface,
          border: `1.5px solid ${error ? t.error : t.divider}`,
          borderRadius: 12,
          padding: '0 14px',
          height: 50,
        }}
      >
        {icon ? <Icon name={icon} size={19} color={t.textSecondary} /> : null}
        {prefix ? <span style={{ fontSize: 16, fontWeight: 700, color: t.textSecondary }}>{prefix}</span> : null}
        <input
          id={id}
          {...inputProps}
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 15,
            fontWeight: 500,
            color: t.textPrimary,
          }}
        />
      </div>
    </div>
  );
}

export function PrimaryButton({ t, children, busy, icon = 'arrowRight', style, ...props }) {
  return (
    <button
      type="submit"
      className="cx-tap"
      disabled={busy || props.disabled}
      {...props}
      style={{
        width: '100%',
        height: 52,
        borderRadius: 13,
        border: 'none',
        background: t.accent,
        color: '#fff',
        fontSize: 16,
        fontWeight: 700,
        boxShadow: `0 8px 22px ${t.accentShadow}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: busy ? 0.8 : 1,
        ...style,
      }}
    >
      {busy ? <span className="cx-spinner" aria-hidden="true" /> : null}
      {children}
      {!busy && icon ? <Icon name={icon} size={19} /> : null}
    </button>
  );
}

export function ErrorLine({ t, children }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        marginTop: 14,
        color: t.error,
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.45,
      }}
    >
      <Icon name="info" size={16} style={{ marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

export function Toast({ t, toast, onDone }) {
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(onDone, 2800);
    return () => clearTimeout(id);
  }, [toast, onDone]);
  if (!toast) return null;
  const bad = toast.kind === 'no';
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 'calc(28px + env(safe-area-inset-bottom))',
        left: '50%',
        transform: 'translateX(-50%)',
        background: t.toastBg,
        color: t.toastText,
        padding: '13px 20px',
        borderRadius: 13,
        fontSize: 14,
        fontWeight: 600,
        boxShadow: '0 14px 40px rgba(0,0,0,.3)',
        zIndex: 90,
        animation: 'toastIn .3s ease',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        maxWidth: '90vw',
      }}
    >
      <Icon name={bad ? 'x' : 'check'} size={18} color={bad ? t.error : t.accent} />
      {toast.text}
    </div>
  );
}

export function SectionTitle({ t, children, color, icon }) {
  return (
    <div
      style={{
        padding: '14px 18px 4px',
        fontSize: 12,
        fontWeight: 700,
        color: color || t.textSecondary,
        letterSpacing: 0.5,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </div>
  );
}

export function IconButton({ label, icon, onClick, size = 40, iconSize = 21, color = 'inherit', style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cx-tap"
      aria-label={label}
      title={label}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: 'none',
        background: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        flexShrink: 0,
        ...style,
      }}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  );
}
