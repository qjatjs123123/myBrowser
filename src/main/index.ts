// 앱 진입점 — 조립만 한다. 로직은 각 모듈에 (.claude/rules/architecture.md §2)
import { app, BrowserWindow, ipcMain } from 'electron';

import { getCdpSwitches } from './app/cdp';
import { createMainWindow } from './app/window';
import { readEnv } from './env';
import { createAppHandlers } from './ipc/handlers/app';
import { registerIpc } from './ipc/registry';
import { log } from './log';

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

void app.whenReady().then(() => {
  registerIpc(
    ipcMain,
    createAppHandlers({ getName: () => app.getName(), getVersion: () => app.getVersion(), mode: env.mode }),
  );
  createMainWindow(env);
  log.info('app', `시작 (${env.mode})`);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(env);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
