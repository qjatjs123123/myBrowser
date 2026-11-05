import { join } from 'node:path';

import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';

const WINDOW_SIZE = { width: 1280, height: 800, minWidth: 900, minHeight: 600 };

/**
 * [창 옵션] 보안 기본값(contextIsolation·sandbox·nodeIntegration 끔)을 한 곳에서 정한다.
 * 규칙: .claude/rules/electron/main.md 「보안 기본값」 — 바꾸지 않는다
 */
export function createWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    ...WINDOW_SIZE,
    title: 'myBrowser',
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  };
}

/** 메인 창을 만들고 renderer 를 불러온다 — 개발 중엔 electron-vite dev 서버, 빌드 후엔 out/renderer */
export function createMainWindow({ rendererDevUrl }: { rendererDevUrl?: string }): BrowserWindow {
  const window = new BrowserWindow(createWindowOptions(join(__dirname, '../preload/index.js')));
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (rendererDevUrl) void window.loadURL(rendererDevUrl);
  else void window.loadFile(join(__dirname, '../renderer/index.html'));
  return window;
}
