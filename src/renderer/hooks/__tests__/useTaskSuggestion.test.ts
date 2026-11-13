import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TRunSummary } from '@shared/ipc/runs';
import type { TTabsSnapshot, TTabState } from '@shared/ipc/tabs';

import { useTaskSuggestion } from '../useTaskSuggestion';

const NEW_TAB = '네이버에서 맛집 검색해서 평점 높은 곳 3개 알려줘';
const PAGE = '이 페이지 핵심만 3줄로 요약해줘';

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

function createRun(task: string): TRunSummary {
  return {
    id: `run-${task}`,
    task,
    status: 'done',
    summary: null,
    reason: null,
    createdAt: '2026-11-13T00:00:00.000Z',
    endedAt: null,
  };
}

/** onChanged 에 넘겨진 콜백을 꺼낸다 */
function getChangedListener(): (event: TTabsSnapshot) => void {
  const listener = vi.mocked(window.api.tabs.onChanged).mock.calls[0]?.[0];
  if (!listener) throw new Error('onChanged 가 구독되지 않았습니다');
  return listener;
}

describe('useTaskSuggestion (spec 019)', () => {
  it('마운트하면 runs.list 의 최근 작업을 사이트 추천 뒤에 붙인다', async () => {
    vi.mocked(window.api.runs.list).mockResolvedValue({ ok: true, data: { runList: [createRun('날씨 알려줘')] } });
    const { result } = renderHook(() => useTaskSuggestion({ isRunActive: false }));
    await waitFor(() => expect(result.current).toEqual([NEW_TAB, '날씨 알려줘']));
    expect(window.api.runs.list).toHaveBeenCalledOnce();
  });

  it('활성 탭이 바뀌면 사이트 추천이 바뀐다', async () => {
    vi.mocked(window.api.runs.list).mockResolvedValue({ ok: true, data: { runList: [] } });
    const { result } = renderHook(() => useTaskSuggestion({ isRunActive: false }));
    await waitFor(() => expect(window.api.runs.list).toHaveBeenCalled());
    act(() =>
      getChangedListener()({
        tabList: [createTab({ url: 'https://example.com/', isNewTab: false })],
        activeTabId: 'tab-1',
      }),
    );
    expect(result.current[0]).toBe(PAGE);
  });

  it('run 이 끝나면(실행 중 → 아님) 최근 작업을 다시 읽는다', async () => {
    vi.mocked(window.api.runs.list).mockResolvedValue({ ok: true, data: { runList: [] } });
    const { result, rerender } = renderHook(({ isRunActive }) => useTaskSuggestion({ isRunActive }), {
      initialProps: { isRunActive: false },
    });
    await waitFor(() => expect(window.api.runs.list).toHaveBeenCalledOnce());
    rerender({ isRunActive: true });
    expect(window.api.runs.list).toHaveBeenCalledOnce();
    vi.mocked(window.api.runs.list).mockResolvedValue({ ok: true, data: { runList: [createRun('새 작업')] } });
    rerender({ isRunActive: false });
    await waitFor(() => expect(result.current).toContain('새 작업'));
    expect(window.api.runs.list).toHaveBeenCalledTimes(2);
  });

  it('runs.list 가 실패하면 사이트 추천만 돌려준다', async () => {
    vi.mocked(window.api.runs.list).mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: '실패' },
    });
    const { result } = renderHook(() => useTaskSuggestion({ isRunActive: false }));
    await waitFor(() => expect(window.api.runs.list).toHaveBeenCalled());
    expect(result.current).toEqual([NEW_TAB]);
  });

  it('runs.list 가 throw 해도 사이트 추천만 돌려준다', async () => {
    vi.mocked(window.api.runs.list).mockRejectedValue(new Error('채널 없음'));
    const { result } = renderHook(() => useTaskSuggestion({ isRunActive: false }));
    await waitFor(() => expect(window.api.runs.list).toHaveBeenCalled());
    expect(result.current).toEqual([NEW_TAB]);
  });
});
