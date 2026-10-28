import { useEffect, useState } from 'react';
import { friendlyError } from '../lib/errors.js';
import { Icon } from '../lib/icons.jsx';
import { deviceInfo, enablePush, permissionState } from '../lib/push.js';

export function usePermissionState() {
  const [state, setState] = useState(permissionState);
  useEffect(() => {
    const refresh = () => setState(permissionState());
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    let status;
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'notifications' })
        .then((s) => {
          status = s;
          s.onchange = refresh;
        })
        .catch(() => {});
    }
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      if (status) status.onchange = null;
    };
  }, []);
  return [state, () => setState(permissionState())];
}

export function IosInstallGuide({ t }) {
  return (
    <div style={{ background: t.surface, borderRadius: 12, padding: '12px 14px', fontSize: 13.5, lineHeight: 1.55, color: t.textPrimary }}>
      <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="share" size={18} color={t.accent} />
        Bildirim almak için ana ekrana ekle
      </div>
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        <li>Safari'de alttaki <b>Paylaş</b> düğmesine dokun.</li>
        <li><b>Ana Ekrana Ekle</b>'yi seç.</li>
        <li>Uygulamayı <b>ana ekrandaki simgeden</b> aç ve buradan bildirimleri aç.</li>
      </ol>
      <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 6 }}>iOS 16.4 ve sonrası gerekir.</div>
    </div>
  );
}

function BlockedHelp({ t }) {
  const { isIOS, isAndroid } = deviceInfo();
  const row = (title, text, highlight) => (
    <div style={{ marginTop: 8, opacity: highlight ? 1 : 0.8 }}>
      <b>{title}:</b> {text}
    </div>
  );
  return (
    <div style={{ background: t.surface, borderRadius: 12, padding: '12px 14px', fontSize: 13, lineHeight: 1.55, color: t.textPrimary }}>
      <div style={{ fontWeight: 700 }}>Bildirimler engellendi. Açmak için:</div>
      {row('Android', 'Ana ekrandaki ChatApp simgesine uzun bas → Uygulama bilgisi → Bildirimler → Açık. Chrome sekmesindeysen: adres çubuğundaki ayar simgesi → İzinler → Bildirimler → İzin ver.', isAndroid)}
      {row('iOS', 'Ayarlar → Bildirimler → ChatApp → Bildirimlere İzin Ver.', isIOS)}
      {row('Masaüstü', 'Adres çubuğundaki kilit simgesi → Site ayarları → Bildirimler → İzin ver; sonra sayfayı yenile.', !isIOS && !isAndroid)}
    </div>
  );
}

const LABELS = {
  granted: { text: 'Açık', color: (t) => t.accent },
  default: { text: 'Kapalı', color: (t) => t.textSecondary },
  denied: { text: 'Engellendi', color: (t) => t.error },
  unsupported: { text: 'Bu tarayıcıda desteklenmiyor', color: (t) => t.textSecondary },
  'needs-install': { text: 'Kapalı (önce ana ekrana ekle)', color: (t) => t.textSecondary },
};

export default function NotificationSettings({ t, uid, toast }) {
  const [state, refresh] = usePermissionState();
  const [busy, setBusy] = useState(false);
  const label = LABELS[state] || LABELS.default;

  const enable = async () => {
    setBusy(true);
    try {
      const result = await enablePush(uid);
      if (result === 'granted') toast('Bildirimler açıldı');
      else if (result === 'denied') toast('Bildirim izni verilmedi.', 'no');
    } catch (err) {
      toast(friendlyError(err, 'bildirim izni'), 'no');
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name={state === 'granted' ? 'bell' : 'bellOff'} size={20} color={label.color(t)} />
        <div style={{ flex: 1, fontSize: 14.5, color: t.textPrimary }}>
          Bildirim durumu: <b style={{ color: label.color(t) }}>{label.text}</b>
        </div>
      </div>
      {state === 'default' ? (
        <button type="button" onClick={enable} disabled={busy} className="cx-tap" style={{ height: 44, borderRadius: 12, border: 'none', background: t.accent, color: '#fff', fontWeight: 700, fontSize: 14.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: `0 4px 12px ${t.accentShadow}` }}>
          {busy ? <span className="cx-spinner" aria-hidden="true" /> : <Icon name="bell" size={18} />}
          Bildirimleri aç
        </button>
      ) : null}
      {state === 'needs-install' ? <IosInstallGuide t={t} /> : null}
      {state === 'denied' ? <BlockedHelp t={t} /> : null}
      {state === 'granted' ? (
        <div style={{ fontSize: 12.5, color: t.textSecondary, lineHeight: 1.5 }}>
          Uygulama kapalıyken ve telefon kilitliyken bile yeni mesaj ve sohbet isteklerinde bildirim alırsın.
        </div>
      ) : null}
    </div>
  );
}
