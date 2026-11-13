import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TIpcResult } from '@shared/ipc/result';

import { toast } from '@/lib/toast';

import { HistoryPage } from '..';

vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const ENTRY = { id: 'h1', url: 'https://a.com/page', title: 'A 페이지', visitedAt: '2026-11-13T01:02:00.000Z' };

type TNavigate = (url: string) => Promise<TIpcResult<null>>;

function renderPage(onNavigate = vi.fn<TNavigate>(async () => ({ ok: true, data: null }))) {
  vi.mocked(window.api.history.list).mockResolvedValue({ ok: true, data: { entryList: [ENTRY] } });
  render(<HistoryPage focusSignal={1} onNavigate={onNavigate} />);
  return { onNavigate };
}

describe('HistoryPage (spec 023)', () => {
  it('제목 "방문 기록"(h1) 하나와 검색 입력이 보이고 검색에 포커스한다', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: '방문 기록', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: '방문 기록 검색' })).toHaveFocus();
    expect(await screen.findByRole('button', { name: 'A 페이지' })).toBeInTheDocument();
  });

  it('기록을 누르면 그 url 로 이동한다', async () => {
    const { onNavigate } = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'A 페이지' }));
    expect(onNavigate).toHaveBeenCalledWith('https://a.com/page');
  });

  it('이동이 실패하면 main 의 메시지를 toast 로 보인다', async () => {
    renderPage(vi.fn<TNavigate>(async () => ({ ok: false, error: { code: 'NOT_FOUND', message: '탭을 찾을 수 없습니다' } })));
    fireEvent.click(await screen.findByRole('button', { name: 'A 페이지' }));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('탭을 찾을 수 없습니다'));
  });
});
