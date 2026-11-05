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
