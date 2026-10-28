import { useEffect, useState } from 'react';
import { Icon } from '../lib/icons.jsx';
import { applyUpdate, onUpdateReady } from '../lib/sw.js';

// Yeni sürüm servis çalışanında hazır olunca üstte "Yeni sürüm hazır — Yenile" bandı.
export default function UpdateBanner({ t }) {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => onUpdateReady(setReady), []);
  if (!ready || hidden) return null;
  return (
    <div role="status" aria-live="polite" style={{ position: 'fixed', left: '50%', top: 'calc(env(safe-area-inset-top) + 10px)', transform: 'translateX(-50%)', zIndex: 60, width: 'min(440px, calc(100% - 24px))', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px 14px', borderRadius: 14, background: t.primary, color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,.22)', animation: 'bannerIn .25s ease' }}>
      <Icon name="download" size={18} />
      <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Yeni sürüm hazır</div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          applyUpdate();
        }}
        className="cx-tap"
        style={{ height: 34, padding: '0 14px', borderRadius: 10, border: 'none', background: '#fff', color: t.primary, fontWeight: 700, fontSize: 13.5 }}
      >
        Yenile
      </button>
      <button type="button" aria-label="Bandı kapat" onClick={() => setHidden(true)} className="cx-tap" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
