import { useEffect, useState } from 'react';
import { Button, Modal } from './Modal.jsx';

// Uygulama genelinde Türkçe onay penceresi: await confirmDialog({ title, text, okText, danger })
let push = null;
const queue = [];

export function confirmDialog(opts) {
  return new Promise((resolve) => {
    const item = { ...opts, resolve };
    if (push) push(item);
    else queue.push(item);
  });
}

export function DialogHost({ t }) {
  const [current, setCurrent] = useState(null);
  useEffect(() => {
    push = (item) => setCurrent(item);
    if (queue.length) setCurrent(queue.shift());
    return () => {
      push = null;
    };
  }, []);
  if (!current) return null;
  const done = (value) => {
    current.resolve(value);
    setCurrent(queue.length ? queue.shift() : null);
  };
  return (
    <Modal
      t={t}
      title={current.title || 'Emin misin?'}
      onClose={() => done(false)}
      width={380}
      footer={
        <>
          <Button t={t} kind="ghost" onClick={() => done(false)}>
            {current.cancelText || 'Vazgeç'}
          </Button>
          <Button t={t} kind={current.danger ? 'danger' : 'primary'} onClick={() => done(true)}>
            {current.okText || 'Tamam'}
          </Button>
        </>
      }
    >
      <div style={{ padding: '16px 18px', fontSize: 14.5, lineHeight: 1.55, color: t.textPrimary, whiteSpace: 'pre-line' }}>
        {current.text}
      </div>
    </Modal>
  );
}
