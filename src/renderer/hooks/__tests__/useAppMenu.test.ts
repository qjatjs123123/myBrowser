import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAppMenu } from '../useAppMenu';

describe('useAppMenu (spec 023)', () => {
  it('open 은 위치를 app:showMenu 로 보내고 결과 봉투를 돌려준다', async () => {
    vi.mocked(window.api.app.showMenu).mockResolvedValue({ ok: true, data: null });
    const { result } = renderHook(() => useAppMenu());
    await expect(result.current.open({ x: 10, y: 40 })).resolves.toEqual({ ok: true, data: null });
    expect(window.api.app.showMenu).toHaveBeenCalledWith({ x: 10, y: 40 });
  });

  it('호출이 throw 하면 INTERNAL 실패 봉투다', async () => {
    vi.mocked(window.api.app.showMenu).mockRejectedValue(new Error('no channel'));
    const { result } = renderHook(() => useAppMenu());
    const outcome = await result.current.open({ x: 0, y: 0 });
    expect(outcome).toMatchObject({ ok: false, error: { code: 'INTERNAL', message: '메뉴를 열지 못했습니다' } });
  });
});
