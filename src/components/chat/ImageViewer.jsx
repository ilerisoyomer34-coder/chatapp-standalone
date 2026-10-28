import { useEffect } from 'react';
import { Icon } from '../../lib/icons.jsx';
import { downloadAttachment, useBlobUrl } from './Attachment.jsx';

// Tam ekran fotoğraf görüntüleyici.
export default function ImageViewer({ attachment, onClose }) {
  const { url, error } = useBlobUrl(attachment.path);
  const preview = useBlobUrl(attachment.thumbPath);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const src = url || preview.url;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Fotoğraf"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,.94)', display: 'flex', flexDirection: 'column' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'calc(10px + env(safe-area-inset-top)) 12px 10px', color: '#fff' }}
      >
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {attachment.name}
        </div>
        <button
          type="button"
          aria-label="İndir"
          onClick={() => downloadAttachment(attachment.path, attachment.name).catch(() => {})}
          className="cx-tap"
          style={{
            width: 42,
            height: 42,
            border: 'none',
            borderRadius: '50%',
            background: 'rgba(255,255,255,.12)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="download" size={20} />
        </button>
        <button
          type="button"
          aria-label="Kapat"
          onClick={onClose}
          className="cx-tap"
          style={{
            width: 42,
            height: 42,
            border: 'none',
            borderRadius: '50%',
            background: 'rgba(255,255,255,.12)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="x" size={22} />
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, minHeight: 0 }}>
        {src ? (
          <img
            src={src}
            alt={attachment.name}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: url ? 'none' : 'blur(2px)' }}
          />
        ) : null}
        {!src && !error ? <span className="cx-spinner" style={{ color: '#fff' }} aria-label="Yükleniyor" /> : null}
        {error && !src ? <span style={{ color: '#fff' }}>Fotoğraf yüklenemedi.</span> : null}
      </div>
    </div>
  );
}
