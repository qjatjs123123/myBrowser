import type { TRunStatus } from '@shared/agent/run';

import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<TRunStatus, string> = {
  queued: '실행 중…',
  running: '실행 중…',
  waiting_user: '실행 중…',
  done: '완료',
  failed: '실패',
  stopped: '중지됨',
  stopped_before_confirm: '확정 직전 정지',
};

const IDLE_LABEL = '대기';

interface IStatusBadgeProps {
  /** run 이 아직 없으면 null */
  status: TRunStatus | null;
}

/** 사이드바 맨 위 현재 상태 배지 — 확정 직전 정지만 강조색 (사용자가 결정해야 하는 상태) */
export function StatusBadge({ status }: IStatusBadgeProps) {
  const label = status ? STATUS_LABEL[status] : IDLE_LABEL;
  const isAttention = status === 'stopped_before_confirm';
  return (
    <span
      role="status"
      aria-label="실행 상태"
      className={cn(
        'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium transition-colors duration-150',
        isAttention ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        status === 'failed' && 'text-destructive',
      )}
    >
      {label}
    </span>
  );
}
