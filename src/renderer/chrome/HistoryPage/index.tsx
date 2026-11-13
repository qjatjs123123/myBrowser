import type { TIpcResult } from '@shared/ipc/result';

import { toast } from '@/lib/toast';

import { HistorySection } from './HistorySection';

interface IHistoryPageProps {
  /** 값이 바뀔 때마다 검색 입력에 포커스 ([메뉴] 「방문 기록」·Ctrl+H) */
  focusSignal: number;
  onNavigate: (url: string) => Promise<TIpcResult<null>>;
}

/**
 * 방문 기록 전용 페이지 (spec 023) — 탭 View 는 about:blank 이고 renderer 가 콘텐츠 영역에 그린다.
 * 항목을 누르면 이 탭이 그 페이지로 이동한다.
 */
export function HistoryPage({ focusSignal, onNavigate }: IHistoryPageProps) {
  const navigate = (url: string) => void notifyFailure(onNavigate(url));
  return (
    <div className="flex h-full flex-col items-center overflow-auto bg-background px-6">
      <div className="flex w-full max-w-3xl flex-col gap-6 py-10">
        <h1 className="text-2xl font-semibold">방문 기록</h1>
        <HistorySection focusSignal={focusSignal} onSelect={navigate} />
      </div>
    </div>
  );
}

/** IPC 결과가 실패면 main 의 메시지를 toast 로 보여준다 */
async function notifyFailure(task: Promise<TIpcResult<unknown>>): Promise<void> {
  const result = await task;
  if (!result.ok) toast.error(result.error.message);
}
