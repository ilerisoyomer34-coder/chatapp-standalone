import { formatLastSeen } from '../lib/format.js';
import { Modal } from './Modal.jsx';
import { Avatar } from './ui.jsx';

// Karşı tarafın profili: fotoğraf, ad, kullanıcı adı, hakkında, çevrimiçi bilgisi.
export default function ProfileSheet({ t, uid, profile, presence, onClose }) {
  const name = profile === null ? 'Silinmiş hesap' : profile?.name || '…';
  return (
    <Modal t={t} title="Kişi bilgisi" onClose={onClose} width={380}>
      <div style={{ padding: '22px 20px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Avatar name={name} uid={uid} color={profile?.color} photoURL={profile?.photoURL} size={112} />
        </div>
        <div style={{ fontSize: 21, fontWeight: 800, marginTop: 14, color: t.textPrimary }}>{name}</div>
        {profile?.username ? <div style={{ fontSize: 14, color: t.textSecondary, marginTop: 4 }}>@{profile.username}</div> : null}
        <div style={{ fontSize: 13, color: t.accentText, marginTop: 6, fontWeight: 600 }}>
          {presence?.online ? 'çevrimiçi' : presence?.lastSeen ? formatLastSeen(presence.lastSeen) : ''}
        </div>
        {profile?.disabled ? (
          <div style={{ marginTop: 10, color: t.error, fontWeight: 600, fontSize: 13 }}>Bu hesap devre dışı bırakıldı.</div>
        ) : null}
      </div>
      {profile?.about ? (
        <div style={{ margin: '0 16px 18px', padding: '12px 14px', background: t.surface, borderRadius: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.textSecondary, letterSpacing: 0.4 }}>HAKKINDA</div>
          <div style={{ fontSize: 14.5, color: t.textPrimary, marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {profile.about}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
