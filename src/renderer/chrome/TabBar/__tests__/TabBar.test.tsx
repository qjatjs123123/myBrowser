import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TTabState } from '@shared/ipc/tabs';

import { toast } from '@/lib/toast';

import { TabBar } from '..';

vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const OK = { ok: true, data: null } as const;

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

const PAGE_TAB = createTab({
  id: 'tab-2',
  url: 'https://a.com/',
  title: 'A 사이트',
  faviconUrl: 'https://a.com/favicon.ico',
  isNewTab: false,
});

function renderTabBar(overrides: Partial<Parameters<typeof TabBar>[0]> = {}) {
  const props = {
    tabList: [createTab(), PAGE_TAB],
    activeTabId: 'tab-1',
    onActivate: vi.fn().mockResolvedValue(OK),
    onClose: vi.fn().mockResolvedValue(OK),
    onCreate: vi.fn().mockResolvedValue({ ok: true, data: { tabId: 'tab-3' } }),
    ...overrides,
  };
  render(<TabBar {...props} />);
  return props;
}

describe('TabBar', () => {
  it('탭마다 제목만을 이름으로 하는 tab 을 보여준다', () => {
    renderTabBar();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    // Testing Library 의 문자열 name 은 전체 일치(exact) — '새 탭 탭 닫기' 같은 이름과 섞이지 않는다
    expect(screen.getByRole('tab', { name: '새 탭' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'A 사이트' })).toBeInTheDocument();
  });

  it('활성 탭만 aria-selected 가 true 다', () => {
    renderTabBar();
    expect(screen.getByRole('tab', { name: '새 탭' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'A 사이트' })).toHaveAttribute('aria-selected', 'false');
  });

  it('탭을 누르면 그 탭 id 로 onActivate 를 부른다', () => {
    const props = renderTabBar();
    fireEvent.click(screen.getByRole('tab', { name: 'A 사이트' }));
    expect(props.onActivate).toHaveBeenCalledWith('tab-2');
  });

  it('닫기 버튼을 누르면 그 탭 id 로 onClose 를 부른다', () => {
    const props = renderTabBar();
    fireEvent.click(screen.getByRole('button', { name: 'A 사이트 탭 닫기' }));
    expect(props.onClose).toHaveBeenCalledWith('tab-2');
  });

  it('＋ 버튼을 누르면 onCreate 를 부른다', () => {
    const props = renderTabBar();
    fireEvent.click(screen.getByRole('button', { name: '새 탭 열기' }));
    expect(props.onCreate).toHaveBeenCalledTimes(1);
  });

  it('로딩 중인 탭에는 로딩 표시가 있고 탭 이름은 제목 그대로다', () => {
    renderTabBar({ tabList: [{ ...PAGE_TAB, isLoading: true }], activeTabId: 'tab-2' });
    expect(screen.getByRole('img', { name: '로딩 중' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'A 사이트' })).toBeInTheDocument();
  });

  it('파비콘을 불러오지 못하면 기본 아이콘으로 바꾼다', () => {
    renderTabBar({ tabList: [PAGE_TAB], activeTabId: 'tab-2' });
    const favicon = screen.getByRole('presentation');
    expect(favicon).toHaveAttribute('src', 'https://a.com/favicon.ico');
    fireEvent.error(favicon);
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
    expect(screen.getByTestId('tab-default-icon')).toBeInTheDocument();
  });

  it('조작이 ok:false 면 main 의 메시지로 toast 를 띄운다', async () => {
    renderTabBar({
      onClose: vi.fn().mockResolvedValue({ ok: false, error: { code: 'NOT_FOUND', message: '탭을 찾을 수 없습니다' } }),
    });
    fireEvent.click(screen.getByRole('button', { name: '새 탭 탭 닫기' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('탭을 찾을 수 없습니다'));
  });

  it('탭들 왼쪽 자리(leading)를 그린다 (spec 010)', () => {
    renderTabBar({ leading: <button type="button">신호등</button> });
    const buttonList = screen.getAllByRole('button');
    expect(buttonList[0]).toHaveAccessibleName('신호등');
  });

  describe('Linux 창 끌기 windowDrag (spec 016)', () => {
    function renderWithDrag() {
      const windowDrag = { onPointerDown: vi.fn(), onDoubleClick: vi.fn() };
      renderTabBar({ windowDrag });
      return windowDrag;
    }

    it('빈 곳을 누르거나 더블클릭하면 windowDrag 를 부른다', () => {
      const windowDrag = renderWithDrag();
      const topBar = screen.getByTestId('window-top-bar');
      fireEvent.pointerDown(topBar);
      fireEvent.doubleClick(topBar);
      expect(windowDrag.onPointerDown).toHaveBeenCalledOnce();
      expect(windowDrag.onDoubleClick).toHaveBeenCalledOnce();
    });

    it('탭·버튼에서 누르거나 더블클릭하면 windowDrag 를 부르지 않는다', () => {
      const windowDrag = renderWithDrag();
      for (const target of [screen.getByRole('tab', { name: 'A 사이트' }), screen.getByRole('button', { name: '새 탭 열기' })]) {
        fireEvent.pointerDown(target);
        fireEvent.doubleClick(target);
      }
      expect(windowDrag.onPointerDown).not.toHaveBeenCalled();
      expect(windowDrag.onDoubleClick).not.toHaveBeenCalled();
    });

    it('windowDrag 가 있으면 CSS 드래그 영역을 주지 않고, 없으면 준다', () => {
      renderWithDrag();
      expect(screen.getByTestId('window-top-bar')).not.toHaveClass('[-webkit-app-region:drag]');
      cleanup();
      renderTabBar();
      expect(screen.getByTestId('window-top-bar')).toHaveClass('[-webkit-app-region:drag]');
    });
  });
});
