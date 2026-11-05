import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@main': resolve(__dirname, 'src/main'),
  '@': resolve(__dirname, 'src/renderer'),
};

/** 게이트웨이 기본 주소 — 빌드 시 MYBROWSER_GATEWAY_URL, 없으면 운영 주소 (spec 005 FR-3). 런타임 env 가 우선한다 */
const GATEWAY_URL = process.env.MYBROWSER_GATEWAY_URL ?? 'https://gateway.mybrowser.app';

export default defineConfig({
  main: {
    resolve: { alias },
    define: { __GATEWAY_URL__: JSON.stringify(GATEWAY_URL) },
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
