import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { THistoryEntry } from '@shared/ipc/history';

import { HISTORY_SEARCH_DEBOUNCE_MS, useHistory } from '../useHistory';

const ENTRY: THistoryEntry = { id: 'h1', url: 'https://a.com/', title: 'A', visitedAt: '2026-11-13T00:00:00.000Z' };

afterEach(() => {
  vi.useRealTimers();
});

describe('useHistory', () => {
  it('마운트하면 빈 검색어로 바로 읽는다', async () => {
    vi.mocked(window.api.history.list).mockResolvedValue({ ok: true, data: { entryList: [ENTRY] } });
    const { result } = renderHook(() => useHistory(''));
    await waitFor(() => expect(result.current.entryList).toEqual([ENTRY]));
    expect(window.api.history.list).toHaveBeenCalledWith({ query: '' });
  });

  it('검색어가 바뀌면 잠시 뒤 한 번만 다시 읽는다', async () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(({ query }) => useHistory(query), { initialProps: { query: '' } });
    await act(() => vi.advanceTimersByTimeAsync(0));
    vi.mocked(window.api.history.list).mockClear();
    rerender({ query: '사' });
    rerender({ query: '사과' });
    await act(() => vi.advanceTimersByTimeAsync(HISTORY_SEARCH_DEBOUNCE_MS - 1));
    expect(window.api.history.list).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(window.api.history.list).toHaveBeenCalledExactlyOnceWith({ query: '사과' });
  });

  it('지우기가 성공하면 다시 읽는다', async () => {
    const { result } = renderHook(() => useHistory(''));
    await waitFor(() => expect(window.api.history.list).toHaveBeenCalledOnce());
    await act(() => result.current.remove('h1'));
    expect(window.api.history.remove).toHaveBeenCalledWith({ id: 'h1' });
    await waitFor(() => expect(window.api.history.list).toHaveBeenCalledTimes(2));
  });

  it('모두 지우기가 실패하면 다시 읽지 않고 봉투를 돌려준다', async () => {
    const failure = { ok: false as const, error: { code: 'INTERNAL' as const, message: '실패' } };
    vi.mocked(window.api.history.clear).mockResolvedValue(failure);
    const { result } = renderHook(() => useHistory(''));
    await waitFor(() => expect(window.api.history.list).toHaveBeenCalledOnce());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.clear();
    });
    expect(returned).toEqual(failure);
    expect(window.api.history.list).toHaveBeenCalledOnce();
  });

  it('읽기가 실패하면 loadError 에 문장을 둔다', async () => {
    vi.mocked(window.api.history.list).mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: '방문 기록을 불러오지 못했습니다' },
    });
    const { result } = renderHook(() => useHistory(''));
    await waitFor(() => expect(result.current.loadError).toBe('방문 기록을 불러오지 못했습니다'));
  });
});
