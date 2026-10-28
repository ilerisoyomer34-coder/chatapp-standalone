import { useEffect } from 'react';
import { Avatar } from './ui.jsx';

// Uygulama açık ama başka ekrandayken gelen mesaj/istek için üst bant.
// Ad, profil yüklendikçe güncellenir (bant profil gelmeden açılabilir).
export default function InAppBanner({ t, banner, profile, chatName, onOpen, onClose }) {
  useEffect(() => {
    if (!banner) return undefined;
    const id = setTimeout(onClose, 4500);
    return () => clearTimeout(id);
  }, [banner, onClose]);
  if (!banner) return null;
  const name = profile?.name || '';
  const group = chatName && chatName.type === 'group' ? chatName : null;
  const title = banner.kind === 'request' ? 'Yeni sohbet isteği' : group ? group.name : name || 'Yeni mesaj';
  const body = banner.kind === 'request' ? `${name || 'Biri'} sana sohbet isteği gönderdi.` : group && name ? `${name}: ${banner.body}` : banner.body;
  return (
    <button
      type="button"
      onClick={() => {
        onOpen(banner);
        onClose();
      }}
      className="cx-tap"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 'calc(10px + env(safe-area-inset-top))',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(440px, calc(100vw - 20px))',
        zIndex: 95,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 16,
        border: `1px solid ${t.divider}`,
        background: t.bg,
        color: t.textPrimary,
        boxShadow: '0 14px 40px rgba(0,0,0,.28)',
        animation: 'bannerIn .25s ease',
        textAlign: 'left',
      }}
    >
      {group ? <Avatar name={group.name} uid={banner.chatId} photoURL={group.photoURL} size={40} /> : <Avatar name={name || '?'} uid={banner.from} color={profile?.color} photoURL={profile?.photoURL} size={40} />}
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: 'block', fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</b>
        <span style={{ display: 'block', fontSize: 13, color: t.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{body}</span>
      </span>
    </button>
  );
}
