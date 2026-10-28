// Görselleri tarayıcıda küçültme (profil fotoğrafı 512 px, ek önizlemesi 320 px).
async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* aşağıdaki yönteme düş */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Kare kırpmadan, uzun kenarı en fazla maxSize olacak şekilde küçültür.
export async function resizeImage(file, maxSize, { type = 'image/jpeg', quality = 0.82, square = false } = {}) {
  const src = await decode(file);
  const w = src.width;
  const h = src.height;
  let sx = 0;
  let sy = 0;
  let sw = w;
  let sh = h;
  if (square) {
    const side = Math.min(w, h);
    sx = (w - side) / 2;
    sy = (h - side) / 2;
    sw = side;
    sh = side;
  }
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const tw = Math.max(1, Math.round(sw * scale));
  const th = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, tw, th);
  if (src.close) src.close();
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), type, quality)
  );
  return { blob, width: w, height: h };
}

export const isImageType = (type) => /^image\/(jpeg|png|gif|webp|avif|bmp|heic|heif)$/i.test(type || '');
