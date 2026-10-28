# Aşama 3, 4, 6 ve 7 — Hata düzeltmeleri, eksik özellikler, PWA ve kalite

Aşama 1–2 için: [ASAMA-1-2.md](ASAMA-1-2.md). Telefona bildirimin kısa kurulum listesi:
[TELEFONA-BILDIRIM.md](TELEFONA-BILDIRIM.md). Aşama 5 (uçtan uca şifreleme) uygulanmadı; açıklaması ve
onay sorusu: [ASAMA-5-E2EE.md](ASAMA-5-E2EE.md).

Her dosyanın kısaltılmamış tam içeriği depoda ve GitHub'da **Pull request #1 → Files changed**
sekmesinde görülebilir (dosyaların toplam boyutu bir sohbet mesajına sığmıyor).

## 1. Yapılanların özeti

### Aşama 3 — Hata düzeltmeleri (Aşama 1–2 ile birlikte yazıldı)
- Mesaj alanı yalnızca en alttaysan veya kendi mesajını gönderdiysen kayar; yukarıdayken "Yeni mesaj ↓" düğmesi.
- Otomatik büyüyen mesaj kutusu (en fazla 5 satır): masaüstünde Enter gönderir, Shift+Enter yeni satır;
  mobilde Enter yeni satır. Boşken gönder düğmesi sesli mesaj düğmesine dönüşür.
- "Yazıyor" bayrağı `onDisconnect().remove()` ile ve 4 sn hareketsizlikte kalkar.
- Mesaj durumları: bekliyor (saat), gönderildi, iletildi, okundu; "Bağlantı yok…" bandı (cihaz çevrimdışıysa hemen).
- `Intl.DateTimeFormat('tr-TR')`, "Bugün / Dün / gün adı / tam tarih" ayırıcıları, eski tarihlerde yıl.
- `toLocaleLowerCase/UpperCase('tr-TR')`, kalıcı tema tercihi, yakınlaştırma açık, Türkçe yükleme ekranı,
  teknik hatalar yalnızca konsolda; ad en fazla 40, kullanıcı adı 3–20 karakter.

