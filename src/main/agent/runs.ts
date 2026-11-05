/**
 * [run 상태 머신] queued → running → done | failed | stopped | stopped_before_confirm.
 * 전이는 transition 한 곳에서만, 불법 전이는 throw (우리 버그를 일찍 드러낸다).
 * waiting_user 는 enum 에만 있고 이번 spec 에서는 전이가 없다 (승인·질문은 3단계).
 */
import type { TRunStatus } from '@shared/agent/run';

/** 전이를 일으키는 사건 */
export type TRunEvent = 'start' | 'finish' | 'fail' | 'stop' | 'guardStop';

/** 사건별 허용 출발 상태 → 도착 상태 */
const TRANSITION_TABLE: Record<TRunEvent, { fromList: TRunStatus[]; to: TRunStatus }> = {
  start: { fromList: ['queued'], to: 'running' },
  finish: { fromList: ['running'], to: 'done' },
  fail: { fromList: ['running'], to: 'failed' },
  stop: { fromList: ['running'], to: 'stopped' },
  guardStop: { fromList: ['running'], to: 'stopped_before_confirm' },
};

const FINAL_STATUS_LIST: readonly TRunStatus[] = ['done', 'failed', 'stopped', 'stopped_before_confirm'];

/** 다음 상태 — 허용되지 않은 전이면 throw */
export function transition(status: TRunStatus, event: TRunEvent): TRunStatus {
  const rule = TRANSITION_TABLE[event];
  if (!rule.fromList.includes(status)) {
    throw new Error(`허용되지 않은 run 전이: ${status} --${event}-->`);
  }
  return rule.to;
}

/** 끝난 상태인지 — 끝난 run 에는 더 이상 전이하지 않는다 (종료 전이 run 당 1회) */
export function isFinalStatus(status: TRunStatus): boolean {
  return FINAL_STATUS_LIST.includes(status);
}
