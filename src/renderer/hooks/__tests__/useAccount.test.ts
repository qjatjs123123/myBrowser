import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TAccountStatus } from '@shared/ipc/account';

import { useAccount } from '../useAccount';

const INACTIVE: TAccountStatus = { state: 'inactive' };
const ACTIVATING: TAccountStatus = {
  state: 'activating',
  activationId: '6f1c2a40-8d4e-4a8b-9c1d-2e3f4a5b6c7d',
  expiresAt: '2026-11-05T10:00:00Z',
};
const ACTIVE: TAccountStatus = { state: 'active', credits: 1000, plan: 'basic', renewsAt: null };

/** onChanged 에 넘겨진 콜백을 꺼낸다 */
function getChangedListener(): (status: TAccountStatus) => void {
  const listener = vi.mocked(window.api.account.onChanged).mock.calls[0]?.[0];
  if (!listener) throw new Error('onChanged 가 구독되지 않았습니다');
  return listener;
}

describe('useAccount', () => {
  it('처음에는 null 이고 getStatus 응답을 상태로 든다', async () => {
    vi.mocked(window.api.account.getStatus).mockResolvedValue({ ok: true, data: INACTIVE });
    const { result } = renderHook(() => useAccount());
    expect(result.current.status).toBeNull();
    await waitFor(() => expect(result.current.status).toEqual(INACTIVE));
  });

  it('account:changed 이벤트가 오면 상태를 바꾼다', async () => {
    vi.mocked(window.api.account.getStatus).mockResolvedValue({ ok: true, data: INACTIVE });
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.status).toEqual(INACTIVE));
    act(() => getChangedListener()(ACTIVE));
    expect(result.current.status).toEqual(ACTIVE);
  });

  it('첫 조회 응답보다 이벤트가 먼저 오면 이벤트 상태를 유지한다', async () => {
    let resolveStatus: (value: { ok: true; data: TAccountStatus }) => void = () => {};
    vi.mocked(window.api.account.getStatus).mockReturnValue(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );
    const { result } = renderHook(() => useAccount());
    act(() => getChangedListener()(ACTIVE));
    await act(async () => resolveStatus({ ok: true, data: INACTIVE }));
    expect(result.current.status).toEqual(ACTIVE);
  });

  it('언마운트하면 account:changed 구독을 해제한다', () => {
    vi.mocked(window.api.account.getStatus).mockResolvedValue({ ok: true, data: INACTIVE });
    const { unmount } = renderHook(() => useAccount());
    const unsubscribe = vi.mocked(window.api.account.onChanged).mock.results[0]?.value as () => void;
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('getStatus 가 ok:false 면 main 의 메시지를 loadErrorMessage 로 돌려준다', async () => {
    vi.mocked(window.api.account.getStatus).mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: '앱 내부 오류' },
    });
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.loadErrorMessage).toBe('앱 내부 오류'));
  });

  it('getStatus IPC 자체가 실패하면 기본 문구를 loadErrorMessage 로 돌려준다', async () => {
    vi.mocked(window.api.account.getStatus).mockRejectedValue(new Error('ipc down'));
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.loadErrorMessage).toBe('계정 상태를 불러오지 못했습니다'));
  });

  it('startActivation 이 성공하면 응답 상태(activating)를 바로 반영한다', async () => {
    vi.mocked(window.api.account.getStatus).mockResolvedValue({ ok: true, data: INACTIVE });
    vi.mocked(window.api.account.startActivation).mockResolvedValue({ ok: true, data: ACTIVATING });
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.status).toEqual(INACTIVE));
    await act(async () => {
      await result.current.startActivation();
    });
    expect(result.current.status).toEqual(ACTIVATING);
  });

  it('startActivation 이 ok:false 면 상태를 바꾸지 않고 실패 봉투를 돌려준다', async () => {
    vi.mocked(window.api.account.getStatus).mockResolvedValue({ ok: true, data: INACTIVE });
    const failure = {
      ok: false as const,
      error: { code: 'AGENT_ERROR' as const, message: '구독 서버에 연결하지 못했습니다' },
    };
    vi.mocked(window.api.account.startActivation).mockResolvedValue(failure);
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.status).toEqual(INACTIVE));
    let actionResult: unknown;
    await act(async () => {
      actionResult = await result.current.startActivation();
    });
    expect({ actionResult, status: result.current.status }).toEqual({ actionResult: failure, status: INACTIVE });
  });

  it('signOut IPC 자체가 실패하면 기본 문구의 실패 봉투를 돌려준다', async () => {
    vi.mocked(window.api.account.getStatus).mockResolvedValue({ ok: true, data: ACTIVE });
    vi.mocked(window.api.account.signOut).mockRejectedValue(new Error('ipc down'));
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.status).toEqual(ACTIVE));
    await expect(result.current.signOut()).resolves.toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: '연결을 해제하지 못했습니다' },
    });
  });

  it('openManage IPC 자체가 실패하면 기본 문구의 실패 봉투를 돌려준다', async () => {
    vi.mocked(window.api.account.getStatus).mockResolvedValue({ ok: true, data: ACTIVE });
    vi.mocked(window.api.account.openManage).mockRejectedValue(new Error('ipc down'));
    const { result } = renderHook(() => useAccount());
    await expect(result.current.openManage()).resolves.toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: '구독 관리 페이지를 열지 못했습니다' },
    });
  });
});
