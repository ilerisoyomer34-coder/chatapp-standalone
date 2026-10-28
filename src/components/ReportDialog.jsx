import { useState } from 'react';
import { reportUser } from '../lib/api.js';
import { friendlyError } from '../lib/errors.js';
import { Button, Modal, TextInput } from './Modal.jsx';

const REASONS = ['İstenmeyen mesaj (spam)', 'Taciz veya zorbalık', 'Uygunsuz içerik', 'Sahte hesap veya dolandırıcılık', 'Diğer'];

export default function ReportDialog({ t, me, target, targetName, chatId, messageId, onClose, toast }) {
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await reportUser(me.uid, { target, chatId, messageId, reason: note.trim() ? `${reason}: ${note.trim()}` : reason });
      toast('Şikâyetin yöneticiye iletildi. Teşekkürler.');
      onClose();
    } catch (err) {
      toast(friendlyError(err, 'şikâyet'), 'no');
      setBusy(false);
    }
  };

  return (
    <Modal
      t={t}
      title={`${targetName || 'Kullanıcı'} şikâyet et`}
      onClose={onClose}
      footer={
        <>
          <Button t={t} kind="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button t={t} kind="danger" onClick={submit} busy={busy}>
            Şikâyet et
          </Button>
        </>
      }
    >
      <div style={{ padding: '12px 18px' }}>
        <div style={{ fontSize: 13.5, color: t.textSecondary, marginBottom: 10, lineHeight: 1.5 }}>
          {messageId ? 'Bu mesaj ve gönderen yöneticiye bildirilecek.' : 'Bu kişi yöneticiye bildirilecek.'} Kişiyi ayrıca engellemek için sohbet menüsündeki "Engelle"yi kullanabilirsin.
        </div>
        <div role="radiogroup" aria-label="Şikâyet nedeni" style={{ marginBottom: 10 }}>
          {REASONS.map((r) => (
            <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', fontSize: 14.5, color: t.textPrimary, cursor: 'pointer' }}>
              <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} style={{ accentColor: t.accent, width: 18, height: 18 }} />
              {r}
            </label>
          ))}
        </div>
        <TextInput t={t} id="report-note" label="AÇIKLAMA (İSTEĞE BAĞLI)" multiline maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}
