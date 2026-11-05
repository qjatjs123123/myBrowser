// 앱 진입점 — 조립만 한다. 로직은 각 모듈에 (.claude/rules/architecture.md §2)
import { app, ipcMain, Menu, session } from 'electron';

import { IPC } from '@shared/ipc/channels';
import { ShortcutPressedEventSchema } from '@shared/ipc/shortcut';
import { TabsChangedEventSchema } from '@shared/ipc/tabs';

import { getCdpSwitches } from './app/cdp';
import { createAppMenuTemplate } from './app/menu';
import { createMainWindow } from './app/window';
import { readEnv } from './env';
import { createSidebarEmitter } from './ipc/emit';
import { createAppHandlers } from './ipc/handlers/app';
import { createTabsHandlers } from './ipc/handlers/tabs';
import { registerIpc } from './ipc/registry';
import { log } from './log';
import { createElectronTabView } from './tabs/electronTabView';
import { attachShortcuts, createShortcutInputHandler, createShortcutRunner } from './tabs/shortcuts';
import { TabManager } from './tabs/tabManager';

const BROWSING_PARTITION = 'persist:browsing';

const env = readEnv(process.env, { isPackaged: app.isPackaged });

// ready 전에만 적용되는 설정 — 프로필 경로와 원격 디버깅 스위치
if (env.userDataDir) app.setPath('userData', env.userDataDir);
for (const [name, value] of getCdpSwitches({
  port: env.cdpPort,
  isPackaged: app.isPackaged,
  isPortExplicit: env.isCdpPortExplicit,
})) {
  app.commandLine.appendSwitch(name, value);
}

process.on('uncaughtException', (error) => log.error('process', 'uncaughtException', error));
process.on('unhandledRejection', (reason) => log.error('process', 'unhandledRejection', reason));

/** 메인 창 + 탭 관리자 + 단축키 + IPC 를 연결한다 (창은 하나 — 닫히면 앱 종료) */
function startBrowser(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(createAppMenuTemplate({ platform: process.platform, isDev: env.mode === 'development' })),
  );
  const window = createMainWindow(env);
  const emitToSidebar = createSidebarEmitter(() => window.webContents);
  let shortcutInput: ReturnType<typeof createShortcutInputHandler> = () => {};
  const tabManager = new TabManager({
    host: window.contentView,
    createView: () => createElectronTabView({ onInput: (event, input) => shortcutInput(event, input) }),
    onChanged: (snapshot) => emitToSidebar(IPC.tabs.changed, TabsChangedEventSchema, snapshot),
  });
  const runner = createShortcutRunner({
    tabManager,
    emitShortcut: (action) => emitToSidebar(IPC.shortcut.pressed, ShortcutPressedEventSchema, { action }),
    focusChrome: () => window.webContents.focus(),
  });
  shortcutInput = createShortcutInputHandler(runner, process.platform);
  attachShortcuts(window.webContents, runner, process.platform);
  registerIpc(ipcMain, {
    ...createAppHandlers({ getName: () => app.getName(), getVersion: () => app.getVersion(), mode: env.mode }),
    ...createTabsHandlers(tabManager),
  });
  tabManager.createTab();
}

void app.whenReady().then(() => {
  startBrowser();
  log.info('app', `시작 (${env.mode})`);
});

// 종료 전에 로그인 쿠키를 디스크에 확실히 쓴다 (재실행 시 세션 유지 — spec 002 FR-8)
let isCookieFlushed = false;
app.on('before-quit', (event) => {
  if (isCookieFlushed) return;
  event.preventDefault();
  void session
    .fromPartition(BROWSING_PARTITION)
    .cookies.flushStore()
    .catch((error: unknown) => log.warn('app', '쿠키 저장 실패', error))
    .finally(() => {
      isCookieFlushed = true;
      app.quit();
    });
});

app.on('window-all-closed', () => app.quit());
