import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { THistoryEntry } from '@shared/ipc/history';

import { CLEAR_CONFIRM_MS, formatVisitTime, HistorySection } from '../HistorySection';

vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const ENTRY: THistoryEntry = {
  id: 'h1',
  url: 'https://a.com/page',
  title: 'A 페이지',
  visitedAt: '2026-11-13T01:02:00.000Z',
};

async function renderWithEntries(entryList: THistoryEntry[] = [ENTRY]) {
  vi.mocked(window.api.history.list).mockResolvedValue({ ok: true, data: { entryList } });
  const onSelect = vi.fn();
  render(<HistorySection focusSignal={0} onSelect={onSelect} />);
  if (entryList.length > 0) await screen.findByRole('list', { name: '방문 기록 목록' });
  return { onSelect };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('HistorySection', () => {
  it('기록을 누르면 그 url 로 이동한다', async () => {
    const { onSelect } = await renderWithEntries();
    fireEvent.click(screen.getByRole('button', { name: 'A 페이지' }));
    expect(onSelect).toHaveBeenCalledWith('https://a.com/page');
  });

  it('기록이 없으면 빈 문구를 보인다', async () => {
    await renderWithEntries([]);
    expect(await screen.findByText('방문 기록이 없습니다')).toBeInTheDocument();
  });

  it('[기록에서 지우기] 는 그 줄을 지운다', async () => {
    await renderWithEntries();
    const list = screen.getByRole('list', { name: '방문 기록 목록' });
    fireEvent.click(within(list).getByRole('button', { name: 'A 페이지 기록에서 지우기' }));
    await waitFor(() => expect(window.api.history.remove).toHaveBeenCalledWith({ id: 'h1' }));
  });

  it('[방문 기록 모두 지우기] 는 두 번 눌러야 지운다', async () => {
    await renderWithEntries();
    fireEvent.click(screen.getByRole('button', { name: '방문 기록 모두 지우기' }));
    expect(window.api.history.clear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '정말 모두 지울까요?' }));
    await waitFor(() => expect(window.api.history.clear).toHaveBeenCalledOnce());
  });

  it('확인 문구는 3초가 지나면 원래 문구로 돌아간다', async () => {
    await renderWithEntries();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '방문 기록 모두 지우기' }));
    act(() => vi.advanceTimersByTime(CLEAR_CONFIRM_MS));
    expect(screen.getByRole('button', { name: '방문 기록 모두 지우기' })).toBeInTheDocument();
  });

  it('focusSignal 이 오르면 검색 입력에 포커스한다', async () => {
    vi.mocked(window.api.history.list).mockResolvedValue({ ok: true, data: { entryList: [] } });
    const view = render(<HistorySection focusSignal={0} onSelect={vi.fn()} />);
    view.rerender(<HistorySection focusSignal={1} onSelect={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: '방문 기록 검색' })).toHaveFocus();
  });
});

describe('formatVisitTime', () => {
  it('오늘이면 시:분이다', () => {
    const now = new Date(2026, 10, 13, 15, 0);
    expect(formatVisitTime(new Date(2026, 10, 13, 9, 5).toISOString(), now)).toBe('09:05');
  });

  it('다른 날이면 월 일이다', () => {
    const now = new Date(2026, 10, 13, 15, 0);
    expect(formatVisitTime(new Date(2026, 10, 2, 9, 5).toISOString(), now)).toBe('11월 2일');
  });
});
