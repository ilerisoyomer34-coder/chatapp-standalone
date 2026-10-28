import { defineConfig } from 'vitest/config';

// Emülatör testleri: güvenlik kuralları + bildirim fonksiyonları.
// Çalıştırma: npm run test:emulator  (Firebase Emulator ve Java 21+ gerekir)
export default defineConfig({
  test: {
    include: [
      'tests/rules/**/*.test.js',
      'tests/worker/**/*.test.js',
      'tests/scripts/**/*.test.js',
      'tests/storage/**/*.test.js',
      'functions/test/**/*.test.js',
    ],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
