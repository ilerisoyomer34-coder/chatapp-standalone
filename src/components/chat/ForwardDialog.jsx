import { useState } from 'react';
import { newMessageId, sendMessage } from '../../lib/api.js';
import { friendlyError } from '../../lib/errors.js';
import { fetchBlob, uploadAttachment } from '../../lib/storage.js';
import { Button, Modal } from '../Modal.jsx';
import { Avatar } from '../ui.jsx';

const MAX_TARGETS = 5;

// Mesajı en fazla 5 sohbete ilet. Ekler hedef sohbetin klasörüne yeniden yüklenir
// (Storage kuralları her sohbetin dosyasını yalnızca o sohbetin üyelerine açar).
export default function ForwardDialog({ t, me, message, targets, onClose, onDone, toast }) {
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_TARGETS ? s : [...s, id]));

  const forward = async () => {
    setBusy(true);
    try {
      let file = null;
      if (message.attachment) {
        const blob = await fetchBlob(message.attachment.path);
        file = new File([blob], message.attachment.name, { type: message.attachment.type });
      }
      for (const chatId of selected) {
        const id = newMessageId(chatId);
        let attachment;
        if (file) {
          attachment = await uploadAttachment(chatId, id, file).promise;
          if (message.attachment.duration) attachment.duration = message.attachment.duration;
        }
        await sendMessage(me.uid, chatId, { id, text: message.text, attachment, forwarded: true });
      }
      onDone(selected.length, selected[0]);
    } catch (err) {
      toast(friendlyError(err, 'iletme'), 'no');
      setBusy(false);
    }
  };

  const needle = q.trim().toLocaleLowerCase('tr-TR');
  const list = targets.filter((x) => !needle || (x.name || '').toLocaleLowerCase('tr-TR').includes(needle));

  return (
    <Modal
      t={t}
      title="Mesajı ilet"
      onClose={onClose}
      footer={
        <>
          <span style={{ flex: 1, alignSelf: 'center', fontSize: 12.5, color: t.textSecondary }}>
            {selected.length}/{MAX_TARGETS} seçildi
          </span>
          <Button t={t} kind="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button t={t} onClick={forward} disabled={!selected.length} busy={busy}>
            İlet
          </Button>
        </>
      }
    >
      <div style={{ padding: '10px 14px 4px' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sohbet ara…"
          aria-label="Sohbet ara"
          style={{
            width: '100%',
            height: 40,
            borderRadius: 10,
            border: `1.5px solid ${t.divider}`,
            background: t.surface,
            color: t.textPrimary,
            padding: '0 12px',
            fontSize: 15,
            outline: 'none',
          }}
        />
      </div>
      <div role="listbox" aria-multiselectable="true">
        {list.map((x) => {
          const on = selected.includes(x.chatId);
          return (
            <button
              key={x.chatId}
              type="button"
              role="option"
              aria-selected={on}
              onClick={() => toggle(x.chatId)}
              className="cx-row"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '9px 16px',
                border: 'none',
                background: on ? t.surface : 'transparent',
                color: t.textPrimary,
                textAlign: 'left',
              }}
            >
              <Avatar name={x.name} uid={x.avatarKey} color={x.color} photoURL={x.photoURL} size={40} />
              <span
                style={{
                  flex: 1,
                  fontSize: 15,
                  fontWeight: 600,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {x.name}
              </span>
              <span
                aria-hidden="true"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  border: `2px solid ${on ? t.accent : t.divider}`,
                  background: on ? t.accent : 'transparent',
                  color: '#fff',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {on ? '✓' : ''}
              </span>
            </button>
          );
        })}
        {!list.length ? (
          <div style={{ padding: 20, textAlign: 'center', color: t.textSecondary, fontSize: 13.5 }}>Sohbet bulunamadı.</div>
        ) : null}
      </div>
    </Modal>
  );
}
