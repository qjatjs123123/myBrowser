import { useEffect, useState } from 'react';

import { useRunHistory } from '@/hooks/useRunHistory';
import { useTabs } from '@/hooks/useTabs';
import { createSuggestionList } from '@/utils/taskSuggestion';

interface IUseTaskSuggestionOptions {
  /** run 이 실행 중인가 — 실행이 끝나면(true → false) 최근 작업을 다시 읽는다 */
  isRunActive: boolean;
}

/**
 * [입력창 추천 목록] 현재 활성 탭의 사이트 추천 + 최근 실행한 작업 (spec 019 FR-1·6).
 * 탭은 tabs:changed 로, 최근 작업은 마운트·run 종료 때 runs:list 로 읽는다. 읽기 실패는 부가 기능이라 조용히 사이트 추천만 쓴다.
 */
export function useTaskSuggestion({ isRunActive }: IUseTaskSuggestionOptions): string[] {
  const { activeTab } = useTabs();
  const history = useRunHistory();
  const [recentTaskList, setRecentTaskList] = useState<string[]>([]);

  useEffect(() => {
    if (isRunActive) return;
    let isCurrent = true;
    void history.list().then((result) => {
      if (isCurrent && result.ok) setRecentTaskList(result.data.runList.map((run) => run.task));
    });
    return () => {
      isCurrent = false;
    };
  }, [history, isRunActive]);

  return createSuggestionList({ activeUrl: activeTab?.url ?? null, recentTaskList });
}
