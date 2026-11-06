import { ArrowLeft, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { TRunGetResponse, TRunSummary } from '@shared/ipc/runs';

import { Button } from '@/components/ui/button';
import { useRunHistory } from '@/hooks/useRunHistory';
import { toast } from '@/lib/toast';

import { RunHistoryDetail } from './RunHistoryDetail';
import { RunHistoryList } from './RunHistoryList';

const LOADING_TEXT = '실행 기록을 불러오는 중…';
const FAILED_TEXT = '실행 기록을 불러오지 못했습니다';

type TListState = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; runList: TRunSummary[] };

interface IRunHistoryProps {
  /** [대화로 돌아가기] */
  onClose: () => void;
}

/**
 * 지난 실행 기록 — 목록 ↔ 읽기 전용 보기 (spec 012 FR-1~4). 열 때(마운트)마다 목록을 새로 읽고,
 * 읽기 실패는 main 의 메시지로 toast + 목록 자리에 [다시 시도]. 실행·승인 버튼은 두지 않는다 (SR-1).
 */
export function RunHistory({ onClose }: IRunHistoryProps) {
  const history = useRunHistory();
  const [listState, setListState] = useState<TListState>({ kind: 'loading' });
  const [loadCount, setLoadCount] = useState(0);
  const [detail, setDetail] = useState<TRunGetResponse | null>(null);

  useEffect(() => {
    let isCancelled = false;
    void history.list().then((result) => {
      if (isCancelled) return;
      if (result.ok) {
        setListState({ kind: 'ready', runList: result.data.runList });
        return;
      }
      toast.error(result.error.message);
      setListState({ kind: 'failed' });
    });
    return () => {
      isCancelled = true;
    };
  }, [history, loadCount]);

  const handleRetry = () => {
    setListState({ kind: 'loading' });
    setLoadCount((count) => count + 1);
  };

  const handleSelect = async (runId: string) => {
    const result = await history.get(runId);
    if (result.ok) setDetail(result.data);
    else toast.error(result.error.message);
  };

  if (detail) return <RunHistoryDetail detail={detail} onBack={() => setDetail(null)} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center px-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
          <ArrowLeft aria-hidden />
          대화로 돌아가기
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2">
        <ListBody listState={listState} onRetry={handleRetry} onSelect={(runId) => void handleSelect(runId)} />
      </div>
    </div>
  );
}

interface IListBodyProps {
  listState: TListState;
  onRetry: () => void;
  onSelect: (runId: string) => void;
}

/** 목록 자리 — 불러오는 중 / 실패(다시 시도) / 목록 */
function ListBody({ listState, onRetry, onSelect }: IListBodyProps) {
  if (listState.kind === 'ready') return <RunHistoryList runList={listState.runList} onSelect={onSelect} />;
  if (listState.kind === 'loading') {
    return (
      <p role="status" className="px-2 py-4 text-center text-sm text-muted-foreground">
        {LOADING_TEXT}
      </p>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
      <p>{FAILED_TEXT}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw aria-hidden />
        다시 시도
      </Button>
    </div>
  );
}
