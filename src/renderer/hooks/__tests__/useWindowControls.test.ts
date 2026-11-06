import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useWindowControls } from '../useWindowControls';

describe('useWindowControls', () => {
  it.each(['minimize', 'toggleMaximize', 'close'] as const)(
    '%s 는 window.api.window.%s 를 부르고 봉투를 돌려준다',
    async (method) => {
      vi.mocked(window.api.window[method]).mockResolvedValue({ ok: true, data: null });
      const { result } = renderHook(() => useWindowControls());
      expect(await result.current[method]()).toEqual({ ok: true, data: null });
      expect(window.api.window[method]).toHaveBeenCalledOnce();
    },
  );

  it('IPC 가 throw 하면 INTERNAL 실패 봉투를 돌려준다', async () => {
    vi.mocked(window.api.window.close).mockRejectedValue(new Error('ipc'));
    const { result } = renderHook(() => useWindowControls());
    expect(await result.current.close()).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: '창을 조작하지 못했습니다' },
    });
  });
});
