# Eksik ve Hata Raporu (28 Ekim 2026) — madde madde durum

52 maddenin 49'u kodda çözüldü ve test edildi. 2 madde için (1.8 API anahtarı/App Check, 2.2 VAPID anahtarı)
kod hazır, ancak anahtarların Console'da oluşturulması gerekiyor. 1 madde (5.6 sesli/görüntülü arama) raporun
önerisiyle ileriye bırakıldı. Bazı maddelerin canlıda geçerli olması için Firebase/GitHub ayarları gerekir
(bkz. [TELEFONA-BILDIRIM.md](TELEFONA-BILDIRIM.md), [ASAMA-1-2.md](ASAMA-1-2.md) §3, [ASAMA-3-7.md](ASAMA-3-7.md) §3).

Durum: ✅ kodda çözüldü ve test edildi · ⚙️ kod hazır, Console/GitHub adımı gerekli · ⏭️ ileriye bırakıldı

## 1. Güvenlik

| # | Önem | Madde | Durum | Nasıl |
|---|---|---|---|---|
| 1.1 | Kritik | Veritabanının tamamı herkese iniyor | ✅ ⚙️ | Kök asla dinlenmiyor; kullanıcıya özel dinleyiciler; `database.rules.json` giriş yapmayana her şeyi kapatıyor (emülatör testi: `/.json` okunamıyor). Kuralların dağıtılması gerekir. |
| 1.2 | Kritik | Şifreler düz metin | ✅ | Firebase Authentication; veritabanında şifre alanı yok; en az 8 karakter. |
| 1.3 | Kritik | Şifresiz giriş, hesap taklidi | ✅ | Oturumu Firebase Auth yönetiyor; kurallar `auth.uid` ile doğruluyor; `sessionStorage` kullanılmıyor. |
| 1.4 | Kritik | Yönetici yetkisi istemcide | ✅ | `admins/{uid}` + kurallar; çıkarma/geri alma `adminSetUserDisabled` fonksiyonuyla; `from == auth.uid` zorunlu. |
| 1.5 | Kritik | Gerçek olmayan "uçtan uca şifreli" | ✅ | İfadeler kaldırıldı; "Bağlantın şifreli (HTTPS)". Gerçek E2EE için [ASAMA-5-E2EE.md](ASAMA-5-E2EE.md) (onay bekliyor). |
| 1.6 | Yüksek | Kaba kuvvet koruması aşılabilir | ✅ | localStorage kilidi kaldırıldı; Firebase Auth'un sunucu taraflı koruması. |
| 1.7 | Yüksek | Ek bağlantısında betik riski | ✅ | Ekler Storage'da; veritabanında yalnızca Storage yolu (kurallar biçimi denetliyor); indirme `getBlob` ile, `href`'e veritabanı değeri yazılmıyor. |
| 1.8 | Orta | API anahtarı kısıtlaması / App Check | ⚙️ | App Check (reCAPTCHA v3) istemcide hazır; anahtar kısıtlama ve App Check kayıt adımları ASAMA-1-2.md §E–F. |

## 2. Telefona bildirim

| # | Önem | Madde | Durum | Nasıl |
|---|---|---|---|---|
| 2.1 | Kritik | Bildirim kütüphanesi yüklenmiyor | ✅ | Yama yapısı kaldırıldı; `firebase/messaging` modüler içe aktarılıyor. |
| 2.2 | Kritik | VAPID yer tutucu | ⚙️ | `.env` / GitHub Secrets'tan; eksikse `main` yayını durur, uygulamada "Sorun giderme" eksikliği gösterir. Anahtarın Console'da oluşturulması gerekir. |
| 2.3 | Kritik | Bildirimi gönderen sunucu yok | ✅ ⚙️ | Cloud Functions (`onMessageCreated`, istek tetikleyicileri) ve B planı Worker; dağıtım gerekir (Blaze). |
| 2.4 | Yüksek | İzin isteği dokunuşsuz | ✅ | Yalnızca "Bildirimleri aç" düğmesiyle (Ayarlar ve ilk girişteki kart). |
| 2.5 | Yüksek | iOS rehberi yok | ✅ | Safari sekmesinde "Paylaş → Ana Ekrana Ekle" rehberi; izin düğmesi yalnızca ana ekran uygulamasında. |
| 2.6 | Orta | Bildirim davranışı eksikleri | ✅ | Dokununca sohbet açılır, çıkışta token silinir, geçersiz token temizliği, sessize alma, açık sohbette bastırma, rozet; ayrıca test bildirimi. |

