import { useEffect, useMemo, useRef, useState } from 'react';
import { groupAction } from '../lib/api.js';
import { friendlyError } from '../lib/errors.js';
import { Icon } from '../lib/icons.jsx';
import { uploadGroupPhoto } from '../lib/storage.js';
import ContactPicker from './ContactPicker.jsx';
import { Button, Modal, TextInput } from './Modal.jsx';

const MAX_MEMBERS = 50;

export default function CreateGroup({ t, contacts, onClose, onCreated, toast }) {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => photoUrl && URL.revokeObjectURL(photoUrl), [photoUrl]);

  const toggle = (uid) => setSelected((s) => (s.includes(uid) ? s.filter((x) => x !== uid) : [...s, uid]));

  const create = async () => {
    const clean = name.trim();
    if (!clean) return toast('Grup adı gerekli.', 'no');
    setBusy(true);
    try {
      const { chatId } = await groupAction({ action: 'create', name: clean, members: selected });
      if (photo) {
        try {
          const url = await uploadGroupPhoto(chatId, photo);
          await groupAction({ action: 'update', chatId, photoURL: url });
        } catch (err) {
          friendlyError(err, 'grup fotoğrafı');
          toast('Grup kuruldu ama fotoğraf yüklenemedi.', 'no');
        }
      }
      onCreated(chatId);
    } catch (err) {
      toast(friendlyError(err, 'grup kurma'), 'no');
      setBusy(false);
    }
    return undefined;
  };

  return (
    <Modal
      t={t}
      title={step === 1 ? 'Yeni grup: kişileri seç' : 'Yeni grup'}
      onClose={onClose}
      footer={
        step === 1 ? (
          <>
            <span style={{ flex: 1, alignSelf: 'center', fontSize: 12.5, color: t.textSecondary }}>{selected.length} kişi seçildi</span>
            <Button t={t} kind="ghost" onClick={onClose}>
              Vazgeç
            </Button>
            <Button t={t} onClick={() => setStep(2)} disabled={!selected.length}>
              İleri
            </Button>
          </>
        ) : (
          <>
            <Button t={t} kind="ghost" onClick={() => setStep(1)}>
              Geri
            </Button>
            <Button t={t} onClick={create} busy={busy} disabled={!name.trim()}>
              Grubu kur
            </Button>
          </>
        )
      }
    >
      {step === 1 ? (
        <ContactPicker
          t={t}
          contacts={contacts}
          selected={selected}
          onToggle={toggle}
          max={MAX_MEMBERS - 1}
          emptyText="Gruba yalnızca sohbet ettiğin kişileri ekleyebilirsin. Önce bir kullanıcı adı arayıp istek gönder."
        />
      ) : (
        <div style={{ padding: '18px 18px 8px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Grup fotoğrafı seç"
              style={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                border: 'none',
                background: t.surface,
                color: t.textSecondary,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 4,
                fontSize: 12,
              }}
            >
              {photoUrl ? (
                <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <>
                  <Icon name="camera" size={28} />
                  Fotoğraf
                </>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            />
          </div>
          <TextInput
            t={t}
            id="group-name"
            label="GRUP ADI"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Aile"
            autoFocus
          />
          <div style={{ fontSize: 12.5, color: t.textSecondary }}>
            {selected.length + 1} üye (en fazla {MAX_MEMBERS}). Grubu kuran kişi yönetici olur.
          </div>
        </div>
      )}
    </Modal>
  );
}
