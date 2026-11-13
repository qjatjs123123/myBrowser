import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { toast } from '@/lib/toast';

import { NavButtons } from '..';

vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const OK = { ok: true, data: null } as const;

function renderNavButtons(overrides: Partial<Parameters<typeof NavButtons>[0]> = {}) {
  const props = {
    canGoBack: true,
    canGoForward: true,
    hasTarget: true,
    isLoading: false,
    onGoBack: vi.fn().mockResolvedValue(OK),
    onGoForward: vi.fn().mockResolvedValue(OK),
    onReload: vi.fn().mockResolvedValue(OK),
    onStop: vi.fn().mockResolvedValue(OK),
    ...overrides,
  };
  render(<NavButtons {...props} />);
  return props;
}

describe('NavButtons', () => {
  it('갈 곳이 없으면 뒤로·앞으로가 비활성이다', () => {
    renderNavButtons({ canGoBack: false, canGoForward: false });
    expect(screen.getByRole('button', { name: '뒤로' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '앞으로' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '새로고침' })).toBeEnabled();
  });

  it('대상 탭이 없으면 새로고침도 비활성이다', () => {
    renderNavButtons({ canGoBack: false, canGoForward: false, hasTarget: false });
    expect(screen.getByRole('button', { name: '새로고침' })).toBeDisabled();
  });

  it('로딩 중이면 새로고침 자리에 중지 버튼이 있다', () => {
    renderNavButtons({ isLoading: true });
    expect(screen.getByRole('button', { name: '중지' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '새로고침' })).not.toBeInTheDocument();
  });

  it('버튼을 누르면 해당 콜백을 부른다', () => {
    const props = renderNavButtons();
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    fireEvent.click(screen.getByRole('button', { name: '앞으로' }));
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
    expect(props.onGoBack).toHaveBeenCalledTimes(1);
    expect(props.onGoForward).toHaveBeenCalledTimes(1);
    expect(props.onReload).toHaveBeenCalledTimes(1);
  });

  it('중지 버튼을 누르면 onStop 을 부른다', () => {
    const props = renderNavButtons({ isLoading: true });
    fireEvent.click(screen.getByRole('button', { name: '중지' }));
    expect(props.onStop).toHaveBeenCalledTimes(1);
  });

  it('조작이 ok:false 면 main 의 메시지로 toast 를 띄운다', async () => {
    renderNavButtons({
      onGoBack: vi
        .fn()
        .mockResolvedValue({ ok: false, error: { code: 'NOT_FOUND', message: '탭을 찾을 수 없습니다' } }),
    });
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('탭을 찾을 수 없습니다'));
  });
});
