# Telefona bildirim — kısa kurulum listesi

Kod tarafı hazır ve emülatörde uçtan uca test edildi. Telefona **gerçekten** bildirim gelmesi için
aşağıdaki adımları yalnızca proje sahibi yapabilir (Firebase ve GitHub hesabına giriş gerekir).
Toplam süre yaklaşık 20–30 dakika.

## Şu an neden gelmiyor?

1. **Yayındaki site hâlâ eski sürüm.** Eski sürümde bildirim anahtarı hiç girilmemişti
   (`REPLACE_WITH_VAPID_KEY`), bu yüzden hiçbir telefona bildirim gidemiyordu.
2. **GitHub'daki derlemede Firebase ayarları boş.** Yeni sürüm bu hâliyle yayına çıksaydı
   açılmazdı. Artık `main` dalında eksik ayar varsa derleme kendiliğinden durur.
3. **Bildirimi gönderecek sunucu kurulmamış.** Telefon kapalıyken bildirimi uygulama değil sunucu
   (Cloud Functions) gönderir.

## Adımlar

### 1. Bildirim anahtarını (VAPID) oluştur

1. https://console.firebase.google.com/project/chatapp-d8a5b/settings/cloudmessaging adresini aç.
2. "Firebase Cloud Messaging API (V1)" satırı **Etkin** olmalı.
3. **Web yapılandırması → Web Push sertifikaları → Anahtar çifti oluştur**.
4. Oluşan **Anahtar çifti** değerini kopyala (yaklaşık 88 karakter, genellikle `B` ile başlar).
   "Özel anahtar"ı kopyalama, ona gerek yok.

### 2. GitHub'a 3 değer ekle

Depo → **Settings → Secrets and variables → Actions → New repository secret**. Her biri için
*Name* ve *Secret* alanlarını doldurup **Add secret**'e bas:

| Name | Değer nereden? |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Console → ⚙️ Proje ayarları → Genel → Uygulamalarınız → Web uygulaması → SDK yapılandırması → `apiKey` (`AIza…`) |
| `VITE_FIREBASE_APP_ID` | Aynı yerde `appId` (`1:968851351219:web:…`) |
| `VITE_FIREBASE_VAPID_KEY` | 1. adımda kopyaladığın anahtar |

Diğer değerler (proje kimliği, veritabanı adresi, depolama alanı…) gizli değildir ve
`scripts/write-env.mjs` içinde hazır gelir. App Check kurduğunda `VITE_RECAPTCHA_SITE_KEY` de
ekleyebilirsin (isteğe bağlı).

### 3. GitHub Pages'i "GitHub Actions" ile yayınlayacak şekilde ayarla

Depo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Bu adım birleştirmeden (7. adım) **önce** yapılmalı; yoksa site yeni sürüm yerine kaynak kodunu
yayınlar ve açılmaz.

### 4. Blaze planına geç ve bütçe uyarısı kur

1. Firebase Console sol altta **Spark → Yükselt → Blaze** → faturalandırma hesabı seç/oluştur.
   Bu boyuttaki bir uygulama aylık ücretsiz kotanın içinde kalır.
2. https://console.cloud.google.com/billing → **Bütçeler ve uyarılar → Bütçe oluştur** →
   proje *chatapp-d8a5b* → tutar **1 USD** → eşikler %50/%90/%100 → Kaydet.

### 5. Firestore ve Storage'ı aç (ekler ve fotoğraflar için)

1. Console → **Firestore Database → Veritabanı oluştur** → konum **europe-west1** →
   *Üretim modunda başlat*. (Yalnızca sohbet üyeliği aynası için kullanılır; kurallar her şeyi kapatır.)
2. Console → **Storage → Başlayın** → konum **europe-west1** → *Üretim modunda başlat*.

### 6. Sunucuyu ve kuralları dağıt (Cloud Shell ile, kurulum gerektirmez)

1. https://console.cloud.google.com/?project=chatapp-d8a5b adresini aç → sağ üstte
   **Cloud Shell'i etkinleştir** (`>_` simgesi).
2. Açılan terminale şunları sırayla yapıştır:
   ```bash
   git clone -b claude/asama-1-2-guvenlik-bildirim https://github.com/ilerisoyomer34-coder/chatapp-standalone.git
   cd chatapp-standalone
   npm ci && npm ci --prefix functions
   echo "ENFORCE_APP_CHECK=false" > functions/.env.chatapp-d8a5b
   npx firebase deploy --only functions,database,firestore,storage --project chatapp-d8a5b
   ```
   - Giriş isterse: `npx firebase login --no-localhost` → verilen bağlantıyı aç → kodu yapıştır →
     son komutu yeniden çalıştır.
   - İlk dağıtımda gerekli API'leri açmak için onay sorarsa **Y** de. "Container images cleanup
     policy" sorulursa **1** gün yaz.
   - `ENFORCE_APP_CHECK=false`: App Check (reCAPTCHA) kurulana kadar sunucu App Check istemez.
     Kurduktan sonra bu satırı `true` yapıp yeniden dağıt.
