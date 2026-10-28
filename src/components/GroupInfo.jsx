import { useRef, useState } from 'react';
import { groupAction } from '../lib/api.js';
import { friendlyError } from '../lib/errors.js';
import { Icon } from '../lib/icons.jsx';
import { uploadGroupPhoto } from '../lib/storage.js';
import ContactPicker from './ContactPicker.jsx';
import { confirmDialog } from './dialogs.jsx';
import { ActionSheet, Button, Modal } from './Modal.jsx';
import { Avatar } from './ui.jsx';

const MAX_MEMBERS = 50;

export default function GroupInfo({ t, me, chatId, chat, profiles, contacts = [], onClose, toast, onLeft }) {
  const myUid = me.uid;
  const members = Object.keys(chat.members || {}).filter((u) => chat.members[u] === true);
  const admins = chat.admins || {};
  const iAmAdmin = admins[myUid] === true;
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(chat.name || '');
  const [busy, setBusy] = useState(false);
  const [memberMenu, setMemberMenu] = useState(null);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState([]);
  const fileRef = useRef(null);

  const run = async (data, okText) => {
    setBusy(true);
    try {
      await groupAction({ chatId, ...data });
      if (okText) toast(okText);
      return true;
    } catch (err) {
      toast(friendlyError(err, 'grup işlemi'), 'no');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const sorted = [...members].sort((a, b) => {
    if (a === myUid) return -1;
    if (b === myUid) return 1;
    if (!!admins[b] - !!admins[a]) return !!admins[b] - !!admins[a];
    return (profiles[a]?.name || '').localeCompare(profiles[b]?.name || '', 'tr');
  });
  const addable = contacts.filter((c) => !members.includes(c.uid));

  if (adding) {
    return (
      <Modal
        t={t}
        title="Üye ekle"
        onClose={() => setAdding(false)}
        footer={
          <>
            <Button t={t} kind="ghost" onClick={() => setAdding(false)}>
              Vazgeç
            </Button>
            <Button
              t={t}
              busy={busy}
              disabled={!toAdd.length}
              onClick={async () => {
                if (await run({ action: 'add', members: toAdd }, 'Üyeler eklendi')) {
                  setToAdd([]);
                  setAdding(false);
                }
              }}
            >
              Ekle
            </Button>
          </>
        }
      >
        <ContactPicker
          t={t}
          contacts={addable}
          selected={toAdd}
          onToggle={(uid) => setToAdd((s) => (s.includes(uid) ? s.filter((x) => x !== uid) : [...s, uid]))}
          max={MAX_MEMBERS - members.length}
          emptyText="Eklenebilecek kişi yok. Yalnızca sohbet ettiğin kişileri ekleyebilirsin."
        />
      </Modal>
    );
  }

  return (
    <Modal t={t} title="Grup bilgisi" onClose={onClose}>
      <div style={{ padding: '20px 18px 10px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
          <Avatar name={chat.name} uid={chatId} photoURL={chat.photoURL} size={104} />
        </div>
        {iAmAdmin ? (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
            <Button t={t} kind="outline" onClick={() => fileRef.current?.click()} busy={busy} style={{ height: 34, fontSize: 13 }}>
              <Icon name="camera" size={16} /> Fotoğraf
            </Button>
            {chat.photoURL ? (
              <Button t={t} kind="ghost" onClick={() => run({ action: 'update', photoURL: null }, 'Fotoğraf kaldırıldı')} style={{ height: 34, fontSize: 13 }}>
                Kaldır
              </Button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                setBusy(true);
                try {
                  const url = await uploadGroupPhoto(chatId, f);
                  await run({ action: 'update', photoURL: url }, 'Grup fotoğrafı güncellendi');
                } catch (err) {
                  toast(friendlyError(err, 'grup fotoğrafı'), 'no');
                } finally {
                  setBusy(false);
                }
              }}
            />
          </div>
        ) : null}
        {editingName ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus aria-label="Grup adı" style={{ flex: 1, height: 40, borderRadius: 10, border: `1.5px solid ${t.accent}`, background: t.surface, color: t.textPrimary, padding: '0 12px', fontSize: 15, outline: 'none' }} />
            <Button
              t={t}
              busy={busy}
              disabled={!name.trim()}
              onClick={async () => {
                if (name.trim() === chat.name) return setEditingName(false);
                if (await run({ action: 'update', name: name.trim() }, 'Grup adı değişti')) setEditingName(false);
                return undefined;
              }}
            >
              Kaydet
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: t.textPrimary }}>{chat.name}</div>
            {iAmAdmin ? (
              <button type="button" aria-label="Grup adını düzenle" onClick={() => setEditingName(true)} className="cx-tap" style={{ border: 'none', background: 'none', color: t.textSecondary, padding: 4 }}>
                <Icon name="edit" size={17} />
              </button>
            ) : null}
          </div>
        )}
        <div style={{ fontSize: 13, color: t.textSecondary, marginTop: 4 }}>Grup · {members.length} üye</div>
      </div>

      <div style={{ padding: '6px 0' }}>
        {iAmAdmin && members.length < MAX_MEMBERS ? (
          <button type="button" onClick={() => setAdding(true)} className="cx-row" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', border: 'none', background: 'none', color: t.accent, fontWeight: 700, fontSize: 15 }}>
            <span style={{ width: 40, height: 40, borderRadius: '50%', background: t.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="userPlus" size={20} />
            </span>
            Üye ekle
          </button>
        ) : null}
        {sorted.map((u) => {
          const p = profiles[u];
          const canManage = iAmAdmin && u !== myUid;
          return (
            <button
              key={u}
              type="button"
              disabled={!canManage}
              onClick={() => setMemberMenu(u)}
              className={canManage ? 'cx-row' : undefined}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', border: 'none', background: 'none', color: t.textPrimary, textAlign: 'left', cursor: canManage ? 'pointer' : 'default' }}
            >
              <Avatar name={p?.name} uid={u} color={p?.color} photoURL={p?.photoURL} size={40} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u === myUid ? 'Sen' : p?.name || 'Silinmiş hesap'}</span>
                {p?.about ? <span style={{ display: 'block', fontSize: 12.5, color: t.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.about}</span> : null}
              </span>
              {admins[u] ? <span style={{ fontSize: 11.5, fontWeight: 700, color: t.accent, border: `1px solid ${t.accent}`, borderRadius: 6, padding: '2px 6px' }}>Yönetici</span> : null}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '8px 16px 18px' }}>
        <Button
          t={t}
          kind="danger"
          busy={busy}
          style={{ width: '100%' }}
          onClick={async () => {
            if (!(await confirmDialog({ title: 'Gruptan ayrılmak istiyor musun?', text: `"${chat.name}" grubundan ayrılacaksın. Tekrar eklenmedikçe mesajları göremezsin.`, okText: 'Ayrıl', danger: true }))) return;
            if (await run({ action: 'leave' }, 'Gruptan ayrıldın')) {
              onClose();
              onLeft();
            }
          }}
        >
          <Icon name="logout" size={18} /> Gruptan ayrıl
        </Button>
      </div>

      {memberMenu ? (
        <ActionSheet
          t={t}
          title={profiles[memberMenu]?.name || 'Üye'}
          onClose={() => setMemberMenu(null)}
          items={[
            admins[memberMenu]
              ? { label: 'Yöneticiliği kaldır', icon: 'shield', onClick: () => run({ action: 'setAdmin', uid: memberMenu, admin: false }) }
              : { label: 'Yönetici yap', icon: 'shield', onClick: () => run({ action: 'setAdmin', uid: memberMenu, admin: true }) },
            {
              label: 'Gruptan çıkar',
              icon: 'x',
              danger: true,
              onClick: async () => {
                const n = profiles[memberMenu]?.name || 'Bu üye';
                if (await confirmDialog({ title: 'Gruptan çıkarılsın mı?', text: `${n} gruptan çıkarılacak.`, okText: 'Çıkar', danger: true })) run({ action: 'remove', uid: memberMenu });
              },
            },
          ]}
        />
      ) : null}
    </Modal>
  );
}
