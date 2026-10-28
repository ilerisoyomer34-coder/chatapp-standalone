// Teknik hatalar kullanıcıya gösterilmez; yalnızca konsola yazılır.
export const GENERIC_ERROR = 'Bir sorun oluştu, yeniden dene.';

const AUTH_MESSAGES = {
  'auth/invalid-credential': 'E-posta veya şifre hatalı.',
  'auth/wrong-password': 'E-posta veya şifre hatalı.',
  'auth/user-not-found': 'E-posta veya şifre hatalı.',
  'auth/invalid-email': 'Geçerli bir e-posta adresi gir.',
  'auth/email-already-in-use': 'Bu e-posta adresiyle zaten bir hesap var. "Giriş Yap"ı kullan.',
  'auth/weak-password': 'Şifre en az 8 karakter olmalı.',
  'auth/password-does-not-meet-requirements': 'Şifre en az 8 karakter olmalı.',
  'auth/too-many-requests': 'Çok fazla deneme yapıldı. Biraz bekleyip yeniden dene.',
  'auth/network-request-failed': 'İnternet bağlantısı yok. Bağlantını kontrol edip yeniden dene.',
  'auth/user-disabled': 'Bu hesap yönetici tarafından devre dışı bırakıldı.',
  'auth/missing-email': 'E-posta adresi gerekli.',
  'auth/requires-recent-login': 'Güvenlik için yeniden giriş yapman gerekiyor.',
  'auth/operation-not-allowed': 'E-posta ile giriş şu anda kapalı. Lütfen yöneticiye haber ver.',
};

const FUNCTION_MESSAGES = {
  'functions/permission-denied': 'Bu işlem için yetkin yok.',
  'functions/unauthenticated': 'Önce giriş yapmalısın.',
  'functions/not-found': 'Kullanıcı bulunamadı.',
  'functions/failed-precondition': 'Bu işlem şu anda yapılamıyor.',
  'functions/unavailable': 'Sunucuya ulaşılamadı. Biraz sonra yeniden dene.',
};

export function friendlyError(err, context) {
  console.error(`[ChatApp] ${context || 'hata'}`, err);
  const code = err && err.code;
  if (code && AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
  if (code && FUNCTION_MESSAGES[code]) {
    // Sunucu fonksiyonları kullanıcıya uygun Türkçe mesaj döndürür.
    if (err.message && code !== 'functions/unavailable' && code !== 'functions/internal') return err.message;
    return FUNCTION_MESSAGES[code];
  }
  if (code === 'PERMISSION_DENIED' || /permission[_ ]denied/i.test(String(err && err.message))) {
    return 'Bu işlem için yetkin yok.';
  }
  return GENERIC_ERROR;
}
