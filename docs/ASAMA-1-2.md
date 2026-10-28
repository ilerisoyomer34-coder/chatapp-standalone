# Aşama 1 ve 2 — Kimlik/Güvenlik ve Telefona Bildirim

Bu belge Aşama 1 (Firebase Authentication, uid tabanlı veri modeli, güvenlik kuralları) ve
Aşama 2 (Firebase Cloud Messaging ile web push) için yapılanları, **Firebase Console'da senin
yapman gereken adımları** ve **test adımlarını** içerir.

> Önemli: Bu dal `main`'e birleştirilmeden önce aşağıdaki **H bölümündeki 20. adımı** (GitHub Pages
> kaynağını "GitHub Actions" yapmak) uygula. Aksi halde Pages, derlenmemiş kaynak `index.html`'i
> yayınlar ve site boş görünür.

---

## 1. Yapılanların özeti

**Genel**
- Paket/yama yapısı (base64 şablon + ~40 bul-değiştir yaması) tamamen kaldırıldı. Kod artık
  Vite + React 19 + Firebase JS SDK 13 (modüler API) ile `src/` altında. React ve Firebase pakete
  dahil; çalışma anında hiçbir CDN betiği yüklenmiyor. İlk açılış paketi gzip'li ~175 KB.
- Firebase yapılandırması ve VAPID anahtarı `.env` ile veriliyor (`.env.example` eklendi). Depoda sır yok.
- GitHub Actions: her push'ta test + derleme; `main`'de GitHub Pages'e yayın. Kurallar ve
  fonksiyonlar için ayrı, elle tetiklenen dağıtım iş akışı.
- Tasarım korundu: WhatsApp benzeri yeşil tema, açık/koyu mod, mobil öncelikli düzen,
  "Geliştiren: Ömer İlerisoy". Inter yazı tipi kendi sunucumuzdan (latin + latin-ext).

**Aşama 1 — Kimlik ve güvenlik**
- Firebase Authentication (e-posta + şifre, en az 8 karakter), "Şifremi unuttum" e-postası,
  kalıcı oturum (uygulama kapansa da düşmez).
- Kayıtta benzersiz kullanıcı adı: yalnızca `a-z`, `0-9`, `_`; 3–20 karakter; Türkçe harfler
  dönüştürülür (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u). Benzersizlik `usernames/{ad} = uid` düğümüne
  **transaction** ile yazılarak sağlanıyor. Ad kayıt sırasında kapılırsa "Profilini tamamla" ekranı açılır.
- Veritabanında şifre veya şifre benzeri hiçbir alan yok (kurallar bilinmeyen alanları reddediyor).
- Yeni uid tabanlı düz veri modeli (`users`, `usernames`, `requests`, `chats`, `userChats`,
  `messages`, `typing`, `presence`, `pushTokens`, `blocks`, `admins`) + okundu/iletildi için
  `receipts/{chatId}/{uid}` ve Aşama 4'e kadar geçici ek verisi için `attachments/{chatId}/{messageId}`.
- `database.rules.json`: giriş yapmamış biri hiçbir şeyi okuyamaz/yazamaz; mesaj ve sohbetleri
  yalnızca üyeler okur; yeni mesajda `from == auth.uid` ve `ts == now` zorunlu; metin en fazla 4000
  karakter; başkasının mesajı değiştirilemez/silinemez; herkes yalnızca kendi `userChats`, `presence`,
  `typing`, `pushTokens`, `blocks` düğümüne yazar; `users/{uid}` giriş yapmışlarca okunur ama yalnızca
  sahibince yazılır; kullanıcı listesi tek seferde indirilemez; arama `usernames` üzerinde ön ek
  sorgusu (en fazla 20 sonuç); gerekli `.indexOn` tanımları var. Eski `db` düğümü tamamen kapalı.
- İstemci yalnızca kendi verisini dinliyor: `userChats/{benimUid}`, açık sohbetin mesajları
  (`limitToLast(50)`), gelen/giden istekler. Kök düğüm asla dinlenmiyor.
- Okunmamış sayıları `ServerValue.increment`, zaman damgaları `ServerValue.TIMESTAMP`; mesajlar
  `ts`'ye göre sıralı. Tüm yazmalar `update()` ile yalnızca ilgili yollara.
