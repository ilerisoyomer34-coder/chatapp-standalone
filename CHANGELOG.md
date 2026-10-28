# Değişiklik günlüğü

Biçim: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/). Sürümler [SemVer](https://semver.org/lang/tr/) izler.

## 2.0.0 — Yeni sürüm (yayınlanmadı)

Uygulama baştan yazıldı. Eski hesaplar güvenli sayılmadığı için kullanıcılar yeniden kayıt olur
(duyuru: `docs/duyuru.md`).

### Eklendi

**Aşama 1 — Kimlik ve güvenlik**
- Firebase Authentication (e-posta + şifre, en az 8 karakter), "Şifremi unuttum", kalıcı oturum.
- Benzersiz kullanıcı adı (`usernames/{ad}` transaction), Türkçe harf dönüşümü, "Profilini tamamla" ekranı.
- uid tabanlı veri modeli ve `database.rules.json` güvenlik kuralları (emülatör testleriyle).
- Yönetici paneli: `admins/{uid}` + `adminSetUserDisabled` callable fonksiyonu; çıkarılan kullanıcının oturumu anında kapanır.
- App Check (reCAPTCHA v3).
- Eski veriden geçiş betiği (`scripts/migrate-legacy.mjs`) ve kullanıcı duyurusu.

**Aşama 2 — Telefona bildirim**
- FCM web push: "Bildirimleri aç" düğmesi, iOS ana ekran rehberi, token yönetimi, çıkışta token silme.
- Sohbet başına tek bildirim, bildirime dokununca sohbetin açılması, uygulama içi bant ve ses, simge rozeti.
- Cloud Functions: `onMessageCreated`, `onRequestCreated`, `onRequestUpdated`; B planı Cloudflare Worker.
- Ayarlar → Bildirimler: **Test bildirimi gönder** ve **Sorun giderme** listesi (`sendTestPush`).

**Aşama 3 — Hata düzeltmeleri**
- Okundu bilgisi (bekliyor / gönderildi / iletildi / okundu), "Bağlantı yok" bandı, "Yeni mesaj ↓" düğmesi.
- Otomatik büyüyen mesaj kutusu (en fazla 5 satır), "yazıyor" göstergesi bağlantı kopunca ve 4 sn sonra kalkar.
- `tr-TR` tarih biçimleri ve gün ayırıcıları, takvime göre "Dün", kalıcı tema tercihi (sistem temasını izler).

**Aşama 4 — Eksik özellikler**
- Ayarlar ve profil: profil fotoğrafı (512 px, 2 MB), ad, hakkında, şifre değiştirme, hesabı verileriyle
  silme, bildirim önizleme, son görülme ve çevrimiçi gizliliği, engellenenler listesi.
- Ekler Firebase Storage'da (25 MB, ilerleme, iptal), küçük resim ve tam ekran görüntüleyici,
  yalnızca sohbet üyelerinin erişebildiği Storage kuralları.
- Mesaj işlemleri: uzun basma menüsü, yanıtla, kopyala, düzenle (15 dk), benden/herkesten sil, ilet, 6 tepki.
- Sesli mesaj (basılı tut, kaydırarak iptal, oynatıcı).
- Sohbet listesi: sabitleme, arşiv, sessize alma, okunmamış rozeti, uzun basma menüsü.
- 50'şer mesaj yükleme, sohbet içinde arama; çevrimiçi / son görülme.
- Engelleme, şikâyet, günde 20 istek sınırı.
- Grup sohbeti (50 üye, ad/fotoğraf, yöneticiler, üye ekle/çıkar, ayrıl, sistem mesajları).
- Gizlilik politikası, kullanım koşulları ve KVKK aydınlatma metni taslakları.

**Aşama 6 — Performans ve PWA**
- Kod bölme; React ve Firebase ayrı, uzun süre önbellekte kalan parçalar (ilk yükleme ~191 KB gzip).
- Servis çalışanı derleme çıktısını önbelleğe alır; uygulama internetsiz açılır (son sohbetler ve mesajlar).
- "Yeni sürüm hazır — Yenile" bandı.
- Manifest: `lang: tr`, maskable ikonlar, tek renkli rozet, ekran görüntüleri, kısayollar.
- og:image (1200×630), 404.html, güncel sitemap. Mobil Lighthouse: Performans 93, En İyi Uygulamalar 96.

**Aşama 7 — Kalite**
- ESLint + Prettier, Vitest birim testleri, Firebase Emulator testleri (121 test).
- GitHub Actions: her push'ta denetim + test + derleme; `main`'de Pages yayını; elle tetiklenen Firebase dağıtımı.
- `main` yayınında Firebase yapılandırması eksikse derleme durur (`scripts/write-env.mjs`).
- README, aşama belgeleri, rapor eşlemesi (`docs/RAPOR-DURUMU.md`).

### Değişti
- Tek dosyalık paket/yama yapısı yerine Vite + React kaynak kodu; çalışma anında CDN'den betik yüklenmiyor.
- Firebase JS SDK 10 compat → 13 modüler.
- Inter yazı tipi kendi sunucumuzdan (latin + latin-ext).
- Açık temada metin olarak kullanılan yeşil ve gri tonlar okunabilirlik için koyulaştırıldı.

### Kaldırıldı
- Veritabanında düz metin şifre, `sessionStorage` ile oturum, localStorage giriş kilidi.
- Kök düğümün dinlenmesi; ekler için veritabanında base64.
- "Uçtan uca şifreli" gibi doğru olmayan ifadeler.
- Görüntülü/sesli arama simgeleri (işlevsizdi), eski `manifest.json` / `manifest-v5.json` ve kullanılmayan ikonlar.
