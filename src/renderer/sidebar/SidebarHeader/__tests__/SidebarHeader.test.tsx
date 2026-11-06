import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SidebarHeader } from '..';

/** [실행 기록] 을 다루지 않는 테스트의 기본 props */
const HISTORY_PROPS = { isHistoryOpen: false, onToggleHistory: () => undefined };

describe('SidebarHeader', () => {
  it('“에이전트” 제목과 현재 상태 배지를 보여준다', () => {
    render(<SidebarHeader status="waiting_user" canReset={false} onReset={vi.fn()} {...HISTORY_PROPS} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: '에이전트' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '실행 상태' })).toHaveTextContent('확인 필요');
  });

  it('비울 수 없으면 [새 대화] 가 비활성이다', () => {
    render(<SidebarHeader status="running" canReset={false} onReset={vi.fn()} {...HISTORY_PROPS} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: '새 대화' })).toBeDisabled();
  });

  it('[새 대화] 를 누르면 onReset 을 부른다', () => {
    const onReset = vi.fn();
    render(<SidebarHeader status="done" canReset onReset={onReset} {...HISTORY_PROPS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '새 대화' }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('[사이드바 닫기] 를 누르면 onClose 를 부른다 (spec 011)', () => {
    const onClose = vi.fn();
    render(<SidebarHeader status={null} canReset={false} onReset={vi.fn()} {...HISTORY_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '사이드바 닫기' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('[실행 기록] 은 기록이 보이는지를 aria-pressed 로 알린다 (spec 012)', () => {
    render(<SidebarHeader status={null} canReset={false} onReset={vi.fn()} isHistoryOpen onToggleHistory={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: '실행 기록' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('[실행 기록] 을 누르면 onToggleHistory 를 부른다 (spec 012)', () => {
    const onToggleHistory = vi.fn();
    render(
      <SidebarHeader status={null} canReset={false} onReset={vi.fn()} isHistoryOpen={false} onToggleHistory={onToggleHistory} onClose={vi.fn()} />,
    );
    const button = screen.getByRole('button', { name: '실행 기록' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(onToggleHistory).toHaveBeenCalledOnce();
  });

  it('[실행 기록] 은 [새 대화] 앞에 있다 (spec 012)', () => {
    render(<SidebarHeader status={null} canReset={false} onReset={vi.fn()} {...HISTORY_PROPS} onClose={vi.fn()} />);
    const nameList = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    expect(nameList).toEqual(['실행 기록', '새 대화', '사이드바 닫기']);
  });
});
