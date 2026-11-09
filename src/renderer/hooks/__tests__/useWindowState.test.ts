import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TWindowState } from '@shared/ipc/window';

import { useWindowState } from '../useWindowState';

function getStateListener(): (state: TWindowState) => void {
  const listener = vi.mocked(window.api.window.onStateChanged).mock.calls[0]?.[0];
  if (!listener) throw new Error('onStateChanged 가 구독되지 않았습니다');
  return listener;
}

describe('useWindowState', () => {
  it('처음에는 최대화가 아니다', () => {
    const { result } = renderHook(() => useWindowState());
    expect(result.current).toEqual({ isMaximized: false });
  });

  it('window:stateChanged 가 오면 그 값으로 바뀐다', () => {
    const { result } = renderHook(() => useWindowState());
    act(() => getStateListener()({ isMaximized: true }));
    expect(result.current).toEqual({ isMaximized: true });
    act(() => getStateListener()({ isMaximized: false }));
    expect(result.current).toEqual({ isMaximized: false });
  });

  it('언마운트하면 구독을 해제한다', () => {
    const { unmount } = renderHook(() => useWindowState());
    const unsubscribe = vi.mocked(window.api.window.onStateChanged).mock.results[0]?.value as ReturnType<typeof vi.fn>;
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
