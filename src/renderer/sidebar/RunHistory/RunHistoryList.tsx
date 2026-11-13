import type { TRunStatus } from '@shared/agent/run';
import type { TRunSummary } from '@shared/ipc/runs';

import { cn } from '@/lib/utils';

import { toRunTimeText } from './formatRunTime';

const EMPTY_TEXT = '아직 실행 기록이 없습니다';

/** 기록 한 줄의 상태 문구 (spec 012 FR-2) */
const STATUS_LABEL: Record<TRunStatus, string> = {
  queued: '실행 중',
  running: '실행 중',
  waiting_user: '확인 대기',
  done: '완료',
  failed: '실패',
  stopped: '중지됨',
  stopped_before_confirm: '확정 직전 정지',
};

/** 상태 문구 톤 — 실패는 destructive, 사용자 확인이 걸린 상태는 warning, 나머지는 회색 */
const STATUS_CLASS: Partial<Record<TRunStatus, string>> = {
  failed: 'text-destructive',
  waiting_user: 'text-warning',
  stopped_before_confirm: 'text-warning',
};

interface IRunHistoryListProps {
  /** 최신 먼저 (main 이 정렬해 준 순서 그대로) */
  runList: TRunSummary[];
  onSelect: (runId: string) => void;
}

/** 지난 실행 목록 — 한 줄 = 할 일(말줄임) + 상태 문구·시작 시각, 누르면 읽기 전용 보기 (spec 012 FR-2) */
export function RunHistoryList({ runList, onSelect }: IRunHistoryListProps) {
  if (runList.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {EMPTY_TEXT}
      </div>
    );
  }
  return (
    <ul role="list" aria-label="실행 기록 목록" className="flex flex-col gap-0.5">
      {runList.map((run) => (
        <li key={run.id}>
          <RunHistoryRow run={run} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}

interface IRunHistoryRowProps {
  run: TRunSummary;
  onSelect: (runId: string) => void;
}

/** 기록 한 줄 — 접근 이름은 할 일만, 상태·시각은 설명으로 (이름에 섞이지 않게) */
function RunHistoryRow({ run, onSelect }: IRunHistoryRowProps) {
  const statusLabel = STATUS_LABEL[run.status];
  const timeText = toRunTimeText(run.createdAt);
  return (
    <button
      type="button"
      aria-description={`${statusLabel} · ${timeText}`}
      onClick={() => onSelect(run.id)}
      className="flex min-h-8 w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="w-full truncate text-sm">{run.task}</span>
      <span aria-hidden className="flex gap-1.5 text-xs text-muted-foreground">
        <span className={cn(STATUS_CLASS[run.status])}>{statusLabel}</span>
        <span>{timeText}</span>
      </span>
    </button>
  );
}
