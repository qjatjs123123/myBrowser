import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@main': resolve(__dirname, 'src/main'),
  '@': resolve(__dirname, 'src/renderer'),
};

export default defineConfig({
  main: {
    resolve: { alias },
  },
  preload: {
    resolve: { alias },
    // sandbox 된 preload 는 electron 외 모듈을 require 할 수 없다 — 의존성을 번들에 포함한다
    build: { externalizeDeps: false },
  },
  renderer: {
    resolve: { alias },
    plugins: [react(), tailwindcss()],
  },
});
