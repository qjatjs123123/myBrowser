import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TShortcutPressedEvent } from '@shared/ipc/shortcut';
import type { TTabsSnapshot, TTabState } from '@shared/ipc/tabs';

import { toast } from '@/lib/toast';

import { BrowserChrome } from '..';

vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

/** jsdom 에 없는 ResizeObserver 대역 */
class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

function createTab(overrides: Partial<TTabState> = {}): TTabState {
  return {
    id: 'tab-1',
    url: 'about:blank',
    title: '새 탭',
    faviconUrl: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isNewTab: true,
    zoomPercent: 100,
    agentActivity: null,
    ...overrides,
  };
}

const PAGE_TAB = createTab({ id: 'tab-2', url: 'https://a.com/', title: 'A 사이트', isNewTab: false });

function givenSnapshot(snapshot: TTabsSnapshot): void {
  vi.mocked(window.api.tabs.list).mockResolvedValue({ ok: true, data: snapshot });
}

function getPressedListener(): (event: TShortcutPressedEvent) => void {
  const listener = vi.mocked(window.api.shortcut.onPressed).mock.calls[0]?.[0];
  if (!listener) throw new Error('onPressed 가 구독되지 않았습니다');
  return listener;
}

/** 탭 목록이 반영된 주소창 — 활성 탭이 바뀌면 주소창이 새로 붙으므로 값이 들어온 뒤 다시 찾는다 */
async function findAddressBar(url: string): Promise<HTMLElement> {
  await waitFor(() => expect(screen.getByRole('combobox', { name: '주소창' })).toHaveValue(url));
  return screen.getByRole('combobox', { name: '주소창' });
}

describe('BrowserChrome', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.mocked(window.api.tabs.navigate).mockResolvedValue({ ok: true, data: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('활성 탭이 새 탭이면 탭 콘텐츠 영역에 시작 화면을 그린다', async () => {
    givenSnapshot({ tabList: [createTab()], activeTabId: 'tab-1' });
    render(<BrowserChrome />);
    expect(await screen.findByRole('heading', { name: '새 탭' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '탭 콘텐츠' })).toContainElement(
      screen.getByRole('textbox', { name: '새 탭 검색' }),
    );
  });

  it('활성 탭이 웹페이지면 시작 화면을 그리지 않고 주소창에 URL 을 보여준다', async () => {
    givenSnapshot({ tabList: [createTab(), PAGE_TAB], activeTabId: 'tab-2' });
    render(<BrowserChrome />);
    expect(await findAddressBar('https://a.com/')).toHaveValue('https://a.com/');
    expect(screen.queryByRole('heading', { name: '새 탭' })).not.toBeInTheDocument();
  });

  it('주소창 이동은 활성 탭 id 로 tabs.navigate 를 부른다', async () => {
    givenSnapshot({ tabList: [createTab(), PAGE_TAB], activeTabId: 'tab-2' });
    render(<BrowserChrome />);
    const input = await findAddressBar('https://a.com/');
    fireEvent.change(input, { target: { value: 'naver.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(window.api.tabs.navigate).toHaveBeenCalledWith({ tabId: 'tab-2', url: 'https://naver.com/' });
  });

  it('시작 화면 검색도 활성 탭 id 로 tabs.navigate 를 부른다', async () => {
    givenSnapshot({ tabList: [createTab()], activeTabId: 'tab-1' });
    render(<BrowserChrome />);
    fireEvent.click(await screen.findByRole('button', { name: '구글' }));
    expect(window.api.tabs.navigate).toHaveBeenCalledWith({ tabId: 'tab-1', url: 'https://www.google.com/' });
  });

  it('focusAddressBar 단축키 이벤트가 오면 주소창에 포커스한다', async () => {
    givenSnapshot({ tabList: [PAGE_TAB], activeTabId: 'tab-2' });
    render(<BrowserChrome />);
    const input = await findAddressBar('https://a.com/');
    act(() => getPressedListener()({ action: 'focusAddressBar' }));
    expect(input).toHaveFocus();
  });

  it('focusNewTabSearch 단축키 이벤트가 오면 시작 화면 검색창에 포커스한다', async () => {
    givenSnapshot({ tabList: [createTab()], activeTabId: 'tab-1' });
    render(<BrowserChrome />);
    const input = await screen.findByRole('textbox', { name: '새 탭 검색' });
    act(() => getPressedListener()({ action: 'focusNewTabSearch' }));
    expect(input).toHaveFocus();
  });

  it('toggleSidebar 단축키 이벤트는 시작 화면 검색창에 포커스하지 않는다', async () => {
    givenSnapshot({ tabList: [createTab()], activeTabId: 'tab-1' });
    render(<BrowserChrome />);
    const input = await screen.findByRole('textbox', { name: '새 탭 검색' });
    act(() => getPressedListener()({ action: 'toggleSidebar' }));
    expect(input).not.toHaveFocus();
  });

  it('toggleSidebar 단축키 이벤트는 주소창에 포커스하지 않는다', async () => {
    givenSnapshot({ tabList: [PAGE_TAB], activeTabId: 'tab-2' });
    render(<BrowserChrome />);
    const input = await findAddressBar('https://a.com/');
    act(() => getPressedListener()({ action: 'toggleSidebar' }));
    expect(input).not.toHaveFocus();
  });

  it('뒤로 버튼은 활성 탭 id 로 tabs.goBack 을 부른다', async () => {
    vi.mocked(window.api.tabs.goBack).mockResolvedValue({ ok: true, data: null });
    givenSnapshot({ tabList: [{ ...PAGE_TAB, canGoBack: true }], activeTabId: 'tab-2' });
    render(<BrowserChrome />);
    const backButton = screen.getByRole('button', { name: '뒤로' });
    await waitFor(() => expect(backButton).toBeEnabled());
    fireEvent.click(backButton);
    expect(window.api.tabs.goBack).toHaveBeenCalledWith({ tabId: 'tab-2' });
  });

  it('탭 목록을 불러오지 못하면 그 메시지로 toast 를 띄운다', async () => {
    vi.mocked(window.api.tabs.list).mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: '탭 내부 오류' },
    });
    render(<BrowserChrome />);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('탭 내부 오류'));
  });
});

