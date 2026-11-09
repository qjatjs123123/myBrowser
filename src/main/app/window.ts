import { join } from 'node:path';

import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';

import type { TWindowState } from '@shared/ipc/window';

/** 창 최소 크기 — 창 옵션과 Linux 가장자리 크기 조절(spec 016)이 같이 쓴다 */
export const WINDOW_MIN_SIZE = { width: 900, height: 600 };
const WINDOW_SIZE = { width: 1280, height: 800, minWidth: WINDOW_MIN_SIZE.width, minHeight: WINDOW_MIN_SIZE.height };
/** macOS 네이티브 신호등을 탭 줄(36px) 가운데에 맞춘다 (spec 010) */
const TRAFFIC_LIGHT_POSITION = { x: 14, y: 12 };
/** Linux 둥근 창의 모서리 반지름 — renderer 토큰 `--window-radius`(globals.css)와 같은 값 (spec 014) */
export const WINDOW_CORNER_RADIUS = 10;

/** 창 모서리를 앱이 직접 둥글게 그리는 플랫폼인가 — macOS·Windows 11 은 OS 가 그린다 (spec 014) */
export function hasRoundedCorners(platform: NodeJS.Platform): boolean {
  return platform === 'linux';
}

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
  // Linux 는 OS 가 모서리를 그리지 않으므로 투명 창으로 띄우고 renderer 가 둥근 루트를 그린다 (spec 014)
  if (hasRoundedCorners(platform)) return { frame: false, transparent: true, backgroundColor: '#00000000' };
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

type TWatchableWindow = Pick<BrowserWindow, 'on' | 'isMaximized'>;

/**
 * 최대화·전체 화면 상태가 바뀔 때마다 알린다 (spec 014 FR-2). 값은 이벤트 종류로 정한다 — 창 관리자가 없는 xvfb e2e 에서
 * `emit('maximize')` 로 확인할 수 있게. 전체 화면을 풀 때만 최대화 여부를 읽는다 (최대화한 창을 전체 화면 했다 풀어도 직각 유지).
 */
export function watchWindowState(window: TWatchableWindow, onChange: (state: TWindowState) => void): void {
  window.on('maximize', () => onChange({ isMaximized: true }));
  window.on('enter-full-screen', () => onChange({ isMaximized: true }));
  window.on('unmaximize', () => onChange({ isMaximized: false }));
  window.on('leave-full-screen', () => onChange({ isMaximized: window.isMaximized() }));
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
