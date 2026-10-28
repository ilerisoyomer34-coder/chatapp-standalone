import { useState } from 'react';
import { friendlyError } from '../lib/errors.js';
import { Icon } from '../lib/icons.jsx';
import { enablePush } from '../lib/push.js';
import { IosInstallGuide, usePermissionState } from './NotificationSettings.jsx';

const seenKey = (uid) => `chatapp_notif_card_${uid}`;

function wasSeen(uid) {
  try {
    return localStorage.getItem(seenKey(uid)) === '1';
  } catch {
    return false;
  }
}

// İlk girişten sonra bir kez gösterilen kart. İzin yalnızca düğmeye dokununca istenir.
export default function NotificationCard({ t, uid, toast }) {
  const [state, refresh] = usePermissionState();
  const [hidden, setHidden] = useState(() => wasSeen(uid));
  const [busy, setBusy] = useState(false);

  if (hidden || (state !== 'default' && state !== 'needs-install')) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(seenKey(uid), '1');
    } catch {
      /* yok say */
    }
  };

  const enable = async () => {
    setBusy(true);
    try {
      const result = await enablePush(uid);
      if (result === 'granted') toast('Bildirimler açıldı');
      else if (result === 'denied') toast("Bildirim izni verilmedi. Ayarlar'dan yeniden açabilirsin.", 'no');
      dismiss();
    } catch (err) {
      toast(friendlyError(err, 'bildirim izni'), 'no');
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <div
      style={{
        margin: '10px 12px 4px',
        background: t.bg,
        border: `1px solid ${t.divider}`,
        borderRadius: 15,
        padding: 14,
        boxShadow: '0 3px 14px rgba(0,0,0,.05)',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            background: t.accent,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="bell" size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary }}>Mesajlardan haberdar ol</div>
          <div style={{ fontSize: 13, color: t.textSecondary, marginTop: 3, lineHeight: 1.5 }}>
            Uygulama kapalıyken bile yeni mesaj geldiğinde telefonuna bildirim gelsin.
          </div>
        </div>
      </div>
      {state === 'needs-install' ? (
        <div style={{ marginTop: 12 }}>
          <IosInstallGuide t={t} />
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
        <button
          type="button"
          onClick={dismiss}
          className="cx-tap"
          style={{
            flex: 1,
            height: 38,
            borderRadius: 10,
            border: 'none',
            background: t.surface,
            color: t.textSecondary,
            fontSize: 13.5,
            fontWeight: 700,
          }}
        >
          {state === 'needs-install' ? 'Tamam' : 'Şimdi değil'}
        </button>
        {state === 'default' ? (
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="cx-tap"
            style={{
              flex: 1,
              height: 38,
              borderRadius: 10,
              border: 'none',
              background: t.accent,
              color: '#fff',
              fontSize: 13.5,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              boxShadow: `0 4px 12px ${t.accentShadow}`,
            }}
          >
            {busy ? <span className="cx-spinner" aria-hidden="true" style={{ width: 14, height: 14 }} /> : <Icon name="bell" size={15} />}
            Bildirimleri aç
          </button>
        ) : null}
      </div>
    </div>
  );
}
