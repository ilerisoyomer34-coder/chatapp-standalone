# Değişiklik günlüğü

## 2.0.0 — Aşama 1 ve 2 (yayınlanmadı)

### Eklendi
- Firebase Authentication (e-posta + şifre, en az 8 karakter), "Şifremi unuttum", kalıcı oturum.
- Benzersiz kullanıcı adı (`usernames/{ad}` transaction), Türkçe harf dönüşümü, "Profilini tamamla" ekranı.
- uid tabanlı veri modeli ve `database.rules.json` güvenlik kuralları (emülatör testleriyle).
- Telefona bildirim (FCM web push): izin düğmesi, iOS ana ekran rehberi, token yönetimi,
  sohbet başına tek bildirim, bildirime dokununca sohbetin açılması, uygulama içi bant ve ses, simge rozeti.
- Cloud Functions: `onMessageCreated`, `onRequestCreated`, `onRequestUpdated`, `adminSetUserDisabled`.
- B planı: Cloudflare Worker bildirim uç noktası.
- App Check (reCAPTCHA v3).
- Okundu/iletildi bilgisi (`receipts`), "Bağlantı yok" bandı, "Yeni mesaj ↓" düğmesi, çok satırlı mesaj kutusu.
- Eski veriden geçiş betiği (`scripts/migrate-legacy.mjs`) ve kullanıcı duyurusu.
- GitHub Actions: test + derleme + Pages yayını; elle tetiklenen Firebase dağıtımı.

### Değişti
- Tek dosyalık paket/yama yapısı yerine Vite + React kaynak kodu; çalışma anında CDN'den betik yüklenmiyor.
- Inter yazı tipi kendi sunucumuzdan (latin + latin-ext).

### Kaldırıldı
- Veritabanında düz metin şifre, `sessionStorage` ile oturum, localStorage giriş kilidi.
- "Uçtan uca şifreli" gibi doğru olmayan ifadeler.
- Görüntü/sesli arama simgeleri (işlevsizdi), eski `manifest.json` / `manifest-v5.json`.
