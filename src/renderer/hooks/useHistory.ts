import { useEffect, useRef, useState } from 'react';

import type { THistoryEntry } from '@shared/ipc/history';
import type { TIpcResult } from '@shared/ipc/result';

import { getApi } from '@/lib/api';
import { callSafely } from '@/lib/callSafely';

/** 검색어를 치는 동안 매 글자마다 묻지 않도록 기다리는 시간 */
export const HISTORY_SEARCH_DEBOUNCE_MS = 200;

const LOAD_FAILED_MESSAGE = '방문 기록을 불러오지 못했습니다';
const REMOVE_FAILED_MESSAGE = '방문 기록을 지우지 못했습니다';

/**
 * [방문 기록] history:list|remove|clear (spec 021 FR-5) — 조회·지우기만, 기록은 main 이 남긴다.
 * 검색어가 바뀌면 잠시 뒤 다시 읽고(첫 읽기는 바로), 지우기가 성공하면 다시 읽는다.
 */
export function useHistory(query: string) {
  const [entryList, setEntryList] = useState<THistoryEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadCount, setLoadCount] = useState(0);
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    let isCancelled = false;
    const load = () =>
      void callSafely(() => getApi().history.list({ query }), LOAD_FAILED_MESSAGE).then((result) => {
        if (isCancelled) return;
        if (result.ok) setEntryList(result.data.entryList);
        else setLoadError(result.error.message);
      });
    const timer = setTimeout(load, isFirstLoadRef.current ? 0 : HISTORY_SEARCH_DEBOUNCE_MS);
    isFirstLoadRef.current = false;
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [query, loadCount]);

  const reloadAfter = async (task: () => Promise<TIpcResult<null>>): Promise<TIpcResult<null>> => {
    const result = await callSafely(task, REMOVE_FAILED_MESSAGE);
    if (result.ok) setLoadCount((count) => count + 1);
    return result;
  };

  return {
    entryList,
    loadError,
    remove: (id: string) => reloadAfter(() => getApi().history.remove({ id })),
    clear: () => reloadAfter(() => getApi().history.clear()),
  };
}
