import { join } from 'node:path';

import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';

const WINDOW_SIZE = { width: 1280, height: 800, minWidth: 900, minHeight: 600 };
/** macOS 네이티브 신호등을 탭 줄(36px) 가운데에 맞춘다 (spec 010) */
const TRAFFIC_LIGHT_POSITION = { x: 14, y: 12 };

/** 신호등 버튼이 부르는 창 동작 (window:* 핸들러가 받는다) */
export interface IWindowControls {
  minimize: () => void;
  /** 최대화 상태면 원래 크기로, 아니면 최대화 */
  toggleMaximize: () => void;
  close: () => void;
}

type TControllableWindow = Pick<BrowserWindow, 'minimize' | 'maximize' | 'unmaximize' | 'isMaximized' | 'close'>;

/** 창 → 창 동작 — 메서드는 부를 때마다 창에서 찾는다(미리 꺼내거나 bind 하지 않는다: e2e 가 인스턴스에 대역을 심는다) */
export function createWindowControls(window: TControllableWindow): IWindowControls {
  return {
    minimize: () => window.minimize(),
    toggleMaximize: () => (window.isMaximized() ? window.unmaximize() : window.maximize()),
    close: () => window.close(),
  };
}

/** 플랫폼별 프레임 — macOS 는 네이티브 신호등을 남기고 제목 표시줄만 숨김, 그 외는 프레임 없음(신호등은 renderer 가 그린다) */
function createFrameOptions(platform: NodeJS.Platform): BrowserWindowConstructorOptions {
  if (platform === 'darwin') return { titleBarStyle: 'hiddenInset', trafficLightPosition: TRAFFIC_LIGHT_POSITION };
  return { frame: false };
}

/**
 * [창 옵션] 보안 기본값(contextIsolation·sandbox·nodeIntegration 끔)을 한 곳에서 정한다 + 플랫폼별 프레임 (spec 010).
 * 규칙: .claude/rules/electron/main.md 「보안 기본값」 — 바꾸지 않는다
 */
export function createWindowOptions(preloadPath: string, platform: NodeJS.Platform): BrowserWindowConstructorOptions {
  return {
    ...WINDOW_SIZE,
    ...createFrameOptions(platform),
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
  const window = new BrowserWindow(createWindowOptions(join(__dirname, '../preload/index.js'), process.platform));
  // 메뉴(편집 단축키)는 남기고 막대만 숨긴다 — autoHideMenuBar 는 Alt 로 막대가 튀어나와 Alt+←/→ 와 겹친다
  window.setMenuBarVisibility(false);
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (rendererDevUrl) void window.loadURL(rendererDevUrl);
  else void window.loadFile(join(__dirname, '../renderer/index.html'));
  return window;
}
