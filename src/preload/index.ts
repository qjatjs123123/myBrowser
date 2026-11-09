// preload — window.api 만 노출한다. 로직·검증 없음 (.claude/rules/electron/preload.md)
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import type { IApi, TUnsubscribe } from '@shared/ipc/api';
import { IPC } from '@shared/ipc/channels';

/** main→renderer 이벤트를 구독하고 해제 함수를 돌려준다 — 콜백에는 payload 만 넘긴다 */
function subscribe<T>(channel: string, cb: (payload: T) => void): TUnsubscribe {
  const listener = (_event: IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: IApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC.app.getInfo),
  },
  tabs: {
    list: () => ipcRenderer.invoke(IPC.tabs.list),
    create: (req) => ipcRenderer.invoke(IPC.tabs.create, req),
    close: (req) => ipcRenderer.invoke(IPC.tabs.close, req),
    activate: (req) => ipcRenderer.invoke(IPC.tabs.activate, req),
    navigate: (req) => ipcRenderer.invoke(IPC.tabs.navigate, req),
    goBack: (req) => ipcRenderer.invoke(IPC.tabs.goBack, req),
    goForward: (req) => ipcRenderer.invoke(IPC.tabs.goForward, req),
    reload: (req) => ipcRenderer.invoke(IPC.tabs.reload, req),
    stop: (req) => ipcRenderer.invoke(IPC.tabs.stop, req),
    setBounds: (req) => ipcRenderer.invoke(IPC.tabs.setBounds, req),
    onChanged: (cb) => subscribe(IPC.tabs.changed, cb),
  },
  shortcut: {
    onPressed: (cb) => subscribe(IPC.shortcut.pressed, cb),
  },
  agent: {
    start: (req) => ipcRenderer.invoke(IPC.agent.start, req),
    stop: (req) => ipcRenderer.invoke(IPC.agent.stop, req),
    approve: (req) => ipcRenderer.invoke(IPC.agent.approve, req),
    answer: (req) => ipcRenderer.invoke(IPC.agent.answer, req),
    onEvent: (cb) => subscribe(IPC.agent.event, cb),
  },
  account: {
    getStatus: () => ipcRenderer.invoke(IPC.account.getStatus),
    startActivation: () => ipcRenderer.invoke(IPC.account.startActivation),
    cancelActivation: () => ipcRenderer.invoke(IPC.account.cancelActivation),
    openManage: () => ipcRenderer.invoke(IPC.account.openManage),
    signOut: () => ipcRenderer.invoke(IPC.account.signOut),
    onChanged: (cb) => subscribe(IPC.account.changed, cb),
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC.window.minimize),
    toggleMaximize: () => ipcRenderer.invoke(IPC.window.toggleMaximize),
    close: () => ipcRenderer.invoke(IPC.window.close),
    onStateChanged: (cb) => subscribe(IPC.window.stateChanged, cb),
  },
  runs: {
    list: () => ipcRenderer.invoke(IPC.runs.list),
    get: (req) => ipcRenderer.invoke(IPC.runs.get, req),
  },
  skills: {
    list: () => ipcRenderer.invoke(IPC.skills.list),
    create: (req) => ipcRenderer.invoke(IPC.skills.create, req),
    update: (req) => ipcRenderer.invoke(IPC.skills.update, req),
    delete: (req) => ipcRenderer.invoke(IPC.skills.delete, req),
  },
};

contextBridge.exposeInMainWorld('api', api);
