// Teknik hatalar kullanıcıya gösterilmez; yalnızca konsola yazılır.
export const GENERIC_ERROR = 'Bir sorun oluştu, yeniden dene.';

const MESSAGES = {
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
  'auth/missing-password': 'Şifre gerekli.',
  'auth/requires-recent-login': 'Güvenlik için yeniden giriş yapman gerekiyor.',
  'auth/operation-not-allowed': 'E-posta ile giriş şu anda kapalı. Lütfen yöneticiye haber ver.',
  'quota-exceeded': 'Bugün en fazla 20 sohbet isteği gönderebilirsin. Yarın yeniden dene.',
  'username-taken': 'Bu kullanıcı adı alınmış. Başka bir ad dene.',
  'storage/unauthorized': 'Bu dosyaya erişim yetkin yok.',
  'storage/quota-exceeded': 'Depolama kotası doldu. Lütfen yöneticiye haber ver.',
  'storage/retry-limit-exceeded': 'Yükleme tamamlanamadı. Bağlantını kontrol edip yeniden dene.',
  'storage/object-not-found': 'Dosya bulunamadı; silinmiş olabilir.',
  'messaging/permission-blocked': 'Bildirim izni engellenmiş.',
  'messaging/permission-default': 'Bildirim izni verilmedi.',
  'messaging/token-subscribe-failed': 'Bu cihaz bildirimlere kaydedilemedi. Biraz sonra yeniden dene.',
  'messaging/failed-service-worker-registration': 'Bildirim servisi başlatılamadı. Sayfayı yenileyip yeniden dene.',
  'messaging/unsupported-browser': 'Bu tarayıcı bildirimleri desteklemiyor.',
  'functions/unauthenticated': 'Önce giriş yapmalısın.',
  'functions/unavailable': 'Sunucuya ulaşılamadı. Biraz sonra yeniden dene.',
  'functions/internal': GENERIC_ERROR,
};

export function friendlyError(err, context) {
  console.error(`[ChatApp] ${context || 'hata'}`, err);
  const code = err && err.code;
  // Sunucu fonksiyonları kullanıcıya uygun Türkçe mesaj döndürür (permission-denied, failed-precondition…).
  if (code && code.startsWith('functions/') && !MESSAGES[code] && err.message && /[ğüşıöçĞÜŞİÖÇ ]/.test(err.message)) {
    return err.message;
  }
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (code === 'PERMISSION_DENIED' || /permission[_ ]denied/i.test(String(err && err.message))) {
    return 'Bu işlem için yetkin yok.';
  }
  return GENERIC_ERROR;
}
