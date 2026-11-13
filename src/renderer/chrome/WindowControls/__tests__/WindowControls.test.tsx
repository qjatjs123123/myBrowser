import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { toast } from '@/lib/toast';

import { WindowControls } from '..';

vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe('WindowControls (spec 010)', () => {
  it('mac 이 아니면 창 닫기·창 최소화·창 최대화 버튼을 이 순서로 그린다', () => {
    render(<WindowControls isMac={false} />);
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      '창 닫기',
      '창 최소화',
      '창 최대화',
    ]);
  });

  it.each([
    ['창 닫기', 'close'],
    ['창 최소화', 'minimize'],
    ['창 최대화', 'toggleMaximize'],
  ] as const)('[%s] 를 누르면 window.api.window.%s 를 1회 부른다', async (label, method) => {
    vi.mocked(window.api.window[method]).mockResolvedValue({ ok: true, data: null });
    render(<WindowControls isMac={false} />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(window.api.window[method]).toHaveBeenCalledOnce());
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('mac 이면 버튼 없이 네이티브 신호등 자리만 둔다', () => {
    render(<WindowControls isMac />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('실패 봉투면 main 의 메시지로 toast 를 띄운다', async () => {
    vi.mocked(window.api.window.toggleMaximize).mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: '앱 내부 오류가 발생했습니다. 다시 시도해 주세요' },
    });
    render(<WindowControls isMac={false} />);
    fireEvent.click(screen.getByRole('button', { name: '창 최대화' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('앱 내부 오류가 발생했습니다. 다시 시도해 주세요'));
  });
});
