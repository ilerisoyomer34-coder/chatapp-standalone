import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages yayını https://ilerisoyomer34-coder.github.io/chatapp-standalone/ altında.
export default defineConfig({
  base: '/chatapp-standalone/',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'node',
  },
});