## 3. Veri ve senkronizasyon

| # | Önem | Madde | Durum | Nasıl |
|---|---|---|---|---|
| 3.1 | Yüksek | saveDB her şeyin üzerine yazıyor | ✅ | Tüm yazmalar `update()` ile yalnızca ilgili yollara. |
| 3.2 | Yüksek | Sohbetler iki anahtarla | ✅ | Tek, kimlik tabanlı model (`chats/{chatId}`); geçiş betiği eski sohbetleri bağlar. |
| 3.3 | Yüksek | Okunmamış sayacında yarış | ✅ | Sunucuda `ServerValue.increment(1)`; yalnızca ilgili alana yazma. |
| 3.4 | Orta | Cihaz saati, sıralama yok | ✅ | `ServerValue.TIMESTAMP` (kurallar `ts == now` istiyor) + `orderByChild('ts')`; 15 dk/24 saat hesapları sunucu saat farkıyla. |
| 3.5 | Yüksek | Ekler base64 | ✅ | Firebase Storage (25 MB), mesajda yalnızca yol, ad, boyut, tür. |
| 3.6 | Orta | "Yazıyor…" takılı kalıyor | ✅ | `onDisconnect().remove()` + 4 sn hareketsizlikte kalkar. |
| 3.7 | Orta | Çıkarılan kullanıcı oturumda kalıyor | ✅ | Auth hesabı devre dışı + `users/{uid}/disabled` dinleniyor, oturum anında kapanıyor; kurallar da reddediyor. |
| 3.8 | Yüksek | Noktalı kullanıcı adı | ✅ | `^[a-z0-9_]{3,20}$`, Türkçe harf dönüşümü (birim testli). |
| 3.9 | Düşük | Hatalı deneme sayacı | ✅ | Kilit mekanizması kaldırıldı (Firebase Auth). |
| 3.10 | Düşük | Çevrimiçi kaydı tek cihazlı | ✅ | `presence/{uid}/connections/{id}`; başlıkta çevrimiçi / son görülme. |
| 3.11 | Düşük | Kullanıcı adı yarışı | ✅ | `usernames/{ad}` transaction (kural testli). |

## 4. Arayüz ve kullanım

