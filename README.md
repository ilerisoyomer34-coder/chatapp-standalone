# ChatApp

Ömer İlerisoy tarafından geliştirilen, WhatsApp benzeri sade bir sohbet uygulaması.
Yayın adresi: https://ilerisoyomer34-coder.github.io/chatapp-standalone/

- Vite + React 19, Firebase JS SDK 13 (modüler): Authentication, Realtime Database, Cloud Messaging, App Check
- Cloud Functions (2. nesil, Node.js 22, europe-west1, TypeScript) — `functions/`
- B planı bildirim uç noktası (Cloudflare Worker) — `worker/`
- GitHub Actions ile test, derleme ve GitHub Pages'e yayın

## Kurulum

```bash
cp .env.example .env      # değerleri doldur (Firebase Console → Proje ayarları)
npm ci
npm ci --prefix functions
npm run dev               # http://localhost:5173/chatapp-standalone/
```

## Test

```bash
npm test                  # birim testleri
npm run test:emulator     # güvenlik kuralları, fonksiyonlar, Worker, geçiş betiği (Java 21+ gerekir)
```

Emülatörlerle yerel geliştirme: bir terminalde `npx firebase emulators:start --only auth,database --project demo-chatapp`,
diğerinde `VITE_USE_EMULATORS=true npm run dev`.

## Dağıtım

- Web: `main` dalına push → GitHub Actions → GitHub Pages.
- Kurallar ve fonksiyonlar: `npx firebase deploy --only functions,database`
  veya Actions → "Firebase dağıtımı" (elle).

Firebase Console adımları, Blaze/bütçe uyarısı, VAPID anahtarı, App Check ve test adımları:
[docs/ASAMA-1-2.md](docs/ASAMA-1-2.md).
