import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TAccountStatus } from '@shared/ipc/account';

import { toast } from '@/lib/toast';

import { AccountCard } from '..';

vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const INACTIVE: TAccountStatus = { state: 'inactive' };
const ACTIVATING: TAccountStatus = {
  state: 'activating',
  activationId: '6f1c2a40-8d4e-4a8b-9c1d-2e3f4a5b6c7d',
  expiresAt: '2026-11-05T10:00:00Z',
};
const ACTIVE: TAccountStatus = { state: 'active', credits: 1000, plan: 'basic', renewsAt: null };

/** getStatus 가 status 를 돌려주게 하고 카드를 그린다 */
function renderWithStatus(status: TAccountStatus): void {
  vi.mocked(window.api.account.getStatus).mockResolvedValue({ ok: true, data: status });
  render(<AccountCard />);
}

/** "계정" region 이 나타날 때까지 기다린다 */
function findRegion(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: '계정' });
}

describe('AccountCard', () => {
  it('not_required 면 아무것도 렌더링하지 않는다', async () => {
    renderWithStatus({ state: 'not_required' });
    await waitFor(() => expect(window.api.account.getStatus).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('region', { name: '계정' })).not.toBeInTheDocument();
  });

  it('inactive 면 안내와 [구독하고 시작하기] 를 보여준다', async () => {
    renderWithStatus(INACTIVE);
    await findRegion();
    expect(screen.getByRole('button', { name: '구독하고 시작하기' })).toBeInTheDocument();
  });

  it('inactive 에 message 가 있으면 그 안내를 보여준다', async () => {
    renderWithStatus({ state: 'inactive', message: '시간이 지나 연결을 취소했습니다 — 다시 시도해 주세요' });
    expect(await screen.findByText('시간이 지나 연결을 취소했습니다 — 다시 시도해 주세요')).toBeInTheDocument();
  });

  it('[구독하고 시작하기] 를 누르면 startActivation 을 부르고 activating 안내로 바뀐다', async () => {
    vi.mocked(window.api.account.startActivation).mockResolvedValue({ ok: true, data: ACTIVATING });
    renderWithStatus(INACTIVE);
    fireEvent.click(await screen.findByRole('button', { name: '구독하고 시작하기' }));
    expect(await screen.findByText('구매 페이지에서 결제를 마치면 자동으로 연결됩니다')).toBeInTheDocument();
    expect(window.api.account.startActivation).toHaveBeenCalledTimes(1);
  });

  it('startActivation 이 실패하면 main 의 메시지로 toast 한다', async () => {
    vi.mocked(window.api.account.startActivation).mockResolvedValue({
      ok: false,
      error: { code: 'AGENT_ERROR', message: '구독 서버에 연결하지 못했습니다' },
    });
    renderWithStatus(INACTIVE);
    fireEvent.click(await screen.findByRole('button', { name: '구독하고 시작하기' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('구독 서버에 연결하지 못했습니다'));
  });

  it('activating 이면 안내와 [취소] 를 보여주고, 누르면 cancelActivation 을 부른다', async () => {
    vi.mocked(window.api.account.cancelActivation).mockResolvedValue({ ok: true, data: INACTIVE });
    renderWithStatus(ACTIVATING);
    expect(await screen.findByText('구매 페이지에서 결제를 마치면 자동으로 연결됩니다')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(window.api.account.cancelActivation).toHaveBeenCalledTimes(1));
  });

  it('active 면 "준비됨" 과 "크레딧 {n}" 을 보여준다', async () => {
    renderWithStatus(ACTIVE);
    await findRegion();
    expect(screen.getByText('준비됨')).toBeInTheDocument();
    expect(screen.getByText('크레딧 1000')).toBeInTheDocument();
  });

  it('active 의 credits 가 null 이면 "크레딧 확인 중" 을 보여준다', async () => {
    renderWithStatus({ ...ACTIVE, credits: null });
    expect(await screen.findByText('크레딧 확인 중')).toBeInTheDocument();
  });

  it('active 에서 [구독 관리] 를 누르면 openManage 를 부른다', async () => {
    vi.mocked(window.api.account.openManage).mockResolvedValue({ ok: true, data: null });
    renderWithStatus(ACTIVE);
    fireEvent.click(await screen.findByRole('button', { name: '구독 관리' }));
    await waitFor(() => expect(window.api.account.openManage).toHaveBeenCalledTimes(1));
  });

  it('active 에서 [연결 해제] 를 누르면 signOut 을 부르고 inactive 로 바뀐다', async () => {
    vi.mocked(window.api.account.signOut).mockResolvedValue({ ok: true, data: INACTIVE });
    renderWithStatus(ACTIVE);
    fireEvent.click(await screen.findByRole('button', { name: '연결 해제' }));
    expect(await screen.findByRole('button', { name: '구독하고 시작하기' })).toBeInTheDocument();
  });

  it('account:changed 로 active 가 오면 카드가 준비됨으로 바뀐다', async () => {
    renderWithStatus(ACTIVATING);
    await findRegion();
    const listener = vi.mocked(window.api.account.onChanged).mock.calls[0]?.[0];
    act(() => listener?.(ACTIVE));
    expect(screen.getByText('크레딧 1000')).toBeInTheDocument();
  });

  it('첫 조회가 실패하면 main 의 메시지로 toast 한다', async () => {
    vi.mocked(window.api.account.getStatus).mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: '앱 내부 오류' },
    });
    render(<AccountCard />);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('앱 내부 오류'));
  });
});