| # | Önem | Madde | Durum | Nasıl |
|---|---|---|---|---|
| 4.1 | Yüksek | Ekran en alta zıplıyor | ✅ | Yalnızca en alttaysan veya kendi mesajını gönderdiysen; "Yeni mesaj ↓". |
| 4.2 | Orta | Tek satırlık mesaj alanı | ✅ | Otomatik büyüyen textarea (5 satır), masaüstü/mobil Enter davranışı. |
| 4.3 | Düşük | Boş gönder düğmesi emoji | ✅ | Boşken sesli mesaj düğmesi. |
| 4.4 | Orta | Görsel önizleme yok | ✅ | Küçük resim + tam ekran görüntüleyici; indirme `getBlob` (iOS'ta çalışır). |
| 4.5 | Düşük | Tarih gösterimi | ✅ | `tr-TR`, gün ayırıcıları, takvime göre "Dün", eski tarihlerde yıl. |
| 4.6 | Orta | Çevrimiçi/son görülme yok | ✅ | Başlıkta, gizlilik ayarına uyarak (karşılıklılık kuralıyla). |
| 4.7 | Orta | Oturum düşüyor | ✅ | Firebase Auth kalıcı oturumu. |
| 4.8 | Düşük | Tema kaydedilmiyor | ✅ | Tercih kaydediliyor; seçilmemişse sistem teması izleniyor. |
| 4.9 | Orta | Yakınlaştırma kapalı | ✅ | `maximum-scale` ve `user-scalable=no` kaldırıldı. |
| 4.10 | Düşük | İngilizce/teknik metinler | ✅ | Türkçe yükleme ekranı ve `noscript`; teknik hatalar yalnızca konsolda, kullanıcıya Türkçe mesaj. |
| 4.11 | Düşük | Türkçe büyük/küçük harf | ✅ | `toLocaleLowerCase/UpperCase('tr-TR')`. |
| 4.12 | Orta | Gönderim durumu, çevrimdışı uyarısı | ✅ | Bekliyor/gönderildi/iletildi/okundu; "Bağlantı yok…" bandı. |

## 5. Eksik özellikler

| # | Önem | Madde | Durum | Nasıl |
|---|---|---|---|---|
| 5.1 | Orta | Hesap ve profil | ✅ | Ayarlar: fotoğraf, ad, hakkında, şifre değiştirme, şifremi unuttum, hesabı verileriyle silme. |
| 5.2 | Orta | Engelleme, şikâyet, spam | ✅ | Engelleme listesi, şikâyet + yönetici paneli, günde 20 istek (kurallarla). |
| 5.3 | Orta | Mesaj özellikleri | ✅ | Sil/düzenle, yanıtla, tepki, ilet, sesli mesaj, sohbette arama. |
| 5.4 | Orta | Sohbet yönetimi, grup | ✅ | Sabitle, arşivle, sessize al; gerçek grup sohbeti (50 üye). |
| 5.5 | Orta | Uzun sohbetler, iletildi/okundu | ✅ | `limitToLast(50)` + yukarı kaydırınca 50 daha; iletildi ve okundu ayrı. |
| 5.6 | Düşük | Sesli/görüntülü arama | ⏭️ | Rapor önerisiyle ileriye bırakıldı (WebRTC + TURN sunucusu gerektirir). |
| 5.7 | Orta | Yasal sayfalar | ✅ ⚙️ | Gizlilik, koşullar, KVKK taslakları (europe-west1 notuyla); yayından önce hukuk uzmanı kontrolü ve iletişim bilgisi gerekli. |

## 6. Performans ve PWA

| # | Önem | Madde | Durum | Nasıl |
|---|---|---|---|---|
| 6.1 | Orta | Paketin yarısı kullanılmıyor | ✅ | Vite derlemesi, kod bölme; ilk yükleme ~191 KB gzip; Inter yalnızca latin + latin-ext. |
| 6.2 | Yüksek | İnternetsiz açılmıyor, unpkg | ✅ | React ve Firebase pakette; servis çalışanı derleme çıktısını önbelleğe alıyor; son sohbetler ve mesajlar IndexedDB'de. |
| 6.3 | Orta | Eski SDK, çift yükleme | ✅ | Firebase JS SDK 13 modüler, tek yükleme. |
| 6.4 | Orta | Kök dinleme yavaşlar | ✅ | Kullanıcıya özel dinleyiciler, ortak profil/sohbet önbelleği. |
| 6.5 | Düşük | SW güncellemesi | ✅ | "Yeni sürüm hazır — Yenile" bandı; eski manifest ve ikonlar silindi; eski önbellekler temizleniyor. |
| 6.6 | Düşük | Manifest ve paylaşım bilgileri | ✅ | maskable ikonlar, tek renkli rozet, `lang: tr`, og:image, Türkçe karakterli metinler, güncel sitemap. |

## 7. Kod yapısı ve bakım

| # | Önem | Madde | Durum | Nasıl |
|---|---|---|---|---|
| 7.1 | Yüksek | Metin yamaları | ✅ | Kaynak dosyalara ayrıldı (`src/`, `functions/`, `worker/`). |
| 7.2 | Orta | Test, belge, sürümleme yok | ✅ | README, CHANGELOG, kurallar depoda, 14 birim + 121 emülatör testi, ESLint + Prettier, GitHub Actions. |

## Genel kabul ölçütleri

| Ölçüt | Durum |
|---|---|
| Giriş yapmamış biri `/.json`'dan veri okuyamıyor | ✅ kural testi (kurallar dağıtılınca canlıda geçerli) |
| Üye olmadığı sohbeti okuyamıyor, başkası adına yazamıyor | ✅ kural testleri |
| sessionStorage/localStorage ile başka hesaba girilemiyor | ✅ oturum Firebase Auth'ta |
| Hiçbir yerde düz metin şifre yok | ✅ |
| İnternetsiz açılıyor, son sohbetler görünüyor | ✅ tarayıcı testiyle doğrulandı |
| Aşama 2 bildirim ölçütleri | ✅ emülatör + servis çalışanı testleri; canlıda [TELEFONA-BILDIRIM.md](TELEFONA-BILDIRIM.md) adımlarından sonra |
| Tüm arayüz metinleri Türkçe | ✅ |