- Yönetici paneli: yöneticilik `admins/{uid}` ile (yalnızca Console'dan). Çıkarma/geri alma
  `adminSetUserDisabled` callable fonksiyonuyla: Auth hesabı devre dışı/etkin, oturum belirteçleri
  iptal, `users/{uid}/disabled` işareti. Çıkarılan kullanıcının açık oturumu anında kapanır
  (istemci bu bayrağı dinliyor; kurallar da bayrak varken okuma/yazmayı reddediyor).
- localStorage kilit mekanizması kaldırıldı (Firebase Auth'un deneme sınırına güveniliyor).
- "Uçtan uca şifreli", "Bu sohbetin dışında kimse okuyamaz", "Hesabın bu cihazda güvenle saklanır"
  ifadeleri kaldırıldı; yerine "Bağlantın şifreli (HTTPS)".
- App Check (reCAPTCHA v3) eklendi (site anahtarı `.env`'de verilince başlar).
- Geçiş: `scripts/migrate-legacy.mjs` (yedek, isteğe bağlı ad rezervi, yönetici onayıyla bağlama,
  eski sohbetleri taşıma, eski düğümü silme). Giriş ekranında "Yeni sürüme geçtik" duyurusu; metin
  `docs/duyuru.md`'de.

**Aşama 2 — Telefona bildirim**
- İzin yalnızca kullanıcının dokunduğu "Bildirimleri aç" düğmesiyle isteniyor (Ayarlar'da ve ilk
  girişten sonra bir kez gösterilen kartta). Açılışta otomatik izin isteme yok.
- iOS'ta uygulama Safari sekmesindeyse "Paylaş → Ana Ekrana Ekle, sonra ana ekrandan aç (iOS 16.4+)"
  rehberi; izin düğmesi yalnızca ana ekran uygulamasında.
- `getToken({ vapidKey, serviceWorkerRegistration })` → `pushTokens/{uid}/{token}` (platform, tarih).
  Her açılışta yenileniyor, değiştiyse eskisi siliniyor. Çıkışta `deleteToken()` + veritabanından silme.
- Ayarlar'da izin durumu (açık / kapalı / engellendi) ve engellendiyse Android, iOS, masaüstü için
  kısa açma adımları.
- `presence/{uid}/activeChat` açık sohbetle güncel; sohbetten çıkınca, sekme gizlenince ve bağlantı
  kopunca temizleniyor. `?chat=<chatId>` adresi ve servis çalışanının `{ type: "open-chat", chatId }`
  mesajı sohbeti açıyor.
- `sw.js` (tek dosya, kapsam `/chatapp-standalone/`): push yükünü ayrıştırıp **her zaman**
  `showNotification` çağırıyor; `tag = "chat-" + chatId`, `renotify: true` (aynı sohbetin bildirimleri
  tek bildirimde birleşir); ikon uygulama ikonu, rozet tek renkli 96×96 PNG; tıklayınca açık pencereye
  odaklanıp sohbeti açtırıyor ya da `/chatapp-standalone/?chat=<id>` ile yeni pencere açıyor.
- Uygulama açık ama başka ekrandayken: üst bant + kısa ses. Destekleniyorsa simgede toplam okunmamış
  (`navigator.setAppBadge`).
- Cloud Functions (2. nesil, Node.js 22, europe-west1, TypeScript): `onMessageCreated`,
  `onRequestCreated`, `onRequestUpdated`, `adminSetUserDisabled`. Yalnızca `data` yükü,
  `Urgency: high`, TTL 1 gün; geçersiz token'lar siliniyor. Sessize alınmış / engellenmiş / sohbet
  ekranda açıksa push yok.
- B planı: `worker/` altında Cloudflare Worker (aşağıda karşılaştırma var).

---

## 2. Değişen / eklenen dosyalar

Kısaltılmamış tam içerikler bu daldaki dosyalardır (GitHub'da PR'ın "Files changed" sekmesinde
her biri eksiksiz görünür).

| Dosya | Durum | Açıklama |
|---|---|---|
| `index.html` | yeniden yazıldı | Vite girişi; Türkçe başlık/açıklama; `maximum-scale`/`user-scalable=no` kaldırıldı |
| `sw.js`, `manifest.json`, `manifest-v5.json` | silindi | Yerlerine `public/sw.js`, `public/manifest.webmanifest` |
| `icons/*`, `robots.txt`, `sitemap.xml`, `googleafcab923dcd0e885.html` | `public/` altına taşındı | Google doğrulama dosyası korunuyor |
| `public/sw.js` | yeni | Push, bildirim tıklama, basit önbellek |
| `public/manifest.webmanifest` | yeni | `lang: tr` |
| `public/icons/badge-96.png` | yeni | Tek renkli bildirim rozeti |
| `package.json`, `package-lock.json` | yeni | Vite, React, Firebase 13, test araçları |
| `vite.config.js` | yeni | `base: "/chatapp-standalone/"` |
| `.env.example`, `.gitignore` | yeni | Ortam değişkenleri şablonu; sırlar/yedekler hariç |
| `firebase.json`, `.firebaserc` | yeni | Kurallar, fonksiyonlar, emülatörler |
| `database.rules.json` | yeni | Güvenlik kuralları |
| `src/main.jsx`, `src/App.jsx`, `src/styles.css`, `src/firebase.js` | yeni | Uygulama girişi, oturum durumu, App Check |
| `src/screens/AuthScreen.jsx` | yeni | Giriş / kayıt / şifremi unuttum |
| `src/screens/UsernameSetup.jsx` | yeni | Profili tamamla (ad alınmışsa) |
| `src/screens/Main.jsx` | yeni | Kenar çubuğu, arama, istekler, sohbet listesi, bant/ses/rozet |
| `src/components/ChatView.jsx` | yeni | Mesajlar, okundu/iletildi, yazıyor, mesaj kutusu |
| `src/components/Settings.jsx`, `NotificationSettings.jsx`, `NotificationCard.jsx` | yeni | Ayarlar ve bildirim izni |
| `src/components/AdminPanel.jsx`, `InAppBanner.jsx`, `ui.jsx` | yeni | Yönetici paneli, üst bant, ortak parçalar |
| `src/lib/*.js(x)` | yeni | API, presence, push, servis çalışanı, tema, biçimler, ikonlar, hata metinleri |
| `src/hooks/data.js` | yeni | Veritabanı dinleyicileri |
| `src/assets/fonts/*.woff2` | yeni | Inter (latin, latin-ext) |
| `functions/**` | yeni | Cloud Functions (TypeScript) + testler |
| `worker/**` | yeni | B planı: Cloudflare Worker |
| `scripts/migrate-legacy.mjs` | yeni | Geçiş betiği |
| `tests/**`, `vitest.emulator.config.js`, `src/lib/*.test.js` | yeni | Kural, fonksiyon, Worker, geçiş ve birim testleri |
| `.github/workflows/pages.yml`, `firebase-deploy.yml` | yeni | CI/CD |
| `docs/ASAMA-1-2.md`, `docs/duyuru.md`, `README.md`, `CHANGELOG.md` | yeni | Belgeler |

---

## 3. Firebase Console'da yapman gereken adımlar

Proje: **chatapp-d8a5b** (Realtime Database bölgesi europe-west1).

### A. Yedek ve temiz başlangıç (eski şifreler açığa çıktığı için)

1. **Eski verinin yedeğini al.** Realtime Database → *Veri* → `db` satırının yanındaki ⋮ →
   **JSON'u dışa aktar**. Dosyayı depo dışında sakla; içinde düz metin şifreler var, kimseyle paylaşma.
   (Alternatif: `node scripts/migrate-legacy.mjs backup`, bkz. adım 24.)
2. *(İsteğe bağlı)* Eski kullanıcı adlarını rezerve etmek istiyorsan **silmeden önce** adım 24'teki
   `reserve` komutunu çalıştır.
3. **Eski düğümü sil:** *Veri* sekmesinde `db` satırı → çöp kutusu simgesi → onayla.
   (Kurallar yayınlandıktan sonra bu düğüme zaten kimse erişemez; yine de silinmesi gerekiyor.)

### B. Authentication

4. **Authentication → Başlayın** (daha önce açılmadıysa) → **Sign-in method** → **E-posta/Şifre** →
   *Etkinleştir* → Kaydet. ("E-posta bağlantısı (şifresiz)" kapalı kalabilir.)
5. **Authentication → Settings → Yetkili alan adları** → *Alan adı ekle* →
   `ilerisoyomer34-coder.github.io`. (`localhost` zaten listede olmalı.)
6. **Authentication → Settings → Şifre politikası** → *Zorunlu kıl* → en az **8** karakter → Kaydet.
   (İstemcideki 8 karakter kuralını sunucu tarafında da garanti eder.)
7. **Authentication → Templates → Şifre sıfırlama** → şablon dilini **Türkçe** yap, gönderen adını
   "ChatApp" olarak düzenle → Kaydet.
8. **Authentication → Settings → Kullanıcı işlemleri** bölümünde *E-posta numaralandırma koruması*
   açık kalsın (varsayılan). Böylece "şifremi unuttum" bir e-postanın kayıtlı olup olmadığını ele vermez.

### C. Realtime Database

9. **Kuralları yayınla.** Yerelden: `firebase deploy --only database` (adım 19). Ya da Console →
   Realtime Database → *Kurallar* → `database.rules.json` içeriğini yapıştır → **Yayınla**.
10. **Kendini yönetici yap:** önce uygulamada yeni sürümle kayıt ol. Sonra Authentication → *Users*
    → kendi satırındaki **Kullanıcı UID**'yi kopyala. Realtime Database → *Veri* → kök (`/`) satırındaki
    **+** → anahtar `admins` → onun altında **+** → anahtar: *UID'n*, değer: `true` (tür: boolean) → Ekle.

### D. Cloud Messaging (web push)

11. **Proje ayarları (⚙️) → Cloud Messaging** → "Firebase Cloud Messaging API (V1)" **Etkin**
    olmalı. (Eski "Cloud Messaging API (Legacy)" kapalı kalabilir.)
12. Aynı sayfada **Web yapılandırması → Web Push sertifikaları → Anahtar çifti oluştur**. Oluşan
    **açık anahtarı** kopyala → `.env` içindeki `VITE_FIREBASE_VAPID_KEY` ve GitHub gizli değişkeni
    (adım 22).

### E. App Check (reCAPTCHA v3)

13. https://www.google.com/recaptcha/admin/create → Tür: **reCAPTCHA v3** → Alan adları:
    `ilerisoyomer34-coder.github.io` ve `localhost` → Gönder. **Site anahtarı** ve **gizli anahtar**ı not al.
14. Firebase Console → **App Check → Apps** → web uygulaması → **reCAPTCHA v3** → gizli anahtarı
    yapıştır → Kaydet. Site anahtarını `VITE_RECAPTCHA_SITE_KEY` olarak ver (`.env` + GitHub, adım 22).
15. App Check → **APIs** sekmesinde Realtime Database ve Cloud Functions'ı önce *İzleme* modunda bırak.
    Birkaç gün "Doğrulanmış istekler" oranı ~%100 olunca **Zorunlu kıl**.
    Not: `adminSetUserDisabled` fonksiyonu App Check'i varsayılan olarak **zorunlu** tutar. App Check'i
    henüz kurmadıysan `functions/.env` dosyası oluşturup içine `ENFORCE_APP_CHECK=false` yaz ve
    fonksiyonları yeniden dağıt; kurduktan sonra bu satırı sil.

### F. API anahtarını github.io alan adına kısıtla

16. https://console.cloud.google.com/apis/credentials?project=chatapp-d8a5b → **Browser key
    (auto created by Firebase)** → düzenle.
    - *Uygulama kısıtlamaları* → **Web siteleri** → şunları ekle:
      `https://ilerisoyomer34-coder.github.io/*`,
      `https://chatapp-d8a5b.firebaseapp.com/*` (şifre sıfırlama bağlantısı bu sayfada açılır),
      `http://localhost:5173/*` (yerel geliştirme).
    - *API kısıtlamaları* → **Anahtarı kısıtla** → şunları seç: Identity Toolkit API,
      Token Service API, Firebase Installations API, FCM Registration API, Firebase App Check API.
    - **Kaydet**. (Değişikliğin yayılması 5 dakikayı bulabilir.)

### G. Blaze planı, bütçe uyarısı ve fonksiyonların dağıtımı (A planı)

17. Firebase Console sol altta **Spark → Yükselt → Blaze** → bir faturalandırma hesabı seç/oluştur.
    Blaze'in aylık ücretsiz kotası bu boyuttaki bir uygulama için genellikle yeterlidir
    (Cloud Functions için ayda 2 milyon çağrı).
18. **1 USD bütçe uyarısı:** https://console.cloud.google.com/billing → faturalandırma hesabın →
    **Bütçeler ve uyarılar → Bütçe oluştur** → Kapsam: proje *chatapp-d8a5b* → Tutar: **1 USD** →
    Eşikler: %50, %90, %100 → e-posta bildirimi açık → Kaydet.
    (Bütçe uyarısı harcamayı durdurmaz; yalnızca e-postayla haber verir.)
19. **Fonksiyonları ve kuralları dağıt** (kendi bilgisayarında, Node.js 22 kurulu):
    ```bash
    git clone https://github.com/ilerisoyomer34-coder/chatapp-standalone.git
    cd chatapp-standalone
    npm ci && npm ci --prefix functions
    npx firebase login
    npx firebase deploy --only functions,database
    ```
    İlk dağıtımda CLI; Cloud Functions, Cloud Build, Artifact Registry, Eventarc ve Cloud Run
    API'lerini etkinleştirmek için onay ister → **Evet**. "Container images cleanup policy" sorulursa
    1 gün seçebilirsin.

### H. GitHub

20. Depo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
    *(Bu adımı dal `main`'e birleşmeden önce yap.)*
21. *(Gerekirse)* Depo → **Settings → Environments → github-pages** → "Deployment branches" kuralında
    `main` izinli olsun (varsayılan).
22. Depo → **Settings → Secrets and variables → Actions → New repository secret** ile şunları ekle
    (değerler `.env.example`'da ve Console → Proje ayarları → Genel → Web uygulaması → SDK yapılandırmasında):
    `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_DATABASE_URL`,
    `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`,
    `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_VAPID_KEY`, `VITE_RECAPTCHA_SITE_KEY`
    (B planındaysan ayrıca `VITE_PUSH_WORKER_URL`).
23. *(İsteğe bağlı — elle dağıtım iş akışı için)* Google Cloud Console → IAM → **Hizmet hesapları →
    Oluştur** (`github-deploy`) → roller: *Firebase Admin*, *Cloud Functions Admin*,
    *Service Account User*, *Artifact Registry Administrator*, *Cloud Build Editor* → **Anahtarlar →
    JSON anahtar oluştur** → içeriği `FIREBASE_SERVICE_ACCOUNT` gizli değişkeni olarak ekle → indirilen
    dosyayı sil. Sonra Actions → "Firebase dağıtımı" → *Run workflow*.

### I. Geçiş betiği (isteğe bağlı)

24. Console → Proje ayarları → **Hizmet hesapları → Yeni özel anahtar oluştur** (depo dışına kaydet):
    ```bash
    export GOOGLE_APPLICATION_CREDENTIALS=~/gizli/chatapp-sa.json
    node scripts/migrate-legacy.mjs backup                       # backup/legacy-db-....json
    node scripts/migrate-legacy.mjs reserve --file backup/legacy-db-....json
    # Kişi yeni hesap açıp "eski adım X'ti" dediğinde ve sen doğruladığında:
    node scripts/migrate-legacy.mjs link <eskiAd> <yeniUid>
    node scripts/migrate-legacy.mjs chats --file backup/legacy-db-....json
    node scripts/migrate-legacy.mjs delete-legacy --yes
    ```
    Eski ekler (base64) taşınmaz; mesajda "📎 ad (eski sürümden taşınmadı)" notu kalır.
    İş bitince yedek dosyasını ve servis hesabı anahtarını sil.

---

## 4. B planı — Blaze istemezsen: Cloudflare Worker

Kurulum:
1. Google Cloud Console → IAM → Hizmet hesapları → Oluştur (`chatapp-push`) → roller:
   **Firebase Realtime Database Admin** ve **Firebase Cloud Messaging API Admin** → JSON anahtar oluştur.
2. Cloudflare hesabı aç (ücretsiz) ve:
   ```bash
   cd worker
   npx wrangler login
   npx wrangler secret put SERVICE_ACCOUNT_JSON   # JSON dosyasının tüm içeriğini yapıştır
   npx wrangler deploy                            # çıktıdaki https://chatapp-push.<hesap>.workers.dev adresini al
   ```
3. Bu adresi GitHub gizli değişkeni `VITE_PUSH_WORKER_URL` olarak ekle ve yeniden derlet.
4. Kuralları yine dağıt (`firebase deploy --only database` Spark planında da çalışır). **Cloud
   Functions'ı dağıtma** (iki plan birlikte çalışırsa bildirimler çift gelir).
5. Yönetici panelindeki "Çıkar" düğmesi callable fonksiyon gerektirir; B planında kullanıcıyı
   Authentication → Users → ⋮ → *Hesabı devre dışı bırak* ile kapatıp Realtime Database'de
   `users/<uid>/disabled = true` yazarak çıkarabilirsin.

| | A planı: Cloud Functions (Blaze) | B planı: Cloudflare Worker |
|---|---|---|
| Maliyet | Ücretsiz kota bol; kart gerekli, 1 USD bütçe uyarısı önerilir | Ücretsiz (günde 100.000 istek), kart gerekmez |
| Güvenilirlik | Veritabanı tetikleyicisi: istemci çevrimdışıyken yazılan mesaj da sunucuya ulaşınca bildirilir | İstemci mesajı yazdıktan sonra uç noktayı çağırmalı; uygulama o an kapanırsa bildirim kaçabilir |
| Güvenlik | Sır yok, Google altyapısında | Servis hesabı anahtarı Worker'ın gizli değişkeninde; anahtar sızarsa tüm veritabanına erişilir |
| Bakım | `firebase deploy` | Ayrı bir hesap ve dağıtım (`wrangler`) |
| Yönetici "Çıkar" | Panelden tek dokunuş | Console'dan elle |

**Öneri:** A planı (Blaze + 1 USD bütçe uyarısı). Daha güvenilir ve sırsız.

---

## 5. Test adımları

### Otomatik testler (bilgisayarında)
```bash
npm ci && npm ci --prefix functions
npm test                 # birim testleri (biçimler, kullanıcı adı)
npm run test:emulator    # Java 21+ gerekir: güvenlik kuralları, fonksiyonlar, Worker, geçiş betiği
npm run build
```
Bu dalda: 10 birim + 79 emülatör testi geçti.

### Elle — Aşama 1
1. Tarayıcıda (gizli pencere, giriş yapmadan) şu adresi aç:
   `https://chatapp-d8a5b-default-rtdb.europe-west1.firebasedatabase.app/.json`
   → `"Permission denied"` görmelisin. Aynısını `/users.json`, `/messages.json`, `/db.json` için dene.
2. Uygulamada **Üye Ol**: 7 karakterli şifre → "Şifre en az 8 karakter olmalı." uyarısı.
   Kullanıcı adına `Şükrü Öz` yaz → alan `sukru_oz` olur.
3. Kayıt ol → ana ekran. Sayfayı kapat-aç → oturum açık kalmalı.
4. İkinci tarayıcıda/telefonda aynı kullanıcı adıyla kayıt dene → "Profilini tamamla — Bu kullanıcı
   adı alınmış" ekranı; başka ad seçince devam eder.
5. **Şifremi unuttum** → e-posta gelmeli (gereksiz klasörüne de bak) → bağlantıyla yeni şifre belirle → giriş yap.
6. Kullanıcı adının ilk harflerini ara → en fazla 20 sonuç; istek gönder → karşı tarafta "GELEN
   İSTEKLER" → Kabul et → iki tarafta da sohbet açılır → mesajlaş: tek tik → çift gri → çift mavi;
   karşı taraf yazarken "yazıyor…".
7. Console → Realtime Database → *Veri*: hiçbir yerde `pass`/şifre alanı olmamalı.
8. Geliştirici araçları → Application → Session/Local Storage'daki değerleri değiştir/sil, sayfayı
   yenile → başka bir hesaba geçilemez (oturum yalnızca Firebase Auth belirteciyle).
9. Yönetici hesabında **YÖNETİCİ PANELİ** görünür → bir test kullanıcısını **Çıkar** → o kullanıcının
   açık oturumu birkaç saniye içinde "Hesabın yönetici tarafından devre dışı bırakıldı." ile kapanır
   ve tekrar giriş yapamaz → **Geri Al** → giriş yapabilir.
10. Arayüzde hiçbir yerde "uçtan uca şifreli" ifadesi olmamalı.

### Elle — Aşama 2 (kabul ölçütleri)
11. **Android Chrome:** siteyi aç → ⋮ → *Ana ekrana ekle* → uygulamayı ana ekrandan aç → kart veya
    Ayarlar'dan **Bildirimleri aç** → izin ver. Uygulamayı son uygulamalardan tamamen kapat, ekranı
    kilitle → başka hesaptan mesaj at → bildirim gelir; dokununca doğrudan o sohbet açılır.
12. **iOS 16.4+:** Safari'de aç → kart "Paylaş → Ana Ekrana Ekle" rehberini gösterir → ekle → ana
    ekrandan aç → **Bildirimleri aç** → izin ver → kapat → mesaj at → bildirim gelir.
13. **Masaüstü Chrome:** izin ver → sekmeyi kapat (tarayıcı açık kalsın) → mesaj at → bildirim gelir.
14. Aynı sohbetten art arda 5 mesaj → tek bildirim, son mesajla güncellenir.
15. Sohbet ekranda açıkken mesaj gelir → bildirim gelmez. Uygulama açık ama başka ekrandayken →
    üstte bant + kısa ses.
16. Sohbet isteği gönder → alıcıya "Yeni sohbet isteği" bildirimi; kabul edince gönderene
    "… sohbet isteğini kabul etti" bildirimi.
17. Ayarlar → **Çıkış yap** → o cihaza artık bildirim gelmez (Console → Veri → `pushTokens/<uid>`
    altından o token silinmiş olur). Geçersiz tokenlar ilk gönderimde otomatik silinir
    (Console → Functions → Günlükler: "geçersiz tokenlar silindi").
18. Ayarlar → Bildirimler: izin "Engellendi" ise cihaza göre açma adımları görünür.

*(Sessize alma ve engelleme arayüzü Aşama 4'te gelecek; sunucu tarafı şimdiden `userChats/.../muted`
ve `blocks/...` alanlarına bakıyor ve testlerle doğrulandı.)*

---

## 6. Kararlar ve notlar

- **Kullanıcı adıyla giriş (`usernameToEmail`) eklenmedi.** E-postayı istemciye açmadan bunu yapmak
  için şifreyi sunucuda doğrulayıp özel belirteç üreten ve deneme saldırısına açık yeni bir uç nokta
  gerekir. Giriş e-posta ile yapılıyor; istersen sonraki aşamada eklerim.
- **Ekler, Aşama 4'e kadar** 5 MB sınırıyla veritabanında, mesajdan ayrı `attachments/` düğümünde
  tutuluyor ve yalnızca dokununca indiriliyor (sohbet listesi/mesaj akışı hafif kalıyor). Aşama 4'te
  Firebase Storage'a taşınacak.
- **Bildirim sesi:** pencere görünür **ve odaktaysa** bildirim sessiz gösteriliyor (uygulama içi bant
  ve ses zaten çalıyor; çift ses olmasın). Sohbet ekranda açıksa sunucu hiç göndermiyor.
- Aşama 3'ten şimdiden yapılanlar: otomatik büyüyen mesaj kutusu (en fazla 5 satır; masaüstünde
  Enter gönderir, Shift+Enter yeni satır; mobilde Enter yeni satır), boşken pasif gönder düğmesi,
  "Yeni mesaj ↓" düğmesi, `typing` için `onDisconnect().remove()` + 4 sn, saat/tek tik/çift gri/çift mavi,
  "Bağlantı yok" bandı, Intl tarihleri ve "Bugün/Dün" ayırıcıları, tr-TR harf işlemleri, tema tercihi
  + sistem teması, viewport düzeltmesi, Türkçe yükleme ekranı ve teknik hataların gizlenmesi,
  ad 40 karakter sınırı.
