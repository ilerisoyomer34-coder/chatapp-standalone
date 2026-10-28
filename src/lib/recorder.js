// Sesli mesaj kaydı (MediaRecorder). Safari audio/mp4, diğerleri audio/webm (Opus) üretir.
const CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];

export const canRecord = () => typeof window !== 'undefined' && !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

function pickMime() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  return CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  const started = performance.now();
  rec.start(250);
  const release = () => stream.getTracks().forEach((tr) => tr.stop());
  return {
    started,
    stop() {
      return new Promise((resolve) => {
        rec.onstop = () => {
          release();
          const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
          const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
          const blob = new Blob(chunks, { type });
          const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
          resolve({ file: new File([blob], `sesli-mesaj-${stamp}.${ext}`, { type }), duration: (performance.now() - started) / 1000 });
        };
        rec.stop();
      });
    },
    cancel() {
      rec.onstop = release;
      try {
        rec.stop();
      } catch {
        release();
      }
    },
  };
}
