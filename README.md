# ChatApp

Ömer İlerisoy tarafından geliştirilen, WhatsApp benzeri sade bir sohbet uygulaması.
Yayın adresi: https://ilerisoyomer34-coder.github.io/chatapp-standalone/

> **Telefona bildirim gelmesi için** yapılacakların kısa listesi: [docs/TELEFONA-BILDIRIM.md](docs/TELEFONA-BILDIRIM.md)

## Özellikler

- E-posta + şifre ile hesap (Firebase Authentication), şifremi unuttum, kalıcı oturum, benzersiz kullanıcı adı
- Bire bir ve grup sohbeti (en fazla 50 üye, yöneticiler, sistem mesajları), sohbet istekleri (günde en fazla 20)
- Telefona bildirim (Web Push): uygulama kapalıyken ve telefon kilitliyken; sohbet başına tek bildirim,
  dokununca sohbet açılır, sessize alınan sohbetten ve engellenen kişiden bildirim gelmez, simge rozeti
- Mesaj işlemleri: yanıtla, kopyala, düzenle (15 dk), benden/herkesten sil, ilet, tepki; sesli mesaj
- Ekler (25 MB, ilerleme ve iptal), görsellerde küçük resim ve tam ekran görüntüleyici
- Okundu bilgisi (bekliyor / gönderildi / iletildi / okundu), yazıyor göstergesi, çevrimiçi / son görülme
- Sohbet listesi: sabitleme, arşiv, sessize alma (8 saat / 1 hafta / her zaman), okunmamış rozeti
- Eski mesajları 50'şer yükleme, sohbet içinde arama
- Profil fotoğrafı, ad, hakkında, şifre değiştirme, hesabı verileriyle silme, gizlilik ayarları,
  engelleme ve şikâyet, yönetici paneli
- Açık/koyu tema, internetsiz açılış (son sohbetler ve mesajlar), "Yeni sürüm hazır — Yenile" bandı
- Gizlilik politikası, kullanım koşulları ve KVKK aydınlatma metni taslakları

## Mimari

| Katman | Teknoloji |
|---|---|
| İstemci | Vite + React 19, Firebase JS SDK 13 (modüler), servis çalışanı `public/sw.js` |
| Veri | Realtime Database (europe-west1), kurallar `database.rules.json` |
| Dosyalar | Cloud Storage, kurallar `storage.rules`; üyelik aynası için Firestore (`firestore.rules`) |
| Sunucu | Cloud Functions 2. nesil, Node.js 22, TypeScript — `functions/` |
| B planı | Cloudflare Worker bildirim uç noktası — `worker/` |
| Yayın | GitHub Actions → GitHub Pages (`/chatapp-standalone/`) |

Veri modeli uid tabanlıdır (`users`, `usernames`, `requests`, `chats`, `userChats`, `messages`, `typing`,
`receipts`, `presence`, `pushTokens`, `blocks`, `settings`, `reports`, `admins`…). İstemci kök düğümü asla
dinlemez; yalnızca kendi sohbet listesini ve açık sohbetin son 50 mesajını dinler.

Klasörler:

```
src/            React uygulaması (components/, screens/, hooks/, lib/)
public/         sw.js, manifest, ikonlar, yasal sayfalar, 404.html
functions/      Cloud Functions (src/, test/)
worker/         B planı Cloudflare Worker
scripts/        geçiş betiği (migrate-legacy.mjs), CI yapılandırma betiği (write-env.mjs)
tests/          güvenlik kuralı, Storage, Worker ve geçiş testleri
docs/           aşama belgeleri, kurulum ve rapor eşlemesi
```

## Kurulum (geliştirme)

Gerekenler: Node.js 22, (emülatör testleri için) Java 21.

```bash
cp .env.example .env      # değerleri doldur
npm ci
npm ci --prefix functions
npm run dev               # http://localhost:5173/chatapp-standalone/
```

### Ortam değişkenleri (`.env`)

