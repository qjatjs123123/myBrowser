import { describe, expect, it, vi } from 'vitest';

import { IPC } from '@shared/ipc/channels';

import type { IWindowControls } from '../../app/window';
import { createWindowHandlers } from '../handlers/window';
import { type IIpcMainLike, registerIpc } from '../registry';

/** 창 동작 대역 */
function createFakeControls(): IWindowControls {
  return { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() };
}

describe('window 핸들러 (spec 010)', () => {
  it.each([
    [IPC.window.minimize, 'minimize'],
    [IPC.window.toggleMaximize, 'toggleMaximize'],
    [IPC.window.close, 'close'],
  ] as const)('%s 는 controls.%s 를 1회 부르고 성공 봉투를 돌려준다', (channel, method) => {
    const controls = createFakeControls();
    const handlers = createWindowHandlers(controls);
    expect(handlers[channel]()).toEqual({ ok: true, data: null });
    expect(controls[method]).toHaveBeenCalledOnce();
  });

  it('registry 로 등록했을 때 controls 가 throw 하면 INTERNAL 봉투가 된다', async () => {
    const controls = createFakeControls();
    vi.mocked(controls.close).mockImplementation(() => {
      throw new Error('destroyed');
    });
    const listenerMap = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    const ipcMain: IIpcMainLike = { handle: (channel, listener) => listenerMap.set(channel, listener) };
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    registerIpc(ipcMain, createWindowHandlers(controls));
    const result = await listenerMap.get(IPC.window.close)?.({});
    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
  });
});
