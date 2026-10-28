// Bildirim ve sohbet listesi metinleri (istemcideki src/lib/format.js ile aynı biçim).

export interface Attachment {
  name?: string;
  type?: string;
  size?: number;
}

export interface ChatMessage {
  from?: string;
  text?: string;
  ts?: number;
  deleted?: boolean;
  system?: string;
  attachment?: Attachment;
}

// Sunucunun yazdığı grup sistem mesajı türleri; yalnızca bunlar okunmamış sayar ve bildirim gönderir.
export const NOTIFYING_SYSTEM_TYPES = new Set(['created', 'added']);

export function truncate(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max).join('') + '…' : value;
}

function cleanText(msg: ChatMessage): string {
  return typeof msg.text === 'string' ? msg.text.replace(/\s+/g, ' ').trim() : '';
}

function attachmentKind(a: Attachment): 'image' | 'audio' | 'file' {
  const type = a.type || '';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
}

// Sohbet listesindeki "son mesaj" önizlemesi (en fazla 200 karakter).
export function messagePreview(msg: ChatMessage): string {
  if (msg.deleted) return 'Bu mesaj silindi';
  const text = cleanText(msg);
  if (text) return truncate(text, 199);
  if (!msg.attachment) return '';
  const kind = attachmentKind(msg.attachment);
  if (kind === 'image') return '📷 Fotoğraf';
  if (kind === 'audio') return '🎤 Sesli mesaj';
  return truncate(`📎 ${msg.attachment.name || 'Dosya'}`, 199);
}

// Bildirim gövdesi: mesajın ilk 100 karakteri; ek varsa "Fotoğraf", "Dosya: ad" veya "Sesli mesaj".
export function notificationBody(msg: ChatMessage): string {
  const text = cleanText(msg);
  if (!msg.attachment) return text ? truncate(text, 100) : 'Yeni mesaj';
  const kind = attachmentKind(msg.attachment);
  const label = kind === 'image' ? 'Fotoğraf' : kind === 'audio' ? 'Sesli mesaj' : `Dosya: ${msg.attachment.name || 'dosya'}`;
  return truncate(text ? `${label}: ${text}` : label, 100);
}

export function isMuted(value: unknown, now = Date.now()): boolean {
  return value === true || (typeof value === 'number' && value > now);
}

export const chatIdFor = (a: string, b: string): string => [a, b].sort().join('_');
