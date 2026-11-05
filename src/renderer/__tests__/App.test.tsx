import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';

/** jsdom 에 없는 ResizeObserver 대역 — 콘텐츠 영역 bounds 훅이 쓴다 */
class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('브라우저 크롬의 탭 목록과 사이드바 "에이전트" 제목을 보여준다', async () => {
    vi.mocked(window.api.app.getInfo).mockResolvedValue({
      ok: true,
      data: { name: 'myBrowser', version: '0.1.0', mode: 'test' },
    });
    vi.mocked(window.api.tabs.list).mockResolvedValue({ ok: true, data: { tabList: [], activeTabId: null } });
    render(<App />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '에이전트' })).toBeInTheDocument();
    expect(await screen.findByText('myBrowser v0.1.0 · 테스트')).toBeInTheDocument();
  });

  it('사이드바에 할 일 입력창·작업 실행 버튼·빈 상태 안내를 보여준다', async () => {
    vi.mocked(window.api.app.getInfo).mockResolvedValue({
      ok: true,
      data: { name: 'myBrowser', version: '0.1.0', mode: 'test' },
    });
    vi.mocked(window.api.tabs.list).mockResolvedValue({ ok: true, data: { tabList: [], activeTabId: null } });
    render(<App />);
    const sidebar = screen.getByRole('complementary', { name: '에이전트 사이드바' });
    expect(within(sidebar).getByRole('textbox', { name: '할 일' })).toBeInTheDocument();
    expect(within(sidebar).getByRole('button', { name: '작업 실행' })).toBeInTheDocument();
    expect(within(sidebar).getByText('할 일을 입력하면 여기에 진행 상황이 표시됩니다')).toBeInTheDocument();
    expect(
      within(sidebar)
        .getAllByRole('heading')
        .map((heading) => heading.textContent),
    ).toEqual(['에이전트']);
    await screen.findByText('myBrowser v0.1.0 · 테스트');
  });
});
