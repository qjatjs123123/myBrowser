// main·shared 단위 테스트용 electron 최소 mock — 실제 Electron 없이 node 에서 돈다 (.claude/rules/electron/main.md 「테스트」)
import { vi } from 'vitest';

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
}));
