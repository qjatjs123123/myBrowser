import { useEffect, useState } from 'react';

import type { TBookmark, TBookmarkListResponse } from '@shared/ipc/bookmarks';
import type { TIpcResult } from '@shared/ipc/result';

import { getApi } from '@/lib/api';
import { callSafely } from '@/lib/callSafely';

const LOAD_FAILED_MESSAGE = '북마크를 불러오지 못했습니다';
const SAVE_FAILED_MESSAGE = '북마크를 저장하지 못했습니다';

type TBookmarkListResult = TIpcResult<TBookmarkListResponse>;

/** 북마크로 넣을 탭 — 제목·url 만 */
export interface IBookmarkTarget {
  url: string;
  title: string;
}

/**
 * [북마크] bookmarks:list|add|remove (spec 021 FR-1~3) — main 이 단일 출처.
 * 마운트 때 목록을 읽고, 변경이 성공하면 응답의 최신 목록으로 바꾼다. 결과 봉투는 throw 하지 않고 돌려준다 (toast 는 호출한 쪽).
 */
export function useBookmarks() {
  const [bookmarkList, setBookmarkList] = useState<TBookmark[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    void callSafely(() => getApi().bookmarks.list(), LOAD_FAILED_MESSAGE).then((result) => {
      if (isCancelled) return;
      if (result.ok) setBookmarkList(result.data.bookmarkList);
      else setLoadError(result.error.message);
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  const applyResult = (result: TBookmarkListResult): TBookmarkListResult => {
    if (result.ok) setBookmarkList(result.data.bookmarkList);
    return result;
  };
  const isBookmarked = (url: string) => bookmarkList.some((bookmark) => bookmark.url === url);

  /** 있으면 지우고 없으면 넣는다 */
  const toggle = async ({ url, title }: IBookmarkTarget): Promise<TBookmarkListResult> => {
    const call = isBookmarked(url)
      ? () => getApi().bookmarks.remove({ url })
      : () => getApi().bookmarks.add({ url, title });
    return applyResult(await callSafely(call, SAVE_FAILED_MESSAGE));
  };

  return { bookmarkList, loadError, isBookmarked, toggle };
}
