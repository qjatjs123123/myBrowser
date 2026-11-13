import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TBookmark } from '@shared/ipc/bookmarks';

import { useBookmarks } from '../useBookmarks';

const BOOKMARK: TBookmark = { id: 'b1', url: 'https://a.com/', title: 'A', createdAt: '2026-11-13T00:00:00.000Z' };

async function renderLoaded(bookmarkList: TBookmark[] = [BOOKMARK]) {
  vi.mocked(window.api.bookmarks.list).mockResolvedValue({ ok: true, data: { bookmarkList } });
  const view = renderHook(() => useBookmarks());
  await waitFor(() => expect(view.result.current.bookmarkList).toEqual(bookmarkList));
  return view;
}

describe('useBookmarks', () => {
  it('마운트하면 목록을 읽는다', async () => {
    const { result } = await renderLoaded();
    expect(result.current.isBookmarked('https://a.com/')).toBe(true);
    expect(result.current.isBookmarked('https://b.com/')).toBe(false);
  });

  it('목록 읽기가 실패하면 loadError 에 문장을 둔다', async () => {
    vi.mocked(window.api.bookmarks.list).mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: '북마크를 불러오지 못했습니다' },
    });
    const { result } = renderHook(() => useBookmarks());
    await waitFor(() => expect(result.current.loadError).toBe('북마크를 불러오지 못했습니다'));
  });

  it('없는 url 을 toggle 하면 add 하고 응답 목록으로 바꾼다', async () => {
    const { result } = await renderLoaded([]);
    vi.mocked(window.api.bookmarks.add).mockResolvedValue({ ok: true, data: { bookmarkList: [BOOKMARK] } });
    await act(() => result.current.toggle({ url: 'https://a.com/', title: 'A' }));
    expect(window.api.bookmarks.add).toHaveBeenCalledWith({ url: 'https://a.com/', title: 'A' });
    expect(result.current.bookmarkList).toEqual([BOOKMARK]);
  });

  it('있는 url 을 toggle 하면 remove 한다', async () => {
    const { result } = await renderLoaded();
    vi.mocked(window.api.bookmarks.remove).mockResolvedValue({ ok: true, data: { bookmarkList: [] } });
    await act(() => result.current.toggle({ url: 'https://a.com/', title: 'A' }));
    expect(window.api.bookmarks.remove).toHaveBeenCalledWith({ url: 'https://a.com/' });
    expect(result.current.bookmarkList).toEqual([]);
  });

  it('추가가 실패하면 봉투를 돌려주고 목록은 그대로다', async () => {
    const { result } = await renderLoaded([]);
    const failure = { ok: false as const, error: { code: 'LIMIT' as const, message: '최대' } };
    vi.mocked(window.api.bookmarks.add).mockResolvedValue(failure);
    let returned: unknown;
    await act(async () => {
      returned = await result.current.toggle({ url: 'https://a.com/', title: 'A' });
    });
    expect(returned).toEqual(failure);
    expect(result.current.bookmarkList).toEqual([]);
  });
});
