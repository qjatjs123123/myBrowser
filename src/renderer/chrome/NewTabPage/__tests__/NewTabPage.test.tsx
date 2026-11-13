import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { toast } from '@/lib/toast';

import { NewTabPage } from '..';

vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const OK = { ok: true, data: null } as const;
const ENCODED_QUERY = encodeURIComponent('강남 맛집');

function renderNewTabPage(overrides: Partial<Parameters<typeof NewTabPage>[0]> = {}) {
  const props = {
    focusSignal: 0,
    bookmarkList: [],
    onNavigate: vi.fn().mockResolvedValue(OK),
    ...overrides,
  };
  const view = render(<NewTabPage {...props} />);
  return { props, view, input: screen.getByRole('textbox', { name: '새 탭 검색' }) };
}

describe('NewTabPage', () => {
  it('방문 기록 검색·목록은 그리지 않는다 (spec 023 FR-1)', () => {
    renderNewTabPage();
    expect(screen.queryByRole('textbox', { name: '방문 기록 검색' })).not.toBeInTheDocument();
    expect(window.api.history.list).not.toHaveBeenCalled();
  });

  it('제목 "새 탭" heading 을 가진다', () => {
    renderNewTabPage();
    expect(screen.getByRole('heading', { name: '새 탭' })).toBeInTheDocument();
  });

  it('네이버에서 검색 버튼은 네이버 검색 URL 로 이동한다', () => {
    const { props, input } = renderNewTabPage();
    fireEvent.change(input, { target: { value: '강남 맛집' } });
    fireEvent.click(screen.getByRole('button', { name: '네이버에서 검색' }));
    expect(props.onNavigate).toHaveBeenCalledWith(`https://search.naver.com/search.naver?query=${ENCODED_QUERY}`);
  });

  it('구글에서 검색 버튼은 구글 검색 URL 로 이동한다', () => {
    const { props, input } = renderNewTabPage();
    fireEvent.change(input, { target: { value: '강남 맛집' } });
    fireEvent.click(screen.getByRole('button', { name: '구글에서 검색' }));
    expect(props.onNavigate).toHaveBeenCalledWith(`https://www.google.com/search?q=${ENCODED_QUERY}`);
  });

  it('검색창에서 Enter 하면 네이버로 검색한다', () => {
    const { props, input } = renderNewTabPage();
    fireEvent.change(input, { target: { value: '강남 맛집' } });
    fireEvent.submit(input);
    expect(props.onNavigate).toHaveBeenCalledWith(`https://search.naver.com/search.naver?query=${ENCODED_QUERY}`);
  });

  it('입력이 비어 있으면 검색 버튼·Enter 가 아무 것도 하지 않는다', () => {
    const { props, input } = renderNewTabPage();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '네이버에서 검색' }));
    fireEvent.click(screen.getByRole('button', { name: '구글에서 검색' }));
    fireEvent.submit(input);
    expect(props.onNavigate).not.toHaveBeenCalled();
  });

  it('바로가기 "네이버" 는 네이버 홈으로 이동한다', () => {
    const { props } = renderNewTabPage();
    fireEvent.click(screen.getByRole('button', { name: '네이버' }));
    expect(props.onNavigate).toHaveBeenCalledWith('https://www.naver.com/');
  });

  it('바로가기 "구글" 은 구글 홈으로 이동한다', () => {
    const { props } = renderNewTabPage();
    fireEvent.click(screen.getByRole('button', { name: '구글' }));
    expect(props.onNavigate).toHaveBeenCalledWith('https://www.google.com/');
  });

  it('처음 신호(0)로는 포커스하지 않고, focusSignal 이 바뀌면 검색창에 포커스한다', () => {
    const { props, view, input } = renderNewTabPage();
    expect(input).not.toHaveFocus();
    view.rerender(<NewTabPage {...props} focusSignal={1} />);
    expect(input).toHaveFocus();
  });

  it('신호가 이미 온 상태로 붙으면 붙자마자 검색창에 포커스한다', () => {
    const { input } = renderNewTabPage({ focusSignal: 2 });
    expect(input).toHaveFocus();
  });

  it('이동이 ok:false 면 main 의 메시지로 toast 를 띄운다', async () => {
    renderNewTabPage({
      onNavigate: vi
        .fn()
        .mockResolvedValue({ ok: false, error: { code: 'NOT_FOUND', message: '탭을 찾을 수 없습니다' } }),
    });
    fireEvent.click(screen.getByRole('button', { name: '구글' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('탭을 찾을 수 없습니다'));
  });
});
