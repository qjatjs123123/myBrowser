import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TShortcutPressedEvent } from '@shared/ipc/shortcut';

import { useShortcut } from '../useShortcut';

function getPressedListener(): (event: TShortcutPressedEvent) => void {
  const listener = vi.mocked(window.api.shortcut.onPressed).mock.calls[0]?.[0];
  if (!listener) throw new Error('onPressed 가 구독되지 않았습니다');
  return listener;
}

describe('useShortcut', () => {
  it('shortcut:pressed 이벤트가 오면 동작 이름으로 콜백을 부른다', () => {
    const onAction = vi.fn();
    renderHook(() => useShortcut(onAction));
    act(() => getPressedListener()({ action: 'focusAddressBar' }));
    expect(onAction).toHaveBeenCalledWith('focusAddressBar');
  });

  it('콜백이 바뀌어도 다시 구독하지 않고 최신 콜백을 부른다', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useShortcut(cb), { initialProps: { cb: first } });
    rerender({ cb: second });
    act(() => getPressedListener()({ action: 'focusNewTabSearch' }));
    expect(window.api.shortcut.onPressed).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith('focusNewTabSearch');
    expect(first).not.toHaveBeenCalled();
  });

  it('언마운트하면 구독을 해제한다', () => {
    const { unmount } = renderHook(() => useShortcut(vi.fn()));
    const unsubscribe = vi.mocked(window.api.shortcut.onPressed).mock.results[0]?.value as ReturnType<typeof vi.fn>;
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
