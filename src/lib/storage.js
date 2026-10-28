// Firebase Storage: ekler, profil ve grup fotoğrafları.
// Sohbet ekleri yalnızca kimliği doğrulanmış istekle (getBlob) indirilir; böylece Storage
// kuralları (yalnızca sohbet üyeleri) her indirmede uygulanır ve veritabanında href tutulmaz.
import { auth, getStorageLazy } from '../firebase.js';
import { isImageType, resizeImage } from './image.js';

export const MAX_ATTACHMENT = 25 * 1024 * 1024;
export const MAX_AVATAR = 2 * 1024 * 1024;

const safeName = (name) =>
  String(name || 'dosya')
    .normalize('NFC')
    .replace(/[\\/#?[\]*\u0000-\u001f]/g, '_')
    .slice(-120) || 'dosya';

// Yüklemeyi başlatır; { promise, cancel } döner. onProgress(0..1).
export function uploadAttachment(chatId, messageId, file, { onProgress } = {}) {
  let task = null;
  let cancelled = false;
  const uid = auth.currentUser && auth.currentUser.uid;
  const base = `chats/${chatId}/${messageId}/`;
  const promise = (async () => {
    const { s, m } = await getStorageLazy();
    const type = file.type || 'application/octet-stream';
    const meta = { contentType: type, customMetadata: { uploader: uid } };
    const out = { name: safeName(file.name), size: file.size, type };
    if (isImageType(type)) {
      try {
        const thumb = await resizeImage(file, 320, { quality: 0.7 });
        out.width = thumb.width;
        out.height = thumb.height;
        out.thumbPath = `${base}thumb.jpg`;
        await m.uploadBytes(m.ref(s, out.thumbPath), thumb.blob, { contentType: 'image/jpeg', customMetadata: { uploader: uid } });
      } catch (err) {
        console.warn('[ChatApp] önizleme oluşturulamadı', err);
      }
    }
    if (cancelled) throw Object.assign(new Error('canceled'), { code: 'storage/canceled' });
    out.path = `${base}f_${out.name}`; // önizleme (thumb.jpg) ile çakışmasın
    task = m.uploadBytesResumable(m.ref(s, out.path), file, meta);
    await new Promise((resolve, reject) => {
      task.on(
        'state_changed',
        (snap) => onProgress && onProgress(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0),
        reject,
        resolve
      );
    });
    return out;
  })();
  return {
    promise,
    cancel() {
      cancelled = true;
      if (task) task.cancel();
    },
  };
}

// path → nesne URL'si (bellekte önbellek).
const blobCache = new Map();
export function blobUrl(path) {
  if (!blobCache.has(path)) {
    const p = getStorageLazy()
      .then(({ s, m }) => m.getBlob(m.ref(s, path)))
      .then((b) => URL.createObjectURL(b));
    p.catch(() => blobCache.delete(path));
    blobCache.set(path, p);
  }
  return blobCache.get(path);
}

export async function fetchBlob(path) {
  const { s, m } = await getStorageLazy();
  return m.getBlob(m.ref(s, path));
}

// Profil fotoğrafı: 512 px'e küçültülür, en fazla 2 MB. Herkese açık indirme adresi döner.
export async function uploadAvatar(uid, file) {
  const { blob } = await resizeImage(file, 512, { square: true, quality: 0.85 });
  if (blob.size > MAX_AVATAR) throw Object.assign(new Error('too-big'), { code: 'too-big' });
  const { s, m } = await getStorageLazy();
  const r = m.ref(s, `avatars/${uid}/avatar.jpg`);
  await m.uploadBytes(r, blob, { contentType: 'image/jpeg' });
  return m.getDownloadURL(r);
}

export async function removeAvatarFile(uid) {
  const { s, m } = await getStorageLazy();
  await m.deleteObject(m.ref(s, `avatars/${uid}/avatar.jpg`)).catch(() => {});
}

export async function uploadGroupPhoto(chatId, file) {
  const { blob } = await resizeImage(file, 512, { square: true, quality: 0.85 });
  const { s, m } = await getStorageLazy();
  const r = m.ref(s, `groups/${chatId}/photo.jpg`);
  await m.uploadBytes(r, blob, { contentType: 'image/jpeg' });
  return m.getDownloadURL(r);
}
