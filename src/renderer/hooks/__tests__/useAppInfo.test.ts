import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAppInfo } from '../useAppInfo';

const INFO = { name: 'myBrowser', version: '0.1.0', mode: 'test' } as const;

describe('useAppInfo', () => {
  it('처음엔 loading, 성공하면 앱 정보를 돌려준다', async () => {
    vi.mocked(window.api.app.getInfo).mockResolvedValue({ ok: true, data: INFO });
    const { result } = renderHook(() => useAppInfo());
    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current).toEqual({ status: 'success', info: INFO }));
  });

  it('ok:false 면 main 이 준 메시지를 error 상태로 돌려준다', async () => {
    vi.mocked(window.api.app.getInfo).mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: '앱 내부 오류' },
    });
    const { result } = renderHook(() => useAppInfo());
    await waitFor(() => expect(result.current).toEqual({ status: 'error', message: '앱 내부 오류' }));
  });

  it('IPC 자체가 실패하면 기본 문구로 error 상태가 된다', async () => {
    vi.mocked(window.api.app.getInfo).mockRejectedValue(new Error('ipc down'));
    const { result } = renderHook(() => useAppInfo());
    await waitFor(() => expect(result.current).toEqual({ status: 'error', message: '앱 정보를 불러오지 못했습니다' }));
  });
});
