import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TTabsSnapshot, TTabState } from '@shared/ipc/tabs';

import { useTabs } from '../useTabs';

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

const INITIAL: TTabsSnapshot = { tabList: [createTab()], activeTabId: 'tab-1' };

/** onChanged 에 넘겨진 콜백을 꺼낸다 */
function getChangedListener(): (event: TTabsSnapshot) => void {
  const listener = vi.mocked(window.api.tabs.onChanged).mock.calls[0]?.[0];
  if (!listener) throw new Error('onChanged 가 구독되지 않았습니다');
  return listener;
}

describe('useTabs', () => {
  it('마운트하면 tabs.list 의 목록과 활성 탭을 돌려준다', async () => {
    vi.mocked(window.api.tabs.list).mockResolvedValue({ ok: true, data: INITIAL });
    const { result } = renderHook(() => useTabs());
    await waitFor(() => expect(result.current.tabList).toEqual(INITIAL.tabList));
    expect(result.current.activeTab?.id).toBe('tab-1');
    expect(result.current.listError).toBeNull();
  });

  it('tabs:changed 이벤트가 오면 목록을 그 스냅숏으로 바꾼다', async () => {
    vi.mocked(window.api.tabs.list).mockResolvedValue({ ok: true, data: INITIAL });
    const { result } = renderHook(() => useTabs());
    await waitFor(() => expect(result.current.tabList).toHaveLength(1));
    const next: TTabsSnapshot = {
      tabList: [createTab(), createTab({ id: 'tab-2', url: 'https://a.com/', title: 'A', isNewTab: false })],
      activeTabId: 'tab-2',
    };
    act(() => getChangedListener()(next));
    expect(result.current.tabList).toHaveLength(2);
    expect(result.current.activeTab?.title).toBe('A');
  });

  it('목록 응답보다 이벤트가 먼저 오면 늦은 목록으로 덮지 않는다', async () => {
    let resolveList: (value: { ok: true; data: TTabsSnapshot }) => void = () => {};
    vi.mocked(window.api.tabs.list).mockReturnValue(new Promise((resolve) => (resolveList = resolve)));
    const { result } = renderHook(() => useTabs());
    const next: TTabsSnapshot = { tabList: [createTab({ id: 'tab-9' })], activeTabId: 'tab-9' };
    act(() => getChangedListener()(next));
    await act(async () => resolveList({ ok: true, data: INITIAL }));
    expect(result.current.activeTab?.id).toBe('tab-9');
  });

  it('언마운트하면 구독을 해제한다', async () => {
    vi.mocked(window.api.tabs.list).mockResolvedValue({ ok: true, data: INITIAL });
    const { unmount } = renderHook(() => useTabs());
    const unsubscribe = vi.mocked(window.api.tabs.onChanged).mock.results[0]?.value as ReturnType<typeof vi.fn>;
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('list 가 ok:false 면 빈 목록과 main 의 에러를 listError 로 돌려준다', async () => {
    vi.mocked(window.api.tabs.list).mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: '탭 내부 오류' },
    });
    const { result } = renderHook(() => useTabs());
    await waitFor(() => expect(result.current.listError).toEqual({ code: 'INTERNAL', message: '탭 내부 오류' }));
    expect(result.current.tabList).toEqual([]);
    expect(result.current.activeTab).toBeNull();
  });

  it('list 호출 자체가 실패하면 기본 문구로 listError 를 돌려준다', async () => {
    vi.mocked(window.api.tabs.list).mockRejectedValue(new Error('ipc down'));
    const { result } = renderHook(() => useTabs());
    await waitFor(() =>
      expect(result.current.listError).toEqual({ code: 'INTERNAL', message: '탭 목록을 불러오지 못했습니다' }),
    );
  });

  it('액션은 window.api.tabs 의 결과 봉투를 그대로 돌려준다', async () => {
    vi.mocked(window.api.tabs.list).mockResolvedValue({ ok: true, data: INITIAL });
    const envelope = { ok: false, error: { code: 'NOT_FOUND', message: '탭을 찾을 수 없습니다' } } as const;
    vi.mocked(window.api.tabs.navigate).mockResolvedValue(envelope);
    const { result } = renderHook(() => useTabs());
    const returned = await result.current.navigate({ tabId: 'tab-1', url: 'https://a.com/' });
    expect(returned).toEqual(envelope);
    expect(window.api.tabs.navigate).toHaveBeenCalledWith({ tabId: 'tab-1', url: 'https://a.com/' });
  });
});