| Değişken | Nereden |
|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID` | Firebase Console → ⚙️ Proje ayarları → Genel → Web uygulaması → SDK yapılandırması |
| `VITE_FIREBASE_AUTH_DOMAIN`, `…_DATABASE_URL`, `…_PROJECT_ID`, `…_STORAGE_BUCKET`, `…_MESSAGING_SENDER_ID` | Aynı yer (`.env.example`'da hazır) |
| `VITE_FIREBASE_VAPID_KEY` | Proje ayarları → Cloud Messaging → Web Push sertifikaları → Anahtar çifti |
| `VITE_RECAPTCHA_SITE_KEY` | App Check → reCAPTCHA v3 site anahtarı (isteğe bağlı) |
| `VITE_PUSH_WORKER_URL` | Yalnızca B planında Worker adresi |

Bu değerlerin hiçbiri sır değildir (tarayıcıya gönderilirler); yine de depoya `.env` girmez.
Servis hesabı anahtarları **asla** depoya konmaz (`.gitignore`).

### Emülatörlerle yerel geliştirme

```bash
echo "ENFORCE_APP_CHECK=false" > functions/.env.local     # emülatörde App Check yok
npm run build:functions
npx firebase emulators:start --only auth,database,firestore,storage,functions --project chatapp-d8a5b
# ikinci terminal:
VITE_USE_EMULATORS=true npm run dev
```

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` / `npm run preview` | Üretim derlemesi / önizleme |
| `npm run lint` | ESLint |
| `npm run format` / `npm run format:check` | Prettier ile biçimlendir / denetle |
| `npm test` | Birim testleri (Vitest) |
| `npm run test:emulator` | Güvenlik kuralları, Storage kuralları, fonksiyonlar, Worker ve geçiş betiği testleri (Firebase Emulator) |

## Yayın ve dağıtım

1. **Web:** `main` dalına her birleştirmede GitHub Actions test eder, derler ve GitHub Pages'e yayınlar.
   Depo → Settings → Pages → Source **GitHub Actions** olmalı. Firebase web yapılandırması depo
   *Secrets* veya *Variables* içinden okunur (en az `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`,
   `VITE_FIREBASE_VAPID_KEY`); eksikse `main` yayını durur.
2. **Kurallar ve fonksiyonlar** (Blaze planı gerekir):
   ```bash
   npx firebase deploy --only functions,database,firestore,storage --project chatapp-d8a5b
   ```
   ya da Actions → "Firebase dağıtımı (kurallar ve fonksiyonlar)" → *Run workflow*
   (`FIREBASE_SERVICE_ACCOUNT` gizli değişkeni gerekir).
3. **Storage CORS** (bir kez):
   `gcloud storage buckets update gs://chatapp-d8a5b.firebasestorage.app --cors-file=storage.cors.json`

Blaze'e geçiş, 1 USD bütçe uyarısı, VAPID anahtarı, App Check, API anahtarı kısıtlaması ve B planı (Worker)
adımları: [docs/ASAMA-1-2.md](docs/ASAMA-1-2.md). Aşama 3–7: [docs/ASAMA-3-7.md](docs/ASAMA-3-7.md).

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Telefona bildirim gelmiyor | Uygulamada **Ayarlar → Bildirimler → Sorun giderme** listesine ve [docs/TELEFONA-BILDIRIM.md](docs/TELEFONA-BILDIRIM.md) tablosuna bak. |
| iPhone'da bildirim izni sorulmuyor | Uygulama Safari'den **Ana Ekrana Ekle** ile eklenip ana ekran simgesinden açılmalı (iOS 16.4+). |
| Actions'ta "Firebase yapılandırması" adımı kırmızı | Mesajda adı geçen değeri depo *Secrets/Variables*'a ekle. |
| Site açılmıyor, kaynak kod görünüyor | Settings → Pages → Source **GitHub Actions** değil. |
| Grup kurma / hesap silme "sunucuya ulaşılamadı" | Fonksiyonlar dağıtılmamış ya da App Check zorunlu ama kurulmamış (`ENFORCE_APP_CHECK=false` ile yeniden dağıt). |
| Ek yüklenmiyor / görsel açılmıyor | Storage etkin değil, `storage` kuralları dağıtılmamış ya da CORS ayarı yapılmamış. |
| "Yetkin yok" hataları | `database.rules.json` dağıtılmamış veya eski sürümden kalma veri; geçiş betiğine bak (`docs/ASAMA-1-2.md` → I). |
| `npm run test:emulator` başlamıyor | Java 21 kurulu olmalı; 9000/9099/8080/9199 portları boş olmalı. |

## Lisans ve emek

Geliştiren: **Ömer İlerisoy**. Değişiklikler için [CHANGELOG.md](CHANGELOG.md).