3. Ekler için Storage CORS ayarı (aynı terminalde):
   ```bash
   gcloud storage buckets update gs://chatapp-d8a5b.firebasestorage.app --cors-file=storage.cors.json
   ```
4. Eski kullanıcıların sohbetleri varsa (geçiş betiği çalıştırıldıysa) Storage erişim aynasını doldur:
   `node scripts/migrate-legacy.mjs sync-access` (ayrıntı: `docs/ASAMA-1-2.md` → I).

> ⚠️ Yeni veritabanı kuralları eski sürümü kapatır. 6. adımdan hemen sonra 7. adımı yap.

### 7. Değişiklikleri yayına al

1. GitHub'da **Pull requests → #1 → Merge pull request**.
2. **Actions** sekmesinde "Test, derle ve GitHub Pages'e yayınla" iş akışı yeşil bitmeli
   (2–3 dakika). Kırmızıysa "Firebase yapılandırması" adımındaki mesaj eksik değeri söyler.

### 8. Telefonda dene

**Android (Chrome):**
1. https://ilerisoyomer34-coder.github.io/chatapp-standalone/ → giriş yap.
2. "Bildirimleri aç" → **İzin ver**. (İstersen Chrome menüsü → *Ana ekrana ekle*.)
3. **Ayarlar → Bildirimler → Test bildirimi gönder** → telefonu kilitle → 5 saniye içinde bildirim gelir.

**iPhone (iOS 16.4 ve sonrası):**
1. Siteyi **Safari**'de aç → alttaki **Paylaş** → **Ana Ekrana Ekle**.
2. Uygulamayı **ana ekrandaki simgeden** aç → giriş yap → "Bildirimleri aç" → **İzin Ver**.
3. **Ayarlar → Bildirimler → Test bildirimi gönder** → telefonu kilitle.

Son olarak başka bir hesaptan (ör. bilgisayardan) bu hesaba mesaj gönder; uygulama kapalıyken
bildirim gelmeli ve dokununca doğrudan o sohbet açılmalı.

## Sorun giderme

Ayarlar → Bildirimler → **Sorun giderme** listesi hangi halkanın eksik olduğunu gösterir.

| Görülen | Neden / çözüm |
|---|---|
| Bildirim anahtarı (VAPID): **Eksik** | 2. adımda `VITE_FIREBASE_VAPID_KEY` eklenmemiş. Ekleyip Actions'ta iş akışını yeniden çalıştır. |
| Bu cihazın kaydı: **Kayıtlı değil** | API anahtarı kısıtlanmışsa *Firebase Installations API* ve *FCM Registration API* izinli olmalı (`docs/ASAMA-1-2.md` → F). Sonra "Test bildirimi gönder"e yeniden bas. |
| "Bildirim sunucusuna ulaşılamadı" | 6. adım yapılmamış ya da yarıda kalmış. Console → Functions'ta `sendTestPush`, `onMessageCreated` görünmeli. |
| "Sunucu isteği doğrulayamadı (App Check)" | `ENFORCE_APP_CHECK=false` satırıyla yeniden dağıt ya da App Check'i kur. |
| Test geliyor ama mesaj bildirimi gelmiyor | Alıcı o sohbeti o an açık tutuyorsa bildirim bilerek gönderilmez. Sohbet sessize alınmış veya gönderen engellenmiş olabilir. Console → Functions → Günlükler'de "mesaj işlendi" satırına bak (`skipped` nedeni yazar). |
| iPhone'da hiç izin sorulmuyor | Uygulama Safari sekmesinde açık; ana ekrandaki simgeden açılmalı. Odak (Focus) modu da bildirimleri gizleyebilir. |
| Android'de geç geliyor | Pil tasarrufu Chrome'u kısıtlıyor olabilir: Ayarlar → Uygulamalar → Chrome → Pil → Kısıtlama yok. |

Blaze'e geçmek istemezsen B planı (Cloudflare Worker) için `docs/ASAMA-1-2.md` → 4. bölüme bak.
Ancak ekler ve profil fotoğrafları (Storage) için de Blaze gerekir.
