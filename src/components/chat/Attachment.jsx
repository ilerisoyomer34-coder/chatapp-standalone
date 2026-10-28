import { useEffect, useRef, useState } from 'react';
import { formatDuration, formatSize } from '../../lib/format.js';
import { Icon } from '../../lib/icons.jsx';
import { blobUrl } from '../../lib/storage.js';

function useBlobUrl(path, enabled = true) {
  const [state, setState] = useState({ url: null, error: false });
  useEffect(() => {
    if (!path || !enabled) return undefined;
    let alive = true;
    blobUrl(path)
      .then((url) => alive && setState({ url, error: false }))
      .catch((err) => {
        console.warn('[ChatApp] ek yüklenemedi', err);
        if (alive) setState({ url: null, error: true });
      });
    return () => {
      alive = false;
    };
  }, [path, enabled]);
  return state;
}

async function download(path, name) {
  const url = await blobUrl(path);
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'dosya';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function ImageAttachment({ t, a, onOpen }) {
  const { url, error } = useBlobUrl(a.thumbPath || a.path);
  const ratio = a.width && a.height ? a.height / a.width : 0.75;
  const w = Math.min(260, a.width || 260);
  const h = Math.min(320, Math.round(w * ratio));
  return (
    <button
      type="button"
      onClick={() => onOpen(a)}
      aria-label={`Fotoğrafı aç: ${a.name}`}
      style={{ display: 'block', marginTop: 2, padding: 0, border: 'none', borderRadius: 9, overflow: 'hidden', width: w, maxWidth: '100%', height: h, background: 'rgba(128,128,128,.18)', cursor: 'zoom-in' }}
    >
      {url ? <img src={url} alt={a.name} width={w} height={h} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
      {!url && !error ? <span className="cx-spinner" aria-hidden="true" style={{ margin: 'auto', display: 'block', marginTop: h / 2 - 9, color: t.textSecondary }} /> : null}
      {error ? <span style={{ display: 'block', padding: 12, fontSize: 12.5, color: t.textSecondary }}>Fotoğraf yüklenemedi</span> : null}
    </button>
  );
}

function AudioAttachment({ t, a }) {
  const [load, setLoad] = useState(false);
  const { url, error } = useBlobUrl(a.path, load);
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const duration = Number(a.duration) || 0;

  useEffect(() => {
    if (url && load && audioRef.current && !playing) {
      audioRef.current.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const toggle = () => {
    if (!load) {
      setLoad(true);
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, minWidth: 210 }}>
      <button type="button" onClick={toggle} aria-label={playing ? 'Duraklat' : 'Sesli mesajı oynat'} className="cx-tap" style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: t.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {load && !url && !error ? <span className="cx-spinner" aria-hidden="true" style={{ width: 16, height: 16 }} /> : <Icon name={playing ? 'pause' : 'play'} size={17} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={pos}
          aria-label="Sesli mesaj konumu"
          onChange={(e) => {
            const v = Number(e.target.value);
            setPos(v);
            if (audioRef.current) audioRef.current.currentTime = v;
          }}
          style={{ width: '100%', accentColor: t.accent }}
        />
        <div style={{ fontSize: 11, color: t.timeColor }}>{error ? 'Yüklenemedi' : formatDuration(playing || pos ? pos : duration)}</div>
      </div>
      {url ? (
        <audio
          ref={audioRef}
          src={url}
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setPos(0);
          }}
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
          style={{ display: 'none' }}
        />
      ) : null}
    </div>
  );
}

function FileAttachment({ t, a }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        setBusy(true);
        setError(false);
        try {
          await download(a.path, a.name);
        } catch (err) {
          console.warn('[ChatApp] indirme', err);
          setError(true);
        } finally {
          setBusy(false);
        }
      }}
      className="cx-tap"
      style={{ marginTop: 4, padding: '9px 10px', borderRadius: 9, background: 'rgba(128,128,128,.13)', display: 'flex', alignItems: 'center', gap: 10, color: 'inherit', border: 'none', width: 260, maxWidth: '100%', textAlign: 'left' }}
    >
      {busy ? <span className="cx-spinner" aria-hidden="true" /> : <Icon name="file" size={26} color={t.accent} />}
      <span style={{ minWidth: 0, flex: 1 }}>
        <b style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 14 }}>{a.name}</b>
        <small style={{ opacity: 0.72 }}>{error ? 'İndirilemedi, yeniden dene' : formatSize(a.size)}</small>
      </span>
      <Icon name="download" size={18} color={t.textSecondary} />
    </button>
  );
}

export default function Attachment({ t, attachment, onOpenImage }) {
  const type = attachment.type || '';
  if (type.startsWith('image/') && attachment.thumbPath) return <ImageAttachment t={t} a={attachment} onOpen={onOpenImage} />;
  if (type.startsWith('audio/')) return <AudioAttachment t={t} a={attachment} />;
  return <FileAttachment t={t} a={attachment} />;
}

export { download as downloadAttachment, useBlobUrl };
