// main·shared 단위 테스트용 electron 최소 mock — 실제 Electron 없이 node 에서 돈다 (.claude/rules/electron/main.md 「테스트」)
import { vi } from 'vitest';

// headless chromium(playwright-core) 이 호스트 Wayland 에 붙지 않게 한다 — WSLg 컴포지터가 멈춘 세션에서
// WAYLAND_DISPLAY 가 남아 있으면 rAF·스크린샷이 영원히 대기한다 (docs/TROUBLESHOOTING.md, spec 005)
delete process.env['WAYLAND_DISPLAY'];

/** WebContentsView mock 인스턴스 — 각 항목은 호출 인자를 기록하는 vi.fn (spec 002 Task 1) */
function createMockWebContentsView(): Record<string, unknown> {
  return {
    setBounds: vi.fn(),
    setVisible: vi.fn(),
    setBorderRadius: vi.fn(),
    webContents: {
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      loadURL: vi.fn(),
      getURL: vi.fn(),
      getTitle: vi.fn(),
      isLoading: vi.fn(),
      stop: vi.fn(),
      reload: vi.fn(),
      focus: vi.fn(),
      close: vi.fn(),
      isDestroyed: vi.fn(),
      debugger: { attach: vi.fn(), isAttached: vi.fn(), sendCommand: vi.fn() },
      navigationHistory: {
        canGoBack: vi.fn(),
        canGoForward: vi.fn(),
        goBack: vi.fn(),
        goForward: vi.fn(),
      },
    },
  };
}

vi.mock('electron', () => ({
  app: {
    getName: vi.fn(() => 'myBrowser'),
    getVersion: vi.fn(() => '0.1.0'),
    isPackaged: false,
    getPath: vi.fn((name: string) => `/tmp/mybrowser-test/${name}`),
    setPath: vi.fn(),
    commandLine: { appendSwitch: vi.fn() },
  },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  BrowserWindow: vi.fn(),
  WebContentsView: vi.fn(function WebContentsView() {
    return createMockWebContentsView();
  }),
  session: { fromPartition: vi.fn(() => ({ cookies: { flushStore: vi.fn() } })) },
}));
