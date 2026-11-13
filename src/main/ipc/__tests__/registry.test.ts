import { afterEach, describe, expect, it, vi } from 'vitest';

import { IPC } from '@shared/ipc/channels';

import { createAppHandlers } from '../handlers/app';
import { registerIpc, type IIpcMainLike } from '../registry';

function createFakeIpcMain() {
  const listenerMap = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const ipcMain: IIpcMainLike = { handle: (channel, listener) => listenerMap.set(channel, listener) };
  return { ipcMain, listenerMap };
}

describe('registerIpc', () => {
  afterEach(() => vi.restoreAllMocks());

  it('app:getInfo·app:showMenu 를 등록하고 test:* 채널은 등록하지 않는다', () => {
    const { ipcMain, listenerMap } = createFakeIpcMain();
    registerIpc(
      ipcMain,
      createAppHandlers({ getName: () => 'myBrowser', getVersion: () => '0.1.0', mode: 'test', showMenu: vi.fn() }),
    );
    expect([...listenerMap.keys()]).toEqual([IPC.app.getInfo, IPC.app.showMenu]);
    expect([...listenerMap.keys()].some((channel) => channel.startsWith('test:'))).toBe(false);
  });

  it('핸들러가 throw 하면 INTERNAL 실패 봉투를 돌려주고 [main.error] 로 남긴다', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const { ipcMain, listenerMap } = createFakeIpcMain();
    registerIpc(ipcMain, {
      [IPC.app.getInfo]: () => {
        throw new Error('boom');
      },
    });
    const result = await listenerMap.get(IPC.app.getInfo)?.({});
    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
    expect(String(stderr.mock.calls[0]?.[0])).toContain('[main.error] [ipc] app:getInfo 처리 실패');
  });
});
