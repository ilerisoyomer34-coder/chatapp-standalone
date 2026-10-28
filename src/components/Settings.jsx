import { Icon } from '../lib/icons.jsx';
import NotificationSettings from './NotificationSettings.jsx';
import { Avatar, IconButton } from './ui.jsx';

function Card({ t, title, icon, children }) {
  return (
    <section style={{ margin: '10px 12px', background: t.bg, border: `1px solid ${t.divider}`, borderRadius: 15, padding: 14 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: t.textSecondary, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={14} />
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function Settings({ t, me, email, theme, onBack, onLogout, toast }) {
  const choice = (value, label) => {
    const active = theme.pref === value;
    return (
      <button
        type="button"
        onClick={() => theme.setPref(value)}
        className="cx-tap"
        aria-pressed={active}
        style={{ flex: 1, height: 38, borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 13.5, background: active ? t.accent : t.surface, color: active ? '#fff' : t.textSecondary }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: t.canvas }}>
      <div style={{ minHeight: 62, paddingTop: 'env(safe-area-inset-top)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8, paddingRight: 12, background: t.appbarBg, color: t.appbarText }}>
        <IconButton label="Geri" icon="back" onClick={onBack} />
        <div style={{ fontSize: 17, fontWeight: 700 }}>Ayarlar</div>
      </div>
      <div className="cx-scroll" style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        <Card t={t} title="PROFİL" icon="user">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name={me.name} uid={me.uid} color={me.color} photoURL={me.photoURL} size={52} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary }}>{me.name}</div>
              <div style={{ fontSize: 13, color: t.textSecondary }}>@{me.username}</div>
              {email ? <div style={{ fontSize: 12.5, color: t.textSecondary, marginTop: 2 }}>{email}</div> : null}
            </div>
          </div>
        </Card>

        <Card t={t} title="BİLDİRİMLER" icon="bell">
          <NotificationSettings t={t} uid={me.uid} toast={toast} />
        </Card>

        <Card t={t} title="GÖRÜNÜM" icon={theme.mode === 'dark' ? 'moon' : 'sun'}>
          <div style={{ display: 'flex', gap: 6 }}>
            {choice('system', 'Sistem')}
            {choice('light', 'Açık')}
            {choice('dark', 'Koyu')}
          </div>
        </Card>

        <Card t={t} title="HESAP" icon="shield">
          <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.5, marginBottom: 12, display: 'flex', gap: 8 }}>
            <Icon name="lock" size={16} />
            Bağlantın şifreli (HTTPS). Mesajların Firebase sunucularında (Avrupa – Belçika) saklanır.
          </div>
          <button type="button" onClick={onLogout} className="cx-tap" style={{ width: '100%', height: 44, borderRadius: 12, border: `1.5px solid ${t.error}`, background: 'transparent', color: t.error, fontWeight: 700, fontSize: 14.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="logout" size={18} />
            Çıkış yap
          </button>
        </Card>

        <div style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: t.accent, marginTop: 16 }}>Geliştiren: Ömer İlerisoy</div>
      </div>
    </div>
  );
}
