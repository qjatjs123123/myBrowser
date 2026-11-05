// preload — window.api 만 노출한다. 로직·검증 없음 (.claude/rules/electron/preload.md)
import { contextBridge, ipcRenderer } from 'electron';

import type { IApi } from '@shared/ipc/api';
import { IPC } from '@shared/ipc/channels';

const api: IApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC.app.getInfo),
  },
};

contextBridge.exposeInMainWorld('api', api);
