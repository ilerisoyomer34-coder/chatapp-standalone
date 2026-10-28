// Tarih/saat ve boyut biçimlendirme (tr-TR).
const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const weekdayFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' });
const shortDateFmt = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const longDateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });
const longDateYearFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// Takvim günü farkı (saat farkına göre değil): dün 23:59 → "Dün".
export function dayDiff(ts, now = Date.now()) {
  return Math.round((startOfDay(new Date(now)) - startOfDay(new Date(ts))) / 86400000);
}

export function formatTime(ts) {
  return ts ? timeFmt.format(new Date(ts)) : '';
}

// Sohbet listesi: bugün → saat, dün → "Dün", son 7 gün → gün adı, daha eski → tarih.
export function formatListTime(ts, now = Date.now()) {
  if (!ts) return '';
  const diff = dayDiff(ts, now);
  if (diff <= 0) return formatTime(ts);
  if (diff === 1) return 'Dün';
  if (diff < 7) return capitalizeTr(weekdayFmt.format(new Date(ts)));
  return shortDateFmt.format(new Date(ts));
}

// Sohbet içi gün ayırıcı: "Bugün", "Dün", gün adı veya tam tarih (eski yıllarda yıl ile).
export function formatDaySeparator(ts, now = Date.now()) {
  const diff = dayDiff(ts, now);
  if (diff <= 0) return 'Bugün';
  if (diff === 1) return 'Dün';
  if (diff < 7) return capitalizeTr(weekdayFmt.format(new Date(ts)));
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return (sameYear ? longDateFmt : longDateYearFmt).format(new Date(ts));
}

export function capitalizeTr(s) {
  return s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s;
}

export function formatSize(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KB`;
  return `${(b / 1048576).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
}

export function initials(name) {
  return (
    String(name || '?')
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0))
      .slice(0, 2)
      .join('')
      .toLocaleUpperCase('tr-TR') || '?'
  );
}

const PALETTE = ['#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#00838F', '#00897B', '#43A047', '#F57C00', '#6D4C41', '#546E7A'];
export function colorFor(key) {
  let h = 0;
  const s = String(key || 'x');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// "son görülme bugün 14:05" / "dün 09:12" / "12.10.2026 18:00"
export function formatLastSeen(ts, now = Date.now()) {
  if (!ts) return '';
  const diff = dayDiff(ts, now);
  if (diff <= 0) return `son görülme bugün ${formatTime(ts)}`;
  if (diff === 1) return `son görülme dün ${formatTime(ts)}`;
  return `son görülme ${shortDateFmt.format(new Date(ts))} ${formatTime(ts)}`;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Sohbet listesi / bildirim önizlemesi.
export function messagePreview(msg) {
  if (!msg) return '';
  if (msg.deleted) return 'Bu mesaj silindi';
  if (msg.system) return msg.text || '';
  const text = (msg.text || '').replace(/\s+/g, ' ').trim();
  if (text) return text;
  const a = msg.attachment;
  if (!a) return '';
  if ((a.type || '').startsWith('image/')) return '📷 Fotoğraf';
  if ((a.type || '').startsWith('audio/')) return '🎤 Sesli mesaj';
  return `📎 ${a.name || 'Dosya'}`;
}
