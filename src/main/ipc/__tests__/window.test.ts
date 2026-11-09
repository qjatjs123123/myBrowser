import { describe, expect, it, vi } from 'vitest';

import { IPC } from '@shared/ipc/channels';

import type { IWindowControls } from '../../app/window';
import type { IWindowPointerSession } from '../../app/windowPointer';
import { createWindowHandlers } from '../handlers/window';
import { type IIpcMainLike, registerIpc } from '../registry';

/** 창 동작 대역 */
function createFakeControls(): IWindowControls {
  return { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() };
}

/** 창 포인터 세션 대역 */
function createFakePointer(): IWindowPointerSession {
  return { start: vi.fn(), move: vi.fn(), end: vi.fn() };
}

describe('window 핸들러 (spec 010)', () => {
  it.each([
    [IPC.window.minimize, 'minimize'],
    [IPC.window.toggleMaximize, 'toggleMaximize'],
    [IPC.window.close, 'close'],
  ] as const)('%s 는 controls.%s 를 1회 부르고 성공 봉투를 돌려준다', (channel, method) => {
    const controls = createFakeControls();
    const handlers = createWindowHandlers(controls, createFakePointer());
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
    registerIpc(ipcMain, createWindowHandlers(controls, createFakePointer()));
    const result = await listenerMap.get(IPC.window.close)?.({});
    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
  });

  it('pointerStart·pointerMove·pointerEnd 는 세션 start·move·end 를 부르고 성공 봉투를 돌려준다 (spec 016)', () => {
    const pointer = createFakePointer();
    const handlers = createWindowHandlers(createFakeControls(), pointer);
    expect(handlers[IPC.window.pointerStart]({ kind: 'move', screenX: -10, screenY: 5 })).toEqual({ ok: true, data: null });
    expect(handlers[IPC.window.pointerMove]({ screenX: 3, screenY: 4 })).toEqual({ ok: true, data: null });
    expect(handlers[IPC.window.pointerEnd]()).toEqual({ ok: true, data: null });
    expect(pointer.start).toHaveBeenCalledWith({ kind: 'move', screenX: -10, screenY: 5 });
    expect(pointer.move).toHaveBeenCalledWith({ screenX: 3, screenY: 4 });
    expect(pointer.end).toHaveBeenCalledOnce();
  });

  it.each([
    [IPC.window.pointerStart, { kind: 'grab', screenX: 1, screenY: 1 }],
    [IPC.window.pointerStart, { kind: 'move', screenX: 1.5, screenY: 1 }],
    [IPC.window.pointerMove, { screenX: '1', screenY: 1 }],
    [IPC.window.pointerMove, { screenX: 1, screenY: 1, extra: true }],
    [IPC.window.pointerEnd, { force: true }],
  ] as const)('%s 에 잘못된 입력이면 INVALID_INPUT 이고 세션을 부르지 않는다', (channel, raw) => {
    const pointer = createFakePointer();
    const handlers = createWindowHandlers(createFakeControls(), pointer);
    expect(handlers[channel](raw)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(pointer.start).not.toHaveBeenCalled();
    expect(pointer.move).not.toHaveBeenCalled();
    expect(pointer.end).not.toHaveBeenCalled();
  });
});
