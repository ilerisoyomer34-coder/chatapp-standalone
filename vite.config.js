import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BASE = '/chatapp-standalone/';

// Derleme çıktısının listesini servis çalışanına yazar (çevrimdışı açılış + sürüm takibi).
function swPrecache() {
  let outDir = 'dist';
  return {
    name: 'chatapp-sw-precache',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    writeBundle() {
      const files = [];
      const walk = (dir) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(relative(outDir, full).split('\\').join('/'));
        }
      };
      walk(outDir);
      const precache = files
        .filter((f) => !/(^sw\.js$|\.map$|^screenshots\/|^google.*\.html$|^404\.html$|^robots\.txt$|^sitemap\.xml$|^og-image)/.test(f))
        .sort();
      const hash = createHash('sha256');
      for (const f of precache) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const urls = [BASE, ...precache.filter((f) => f !== 'index.html').map((f) => BASE + f), BASE + 'index.html'];
      const swPath = join(outDir, 'sw.js');
      const header = `self.__PRECACHE_MANIFEST__ = ${JSON.stringify(urls)};\nself.__BUILD_VERSION__ = ${JSON.stringify(version)};\n`;
      writeFileSync(swPath, header + readFileSync(swPath, 'utf8'));
    },
  };
}

// GitHub Pages yayını https://ilerisoyomer34-coder.github.io/chatapp-standalone/ altında.
export default defineConfig({
  base: BASE,
  plugins: [react(), swPrecache()],
  build: {
    target: 'es2022',
    sourcemap: false,
    rolldownOptions: {
      output: {
        // Firebase ve React ayrı, uzun süre önbellekte kalan parçalar.
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          if (id.includes('node_modules/@firebase/database') || id.includes('node_modules/firebase/database')) return 'firebase-db';
          if (id.includes('node_modules/@firebase/auth') || id.includes('node_modules/firebase/auth')) return 'firebase-auth';
          return undefined;
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.{js,jsx}', 'scripts/**/*.test.js'],
    environment: 'node',
  },
});