describe('BrowserChrome 북마크·찾기·배율 (spec 021)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function renderWithPageTab(tab: TTabState = PAGE_TAB) {
    givenSnapshot({ tabList: [tab], activeTabId: tab.id });
    render(<BrowserChrome />);
    await findAddressBar(tab.url);
  }

  it('[북마크] 를 누르면 활성 탭을 북마크에 넣는다', async () => {
    await renderWithPageTab();
    fireEvent.click(screen.getByRole('button', { name: '북마크' }));
    await waitFor(() =>
      expect(window.api.bookmarks.add).toHaveBeenCalledWith({ url: 'https://a.com/', title: 'A 사이트' }),
    );
  });

  it('toggleBookmark 단축키도 활성 탭을 북마크에 넣는다', async () => {
    await renderWithPageTab();
    act(() => getPressedListener()({ action: 'toggleBookmark' }));
    await waitFor(() => expect(window.api.bookmarks.add).toHaveBeenCalled());
  });

  it('북마크 추가가 실패하면 main 의 메시지로 toast 한다', async () => {
    vi.mocked(window.api.bookmarks.add).mockResolvedValueOnce({
      ok: false,
      error: { code: 'LIMIT', message: '북마크는 최대 500개까지 저장할 수 있습니다' },
    });
    await renderWithPageTab();
    fireEvent.click(screen.getByRole('button', { name: '북마크' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('북마크는 최대 500개까지 저장할 수 있습니다'));
  });

  it('openFindBar 단축키면 찾기 줄이 열린다', async () => {
    await renderWithPageTab();
    act(() => getPressedListener()({ action: 'openFindBar' }));
    expect(screen.getByRole('search', { name: '페이지에서 찾기' })).toBeInTheDocument();
  });

  it('새 탭에서는 openFindBar 로 찾기 줄이 열리지 않는다', async () => {
    givenSnapshot({ tabList: [createTab()], activeTabId: 'tab-1' });
    render(<BrowserChrome />);
    await screen.findByRole('textbox', { name: '새 탭 검색' });
    act(() => getPressedListener()({ action: 'openFindBar' }));
    expect(screen.queryByRole('search', { name: '페이지에서 찾기' })).not.toBeInTheDocument();
  });

  it('배율이 100% 가 아니면 배율 버튼을 누를 때 100% 로 되돌린다', async () => {
    await renderWithPageTab({ ...PAGE_TAB, zoomPercent: 125 });
    fireEvent.click(screen.getByRole('button', { name: /확대\/축소 125%/ }));
    expect(window.api.tabs.zoom).toHaveBeenCalledWith({ tabId: 'tab-2', direction: 'reset' });
  });

  it('focusHistorySearch 단축키면 새 탭의 방문 기록 검색에 포커스한다', async () => {
    givenSnapshot({ tabList: [createTab()], activeTabId: 'tab-1' });
    render(<BrowserChrome />);
    const historyInput = await screen.findByRole('textbox', { name: '방문 기록 검색' });
    act(() => getPressedListener()({ action: 'focusHistorySearch' }));
    expect(historyInput).toHaveFocus();
  });
});