### Aşama 4 — Eksik özellikler
Profil ve ayarlar, Storage ekleri, mesaj işlemleri, sesli mesaj, sohbet listesi yönetimi, sayfalama ve arama,
çevrimiçi/son görülme, engelleme/şikâyet/istek sınırı, grup sohbeti, yasal sayfalar (ayrıntı: CHANGELOG).
Sunucu tarafında `manageGroup`, `deleteAccount`, `onMessageUpdated`, `syncChatAccessOnWrite` fonksiyonları;
`storage.rules` ekleri yalnızca sohbet üyelerine açar (üyelik Firestore'daki `chatAccess` aynasından okunur).

### Aşama 6 — Performans ve PWA
- Kod bölme (ayarlar, yönetici paneli, grup ekranları, görüntüleyici ayrı parçalar), React/Firebase ayrı parçalar.
- Ölçüm (yerel, mobil Lighthouse 13): **Performans 93, Erişilebilirlik 96, En İyi Uygulamalar 96, SEO 100**.
  İlk açılış paketi gzip ile ~191 KB (hedef < 250 KB).
- Servis çalışanı derleme çıktısını önbelleğe alır; uygulama internetsiz açılır, son sohbet listesi ve son
  50 mesaj (IndexedDB) okunur. Yeni sürümde "Yeni sürüm hazır — Yenile" bandı.
- Eski paketlenmiş sürümün önbellekleri silinir, açık eski sayfalar yeni sürüme geçirilir.
- Manifest, ikonlar, og:image, 404.html, sitemap güncellendi.

### Aşama 7 — Kalite
- ESLint (`eslint.config.js`) + Prettier (`.prettierrc.json`), CI'da denetim adımı.
- Vitest birim testleri (14) ve Firebase Emulator testleri (121): güvenlik kuralları (giriş yapmadan
  okuyamama, başka sohbeti okuyamama, başkası adına yazamama…), Storage kuralları, fonksiyonlar, Worker, geçiş betiği.
- GitHub Actions: her push'ta denetim + test + derleme, `main`'de Pages yayını; kurallar ve fonksiyonlar için elle
  tetiklenen dağıtım. `main`'de Firebase yapılandırması eksikse yayın durur.
- README, CHANGELOG, bu belge ve rapor eşlemesi ([RAPOR-DURUMU.md](RAPOR-DURUMU.md)).

## 2. Değişen / eklenen dosyalar

**Aşama 4 (sunucu, `03ab508`)** — `database.rules.json`, `firebase.json`, `firestore.rules` (yeni),
`storage.rules` (yeni), `storage.cors.json` (yeni), `functions/src/access.ts` (yeni), `account.ts` (yeni),
`groups.ts` (yeni), `messages.ts` (yeni), `updates.ts` (yeni), `index.ts`, `notify.ts`, `text.ts`,
`functions/test/stage4.test.js` (yeni), `tests/storage/storage.rules.test.js` (yeni),
`tests/rules/database.rules.test.js`, `scripts/migrate-legacy.mjs`, `package.json`, `vitest.emulator.config.js`.

**Aşama 4 (istemci, `4659be9`)** — `public/gizlilik.html`, `kosullar.html`, `kvkk.html`, `legal.css` (yeni);
`src/components/`: `ContactPicker.jsx`, `CreateGroup.jsx`, `GroupInfo.jsx`, `Modal.jsx`, `ProfileSheet.jsx`,
`ReportDialog.jsx`, `dialogs.jsx`, `chat/Attachment.jsx`, `chat/ChatView.jsx`, `chat/Composer.jsx`,
`chat/ForwardDialog.jsx`, `chat/ImageViewer.jsx`, `chat/MessageBubble.jsx` (yeni); `AdminPanel.jsx`,
`InAppBanner.jsx`, `Settings.jsx` (değişti); `src/components/ChatView.jsx` (silindi);
`src/lib/`: `cache.js`, `chatPrefs.js`, `image.js`, `recorder.js`, `storage.js` (yeni); `api.js`, `errors.js`,
`format.js`, `icons.jsx` (değişti); `src/App.jsx`, `src/firebase.js`, `src/hooks/data.js`,
`src/screens/AuthScreen.jsx`, `src/screens/Main.jsx`, `src/styles.css`; `functions/src/groups.ts`, `index.ts`,
`notify.ts`; `functions/test/admin.test.js`.

**Aşama 6 + telefona bildirim (`282bfd9`)** — `public/sw.js`, `public/manifest.webmanifest`, `public/sitemap.xml`,
`public/404.html` (yeni), `public/og-image.jpg` (yeni), `public/screenshots/narrow.png`, `wide.png` (yeni),
`public/icons/icon-192.png`, `icon-512.png` (yenilendi), `icon-maskable-192.png`, `icon-maskable-512.png`,
`apple-touch-icon.png` (yeni), `icon-180.png`, `icon-v5-*.png` (silindi); `index.html`, `vite.config.js`;
`src/components/UpdateBanner.jsx` (yeni), `NotificationSettings.jsx`, `src/lib/sw.js`, `push.js`, `api.js`,
`errors.js`, `src/App.jsx`, `src/screens/Main.jsx`; `functions/src/index.ts`, `notify.ts`,
`functions/test/notify.test.js`; `worker/src/index.js`, `tests/worker/worker.test.js`;
`scripts/write-env.mjs`, `scripts/write-env.test.js` (yeni); `.github/workflows/pages.yml`,
`firebase-deploy.yml`; `docs/TELEFONA-BILDIRIM.md` (yeni).

**Aşama 7** — `eslint.config.js`, `.prettierrc.json`, `.prettierignore` (yeni); `package.json`
(`lint`, `format`, `format:check`), `.github/workflows/pages.yml` (denetim adımı); `README.md`, `CHANGELOG.md`,
`docs/ASAMA-3-7.md`, `docs/ASAMA-5-E2EE.md`, `docs/RAPOR-DURUMU.md` (yeni); `src/lib/theme.js`
(okunabilir metin tonları), `src/hooks/data.js` (`EMPTY`), `src/App.jsx` (`<main>`), ESLint düzeltmeleri ve
Prettier biçimlendirmesi (tüm `src/`, `functions/src/`, `tests/`, `scripts/`, `worker/`).

## 3. Firebase / Google Cloud / GitHub'da yapman gereken adımlar

Aşama 1–2'nin adımları ([ASAMA-1-2.md](ASAMA-1-2.md) §3) geçerli. Aşağıdakiler ek olarak gerekir.
Telefona bildirim için en kısa yol [TELEFONA-BILDIRIM.md](TELEFONA-BILDIRIM.md).

1. **Blaze planı** (Storage ve Cloud Functions için) ve **1 USD bütçe uyarısı** — ASAMA-1-2.md adım 17–18.
2. **Firestore'u oluştur:** Console → Firestore Database → *Veritabanı oluştur* → konum **europe-west1** →
   *Üretim modunda başlat*. (Yalnızca `chatAccess` üyelik aynası; istemci erişimi kurallarla tamamen kapalı.)
3. **Storage'ı aç:** Console → Storage → *Başlayın* → konum **europe-west1** → *Üretim modunda başlat*.
   Varsayılan kova adı `chatapp-d8a5b.firebasestorage.app` olmalı (farklıysa `functions/src/index.ts` içindeki
   `STORAGE_BUCKET` ve `.env` içindeki `VITE_FIREBASE_STORAGE_BUCKET` değerlerini değiştir).
4. **Dağıt:**
   ```bash
   echo "ENFORCE_APP_CHECK=false" > functions/.env.chatapp-d8a5b   # App Check kurulana kadar
   npx firebase deploy --only functions,database,firestore,storage --project chatapp-d8a5b
   ```
   İlk Storage kuralı dağıtımında CLI, Storage'ın Firestore'u okuyabilmesi için IAM izni ister →
   **Y** (bu izin "cross-service rules" içindir). Sorulmazsa ve ekler "yetkin yok" hatası verirse:
   Console → Storage → Rules sayfasındaki uyarıdan *İzin ver*'e bas.
5. **Storage CORS:**
   `gcloud storage buckets update gs://chatapp-d8a5b.firebasestorage.app --cors-file=storage.cors.json`
   (Cloud Shell'de çalıştırılabilir.)
6. **Geçiş betiği kullandıysan** üyelik aynasını doldur: `node scripts/migrate-legacy.mjs sync-access`.
7. **GitHub:** Settings → Pages → Source **GitHub Actions**; Secrets'a `VITE_FIREBASE_API_KEY`,
   `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_VAPID_KEY` (diğerleri hazır gelir).
8. *(İsteğe bağlı)* App Check'i kurduktan sonra: depo **Variables**'a `ENFORCE_APP_CHECK=true` ekleyip
   Actions → "Firebase dağıtımı"nı çalıştır (ya da adım 4'teki satırı `true` yapıp yeniden dağıt).
9. *(İsteğe bağlı)* Yasal sayfalar (`public/gizlilik.html`, `kosullar.html`, `kvkk.html`) **yayından önce bir
   hukuk uzmanına kontrol ettirilmeli**; sayfalardaki "[e-posta / adres eklenecek]" yerine iletişim bilgini yaz.

## 4. Test adımları

### Otomatik
```bash
npm run lint && npm run format:check
npm test                 # 14 birim testi
npm run test:emulator    # 121 emülatör testi (Java 21)
npm run build            # ilk yükleme ~191 KB gzip
```

### Elle (iki hesap A ve B, biri telefonda)
1. **Kaydırma:** uzun bir sohbette yukarı çık; B yazınca ekran zıplamaz, "Yeni mesaj ↓" çıkar.
2. **Mesaj kutusu:** masaüstünde Shift+Enter yeni satır, Enter gönderir; telefonda Enter yeni satır.
3. **Durumlar:** uçak modunda gönder → saat simgesi ve "Bağlantı yok" bandı; bağlanınca tek tik → B
   uygulamayı açınca çift gri → sohbeti açınca çift mavi.
4. **Profil:** Ayarlar → fotoğraf yükle (512 px'e küçültülür, en fazla 2 MB) → B'de yeni fotoğraf görünür.
5. **Ek:** 25 MB altı bir PDF ve bir fotoğraf gönder → ilerleme çubuğu, iptal çalışır; fotoğraf küçük resimle,
   dokununca tam ekran; üye olmayan biri dosya adresini açamaz.
6. **Mesaj işlemleri:** uzun bas → yanıtla, kopyala, düzenle ("düzenlendi"), 15 dk sonra düzenle görünmez,
   herkesten sil ("Bu mesaj silindi"), ilet ("İletildi"), tepki.
7. **Sesli mesaj:** mikrofon düğmesine basılı tut → bırak → B dinler; sola kaydırınca iptal.
8. **Liste:** sohbete uzun bas → sabitle (en fazla 3), arşivle, 8 saat sessize al → o sohbetten bildirim gelmez.
9. **Sayfalama/arama:** 50'den fazla mesajlı sohbette yukarı kaydır → eski mesajlar yüklenir; ⋮ → Ara.
10. **Gizlilik:** Ayarlar → Son görülme kapalı → B başlıkta son görülmeni göremez (sen de onunkini).
11. **Engel/şikâyet:** B'yi engelle → B mesaj gönderemez, bildirimi gelmez; şikâyet yönetici panelinde görünür.
12. **İstek sınırı:** aynı gün 21. istek "Bugün en fazla 20…" uyarısı verir.
13. **Grup:** 3 kişilik grup kur → ad/fotoğraf değiştir, üye ekle/çıkar, yönetici yap, ayrıl → sistem mesajları.
14. **Hesap silme:** Ayarlar → Hesabı sil → şifre → oturum kapanır; gruplardaki mesajları "silindi" görünür.
15. **İnternetsiz açılış:** uygulamayı bir kez aç → uçak modu → yeniden aç → son sohbetler ve mesajlar görünür.
16. **Güncelleme bandı:** `main`'e yeni sürüm yayınlanınca açık uygulamada "Yeni sürüm hazır — Yenile" çıkar.
17. **Bildirim testi:** Ayarlar → Bildirimler → *Test bildirimi gönder* → telefonu kilitle → 5 sn içinde bildirim.
18. **Lighthouse:** Chrome DevTools → Lighthouse → Mobil → Performans ve En İyi Uygulamalar ≥ 90.

## 5. Kararlar ve notlar

- **Storage üyelik denetimi:** Storage kuralları Realtime Database'i okuyamaz; bu yüzden sohbet üyeliği bir
  fonksiyonla Firestore'daki `chatAccess/{chatId}` belgesine yansıtılır ve kurallar oradan okur.
- **İndirmeler:** dosya adresleri veritabanına yazılmaz (yalnızca Storage yolu); dosyalar kimlik doğrulamalı
  `getBlob` ile indirilir. Bu, eski "javascript: bağlantısı" riskini (rapor 1.7) tamamen kapatır.
- **App Check:** kurulana kadar fonksiyonlar App Check istemez (`ENFORCE_APP_CHECK=false`); kurallar ve
  kimlik doğrulama yine zorunludur.
- **Erişilebilirlik:** yeşil düğmelerin beyaz yazısı (`#25D366`) tasarımı korumak için olduğu gibi bırakıldı;
  metin olarak kullanılan yeşil ve gri tonlar okunabilirlik eşiğine çekildi.
- **Sesli/görüntülü arama** (rapor 5.6) kapsam dışı; ileride WebRTC ile değerlendirilebilir.
