import { useRef, useState } from 'react';
import { useDbValue, useProfiles } from '../hooks/data.js';
import { changePassword, deleteMyAccount, saveSetting, setBlocked, updateProfile } from '../lib/api.js';
import { friendlyError } from '../lib/errors.js';
import { Icon } from '../lib/icons.jsx';
import { removeAvatarFile, uploadAvatar } from '../lib/storage.js';
import { displayNameError, NAME_MAX, passwordError } from '../lib/username.js';
import { confirmDialog } from './dialogs.jsx';
import { Button, Modal, TextInput, Toggle } from './Modal.jsx';
import NotificationSettings from './NotificationSettings.jsx';
import { Avatar, IconButton } from './ui.jsx';

const BASE = import.meta.env.BASE_URL;

function Card({ t, title, icon, children }) {
  return (
    <section style={{ margin: '10px 12px', background: t.bg, border: `1px solid ${t.divider}`, borderRadius: 15, padding: 14 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: t.textSecondary, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={14} />
        {title}
      </h3>
      {children}
    </section>
  );
}

function RowButton({ t, icon, label, onClick, danger, hint }) {
  return (
    <button type="button" onClick={onClick} className="cx-row" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', border: 'none', background: 'none', color: danger ? t.error : t.textPrimary, fontSize: 14.5, textAlign: 'left', borderRadius: 8 }}>
      <Icon name={icon} size={19} color={danger ? t.error : t.textSecondary} />
      <span style={{ flex: 1 }}>{label}</span>
      {hint ? <span style={{ fontSize: 12.5, color: t.textSecondary }}>{hint}</span> : null}
    </button>
  );
}

function ProfileCard({ t, me, email, toast }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.name || '');
  const [about, setAbout] = useState(me.about || '');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);

  const save = async () => {
    const e = displayNameError(name);
    if (e) return toast(e, 'no');
    setBusy(true);
    try {
      await updateProfile(me.uid, { name, about });
      setEditing(false);
      toast('Profil güncellendi');
    } catch (err) {
      toast(friendlyError(err, 'profil'), 'no');
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  const onPhoto = async (file) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const url = await uploadAvatar(me.uid, file);
      await updateProfile(me.uid, { photoURL: url });
      toast('Profil fotoğrafı güncellendi');
    } catch (err) {
      toast(err.code === 'too-big' ? 'Fotoğraf 2 MB sınırını aşıyor.' : friendlyError(err, 'profil fotoğrafı'), 'no');
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <Card t={t} title="PROFİL" icon="user">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button type="button" onClick={() => fileRef.current?.click()} aria-label="Profil fotoğrafını değiştir" style={{ position: 'relative', border: 'none', padding: 0, background: 'none', borderRadius: '50%' }}>
          <Avatar name={me.name} uid={me.uid} color={me.color} photoURL={me.photoURL} size={64} />
          <span style={{ position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: '50%', background: t.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${t.bg}` }}>
            {photoBusy ? <span className="cx-spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <Icon name="camera" size={13} />}
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onPhoto(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16.5, fontWeight: 700, color: t.textPrimary, overflowWrap: 'anywhere' }}>{me.name}</div>
          <div style={{ fontSize: 13, color: t.textSecondary }}>@{me.username}</div>
          {email ? <div style={{ fontSize: 12.5, color: t.textSecondary, marginTop: 2, overflowWrap: 'anywhere' }}>{email}</div> : null}
        </div>
      </div>
      {me.about && !editing ? <div style={{ marginTop: 12, fontSize: 14, color: t.textPrimary, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{me.about}</div> : null}
      {editing ? (
        <div style={{ marginTop: 14 }}>
          <TextInput t={t} id="p-name" label="GÖRÜNEN AD" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
          <TextInput t={t} id="p-about" label="HAKKINDA" multiline maxLength={140} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Kendinden kısaca bahset" />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button t={t} kind="ghost" onClick={() => setEditing(false)}>
              Vazgeç
            </Button>
            <Button t={t} onClick={save} busy={busy}>
              Kaydet
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Button t={t} kind="outline" onClick={() => setEditing(true)} style={{ height: 36, fontSize: 13.5 }}>
            <Icon name="edit" size={15} /> Adı ve hakkında
          </Button>
          {me.photoURL ? (
            <Button
              t={t}
              kind="ghost"
              style={{ height: 36, fontSize: 13.5 }}
              onClick={async () => {
                await updateProfile(me.uid, { photoURL: null }).catch((err) => toast(friendlyError(err, 'profil'), 'no'));
                removeAvatarFile(me.uid);
              }}
            >
              Fotoğrafı kaldır
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function PasswordDialog({ t, onClose, toast }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const e = passwordError(next) || (next !== again ? 'Yeni şifreler eşleşmiyor.' : null);
    if (e) return setError(e);
    setBusy(true);
    setError('');
    try {
      await changePassword(cur, next);
      toast('Şifren değiştirildi');
      onClose();
    } catch (err) {
      setError(friendlyError(err, 'şifre değiştirme'));
    } finally {
      setBusy(false);
    }
    return undefined;
  };
  return (
    <Modal
      t={t}
      title="Şifreyi değiştir"
      onClose={onClose}
      footer={
        <>
          <Button t={t} kind="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button t={t} onClick={submit} busy={busy} disabled={!cur || !next}>
            Değiştir
          </Button>
        </>
      }
    >
      <div style={{ padding: '14px 18px 4px' }}>
        <TextInput t={t} id="pw-cur" type="password" label="MEVCUT ŞİFRE" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        <TextInput t={t} id="pw-new" type="password" label="YENİ ŞİFRE (EN AZ 8 KARAKTER)" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <TextInput t={t} id="pw-again" type="password" label="YENİ ŞİFRE (TEKRAR)" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} error={error} />
      </div>
    </Modal>
  );
}

function DeleteAccountDialog({ t, onClose, onDeleted }) {
  const [pw, setPw] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = confirmText.trim().toLocaleUpperCase('tr-TR') === 'SİL';
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteMyAccount(pw);
      onDeleted();
    } catch (err) {
      setError(friendlyError(err, 'hesap silme'));
      setBusy(false);
    }
  };
  return (
    <Modal
      t={t}
      title="Hesabı sil"
      onClose={onClose}
      footer={
        <>
          <Button t={t} kind="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button t={t} kind="danger" onClick={submit} busy={busy} disabled={!pw || !ok}>
            Hesabımı kalıcı olarak sil
          </Button>
        </>
      }
    >
      <div style={{ padding: '14px 18px 4px', fontSize: 14, lineHeight: 1.55, color: t.textPrimary }}>
        <p style={{ margin: '0 0 10px' }}>Bu işlem geri alınamaz. Şunlar silinir:</p>
        <ul style={{ margin: '0 0 12px', paddingLeft: 20, color: t.textSecondary }}>
          <li>Profilin, kullanıcı adın ve profil fotoğrafın</li>
          <li>Gönderdiğin tüm mesajların içeriği ve ekleri (karşı tarafta "Bu mesaj silindi" görünür)</li>
          <li>Sohbet listen, istekler, engel listen, ayarların ve bildirim kayıtların</li>
          <li>Gruplardan çıkarılırsın</li>
        </ul>
        <TextInput t={t} id="del-pw" type="password" label="ŞİFREN" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <TextInput t={t} id="del-confirm" label='ONAYLAMAK İÇİN "SİL" YAZ' value={confirmText} onChange={(e) => setConfirmText(e.target.value)} error={error} />
      </div>
    </Modal>
  );
}

function BlockedList({ t, uid, toast }) {
  const blocks = useDbValue(`blocks/${uid}`).value || {};
  const ids = Object.keys(blocks).filter((k) => blocks[k] === true);
  const profiles = useProfiles(ids);
  if (!ids.length) return <div style={{ fontSize: 13, color: t.textSecondary, padding: '6px 0' }}>Engellediğin kimse yok.</div>;
  return ids.map((id) => (
    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
      <Avatar name={profiles[id]?.name} uid={id} color={profiles[id]?.color} photoURL={profiles[id]?.photoURL} size={36} />
      <span style={{ flex: 1, fontSize: 14.5, color: t.textPrimary, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profiles[id]?.name || 'Kullanıcı'}</span>
      <Button t={t} kind="outline" style={{ height: 32, fontSize: 12.5 }} onClick={() => setBlocked(uid, id, false).then(() => toast('Engel kaldırıldı')).catch((err) => toast(friendlyError(err, 'engel'), 'no'))}>
        Engeli kaldır
      </Button>
    </div>
  ));
}

export default function Settings({ t, me, email, theme, onBack, onLogout, onAccountDeleted, toast }) {
  const settings = useDbValue(`settings/${me.uid}`).value || {};
  const [dialog, setDialog] = useState(null);
  const set = (key) => (value) => saveSetting(me.uid, key, value).catch((err) => toast(friendlyError(err, 'ayar'), 'no'));

  const choice = (value, label) => {
    const active = theme.pref === value;
    return (
      <button type="button" onClick={() => theme.setPref(value)} className="cx-tap" aria-pressed={active} style={{ flex: 1, height: 38, borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 13.5, background: active ? t.accent : t.surface, color: active ? '#fff' : t.textSecondary }}>
        {label}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: t.canvas }}>
      <div style={{ minHeight: 62, paddingTop: 'env(safe-area-inset-top)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8, paddingRight: 12, background: t.appbarBg, color: t.appbarText }}>
        <IconButton label="Geri" icon="back" onClick={onBack} />
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Ayarlar</h2>
      </div>
      <div className="cx-scroll" style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        <ProfileCard t={t} me={me} email={email} toast={toast} />

        <Card t={t} title="BİLDİRİMLER" icon="bell">
          <NotificationSettings t={t} uid={me.uid} toast={toast} />
          <div style={{ borderTop: `1px solid ${t.divider}`, marginTop: 12, paddingTop: 4 }}>
            <Toggle t={t} checked={settings.notifPreview !== false} onChange={set('notifPreview')} label="Bildirimde mesaj içeriğini göster" description='Kapalıysa bildirimde yalnızca "Yeni mesaj" yazar.' />
          </div>
        </Card>

        <Card t={t} title="GİZLİLİK" icon="eye">
          <Toggle t={t} checked={settings.showLastSeen !== false} onChange={set('showLastSeen')} label="Son görülmemi göster" description="Kapatırsan başkalarının son görülme bilgisini de göremezsin." />
          <Toggle t={t} checked={settings.showOnline !== false} onChange={set('showOnline')} label="Çevrimiçi olduğumu göster" />
          <div style={{ borderTop: `1px solid ${t.divider}`, marginTop: 8, paddingTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.textSecondary, letterSpacing: 0.4, marginBottom: 4 }}>ENGELLENENLER</div>
            <BlockedList t={t} uid={me.uid} toast={toast} />
          </div>
        </Card>

        <Card t={t} title="GÖRÜNÜM" icon={theme.mode === 'dark' ? 'moon' : 'sun'}>
          <div style={{ display: 'flex', gap: 6 }}>
            {choice('system', 'Sistem')}
            {choice('light', 'Açık')}
            {choice('dark', 'Koyu')}
          </div>
        </Card>

        <Card t={t} title="HESAP" icon="shield">
          <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.5, marginBottom: 6, display: 'flex', gap: 8 }}>
            <Icon name="lock" size={16} />
            Bağlantın şifreli (HTTPS). Mesajların Firebase sunucularında (Avrupa – Belçika) saklanır.
          </div>
          <RowButton t={t} icon="key" label="Şifreyi değiştir" onClick={() => setDialog('password')} />
          <RowButton
            t={t}
            icon="logout"
            label="Çıkış yap"
            onClick={async () => {
              if (await confirmDialog({ title: 'Çıkış yapılsın mı?', text: 'Bu cihaza bildirim gelmez.', okText: 'Çıkış yap' })) onLogout();
            }}
          />
          <RowButton t={t} icon="trash" label="Hesabı sil" danger onClick={() => setDialog('delete')} />
        </Card>

        <Card t={t} title="YASAL" icon="doc">
          <RowButton t={t} icon="doc" label="Gizlilik politikası" onClick={() => window.open(`${BASE}gizlilik.html`, '_blank', 'noopener')} />
          <RowButton t={t} icon="doc" label="Kullanım koşulları" onClick={() => window.open(`${BASE}kosullar.html`, '_blank', 'noopener')} />
          <RowButton t={t} icon="doc" label="KVKK aydınlatma metni" onClick={() => window.open(`${BASE}kvkk.html`, '_blank', 'noopener')} />
        </Card>

        <div style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: t.accent, marginTop: 16 }}>Geliştiren: Ömer İlerisoy</div>
      </div>
      {dialog === 'password' ? <PasswordDialog t={t} onClose={() => setDialog(null)} toast={toast} /> : null}
      {dialog === 'delete' ? <DeleteAccountDialog t={t} onClose={() => setDialog(null)} onDeleted={onAccountDeleted} /> : null}
    </div>
  );
}
