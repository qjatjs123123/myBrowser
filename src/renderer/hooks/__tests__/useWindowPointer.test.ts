import { renderHook, waitFor } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TWindowPointerKind } from '@shared/ipc/window';

import { useWindowPointer } from '../useWindowPointer';

const OK = { ok: true, data: null } as const;
const FAILED = { ok: false, error: { code: 'INTERNAL', message: '창이 없습니다' } } as const;

/** rAF 대역 — 테스트가 runFrames() 로 프레임을 진행한다 */
let frameList: FrameRequestCallback[] = [];
function runFrames(): void {
  const pendingList = frameList;
  frameList = [];
  for (const callback of pendingList) callback(0);
}

/** 훅의 handlePointerDown 에 넘길 React 포인터 이벤트 대역 */
function createPointerDown(screenX: number, screenY: number): ReactPointerEvent<HTMLElement> {
  const element = document.createElement('div');
  return {
    button: 0,
    pointerId: 1,
    screenX,
    screenY,
    currentTarget: element,
    preventDefault: vi.fn(),
  } as unknown as ReactPointerEvent<HTMLElement>;
}

function dispatchPointer(type: 'pointermove' | 'pointerup', screenX = 0, screenY = 0): void {
  window.dispatchEvent(new MouseEvent(type, { screenX, screenY }));
}

function pressAt(kind: TWindowPointerKind, screenX: number, screenY: number, onError = vi.fn()) {
  const { result } = renderHook(() => useWindowPointer({ onError }));
  result.current.handlePointerDown(kind, createPointerDown(screenX, screenY));
  return onError;
}

describe('useWindowPointer (spec 016)', () => {
  beforeEach(() => {
    frameList = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frameList.push(callback));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.mocked(window.api.window.pointerStart).mockResolvedValue(OK);
    vi.mocked(window.api.window.pointerMove).mockResolvedValue(OK);
    vi.mocked(window.api.window.pointerEnd).mockResolvedValue(OK);
  });
  afterEach(() => {
    dispatchPointer('pointerup');
    vi.unstubAllGlobals();
  });

  it('3px 이하로 움직이고 놓으면 IPC 를 보내지 않는다', () => {
    pressAt('move', 100, 50);
    dispatchPointer('pointermove', 103, 52);
    dispatchPointer('pointerup');
    runFrames();
    expect(window.api.window.pointerStart).not.toHaveBeenCalled();
    expect(window.api.window.pointerMove).not.toHaveBeenCalled();
    expect(window.api.window.pointerEnd).not.toHaveBeenCalled();
  });

  it('3px 를 넘게 끌면 누른 지점으로 시작하고, 프레임마다 마지막 좌표를 보내고, 놓으면 끝낸다', () => {
    pressAt('move', 100, 50);
    dispatchPointer('pointermove', 110, 50);
    dispatchPointer('pointermove', 120, 55);
    expect(window.api.window.pointerStart).toHaveBeenCalledWith({ kind: 'move', screenX: 100, screenY: 50 });
    runFrames();
    expect(window.api.window.pointerMove).toHaveBeenCalledOnce();
    expect(window.api.window.pointerMove).toHaveBeenCalledWith({ screenX: 120, screenY: 55 });
    dispatchPointer('pointerup');
    expect(window.api.window.pointerEnd).toHaveBeenCalledOnce();
  });

  it('크기 조절은 누르자마자 시작한다', () => {
    pressAt('se', 10, 20);
    expect(window.api.window.pointerStart).toHaveBeenCalledWith({ kind: 'se', screenX: 10, screenY: 20 });
  });

  it('소수 좌표는 반올림한 정수로 보낸다', () => {
    pressAt('move', 100.6, 50.4);
    dispatchPointer('pointermove', 110.4, 60.6);
    runFrames();
    expect(window.api.window.pointerStart).toHaveBeenCalledWith({ kind: 'move', screenX: 101, screenY: 50 });
    expect(window.api.window.pointerMove).toHaveBeenCalledWith({ screenX: 110, screenY: 61 });
  });

  it('같은 끌기에서 여러 번 실패해도 onError 는 1회만 부른다', async () => {
    vi.mocked(window.api.window.pointerStart).mockResolvedValue(FAILED);
    vi.mocked(window.api.window.pointerMove).mockResolvedValue(FAILED);
    const onError = pressAt('e', 0, 0);
    dispatchPointer('pointermove', 10, 0);
    runFrames();
    dispatchPointer('pointerup');
    await waitFor(() => expect(onError).toHaveBeenCalledWith('창이 없습니다'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onError).toHaveBeenCalledOnce();
  });

  it('IPC 가 throw 해도 onError 를 1회 부른다', async () => {
    vi.mocked(window.api.window.pointerStart).mockRejectedValue(new Error('ipc'));
    const onError = pressAt('n', 0, 0);
    await waitFor(() => expect(onError).toHaveBeenCalledWith('창을 조작하지 못했습니다'));
  });
});
