// Kullanıcı adı ve görünen ad kuralları (veritabanı kurallarıyla aynı).
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const NAME_MAX = 40;
export const PASSWORD_MIN = 8;

const TR_TO_ASCII = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

// "Ömer İlerisoy" → "omer_ilerisoy". Türkçe harfler ASCII karşılığına dönüşür.
export function normalizeUsername(raw) {
  return String(raw ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => TR_TO_ASCII[c])
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export function usernameError(username) {
  if (!username) return 'Kullanıcı adı gerekli.';
  if (username.length < USERNAME_MIN) return `Kullanıcı adı en az ${USERNAME_MIN} karakter olmalı.`;
  if (username.length > USERNAME_MAX) return `Kullanıcı adı en fazla ${USERNAME_MAX} karakter olabilir.`;
  if (!/^[a-z0-9_]+$/.test(username)) return 'Kullanıcı adında yalnızca harf, rakam ve alt çizgi (_) olabilir.';
  return null;
}

export function displayNameError(name) {
  const n = String(name ?? '').trim();
  if (!n) return 'Görünen ad gerekli.';
  if (n.length > NAME_MAX) return `Görünen ad en fazla ${NAME_MAX} karakter olabilir.`;
  return null;
}

export function passwordError(pass) {
  if (!pass) return 'Şifre gerekli.';
  if (pass.length < PASSWORD_MIN) return `Şifre en az ${PASSWORD_MIN} karakter olmalı.`;
  return null;
}

export function emailError(email) {
  const e = String(email ?? '').trim();
  if (!e) return 'E-posta adresi gerekli.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'Geçerli bir e-posta adresi gir.';
  return null;
}
