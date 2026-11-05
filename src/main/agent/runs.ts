/**
 * [run 상태 머신] queued → running ⇄ waiting_user → done | failed | stopped (stopped_before_confirm 은 레거시).
 * 전이는 transition 한 곳에서만, 불법 전이는 throw (우리 버그를 일찍 드러낸다).
 * wait·resume 은 승인·질문 대기의 시작·끝 (spec 004). 대기 중에도 stop·fail 할 수 있다.
 */
import type { TRunStatus } from '@shared/agent/run';

/** 전이를 일으키는 사건 */
export type TRunEvent = 'start' | 'finish' | 'fail' | 'stop' | 'wait' | 'resume' | 'guardStop';

/** 사건별 허용 출발 상태 → 도착 상태 */
const TRANSITION_TABLE: Record<TRunEvent, { fromList: TRunStatus[]; to: TRunStatus }> = {
  start: { fromList: ['queued'], to: 'running' },
  finish: { fromList: ['running'], to: 'done' },
  fail: { fromList: ['running', 'waiting_user'], to: 'failed' },
  stop: { fromList: ['running', 'waiting_user'], to: 'stopped' },
  wait: { fromList: ['running'], to: 'waiting_user' },
  resume: { fromList: ['waiting_user'], to: 'running' },
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
