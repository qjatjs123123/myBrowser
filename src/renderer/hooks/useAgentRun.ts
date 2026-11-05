import { useEffect, useReducer, useRef } from 'react';

import type { TRunStatus, TStep } from '@shared/agent/run';
import type { TAgentEvent, TStartAgentResponse } from '@shared/ipc/agent';
import { fail, type TIpcResult } from '@shared/ipc/result';

import { getApi } from '@/lib/api';

/** run 종료 결과 — 사이드바 RunResult 가 보여줄 FR-5 문구 */
export interface IRunResult {
  kind: 'done' | 'failed' | 'stopped' | 'guard_stopped';
  text: string;
}

interface IAgentRunState {
  runId: string | null;
  status: TRunStatus | null;
  stepList: TStep[];
  result: IRunResult | null;
}

type TRunAction = { type: 'started'; runId: string } | { type: 'event'; event: TAgentEvent };

const INITIAL_STATE: IAgentRunState = { runId: null, status: null, stepList: [], result: null };
const START_FAILED_MESSAGE = '작업을 시작하지 못했습니다';
const STOP_FAILED_MESSAGE = '작업을 중지하지 못했습니다';
const NO_RUN_MESSAGE = '실행 중인 작업을 찾을 수 없습니다';

/**
 * [에이전트 run] agent:event 를 구독해 현재 run 의 상태·단계·결과를 든다 — main 이 단일 출처.
 * start 응답 전에 온 이벤트는 runId 를 모르므로 버퍼에 모았다가, 응답의 runId 와 같은 것만 순서대로 적용한다.
 * start/stop 은 결과 봉투를 그대로 돌려준다 (toast 는 호출한 컴포넌트가).
 */
export function useAgentRun() {
  const [state, dispatch] = useReducer(reduceAgentRun, INITIAL_STATE);
  const runIdRef = useRef<string | null>(null);
  const bufferRef = useRef<TAgentEvent[] | null>(null);

  useEffect(
    () =>
      getApi().agent.onEvent((event) => {
        if (bufferRef.current) bufferRef.current.push(event);
        else if (event.runId === runIdRef.current) dispatch({ type: 'event', event });
      }),
    [],
  );

  const start = async (task: string): Promise<TIpcResult<TStartAgentResponse>> => {
    bufferRef.current = [];
    const result = await requestStart(task);
    const bufferedList = bufferRef.current;
    bufferRef.current = null;
    if (!result.ok) return result;
    runIdRef.current = result.data.runId;
    dispatch({ type: 'started', runId: result.data.runId });
    bufferedList
      .filter((event) => event.runId === result.data.runId)
      .forEach((event) => dispatch({ type: 'event', event }));
    return result;
  };

  const stop = (): Promise<TIpcResult<null>> => requestStop(runIdRef.current);

  return { ...state, start, stop };
}

/** agent:start 호출 — IPC 자체가 실패해도 throw 하지 않고 실패 봉투로 바꾼다 */
async function requestStart(task: string): Promise<TIpcResult<TStartAgentResponse>> {
  try {
    return await getApi().agent.start({ task });
  } catch {
    return fail('INTERNAL', START_FAILED_MESSAGE);
  }
}

/** agent:stop 호출 — run 이 없으면 부르지 않고 NOT_FOUND 봉투 */
async function requestStop(runId: string | null): Promise<TIpcResult<null>> {
  if (!runId) return fail('NOT_FOUND', NO_RUN_MESSAGE);
  try {
    return await getApi().agent.stop({ runId });
  } catch {
    return fail('INTERNAL', STOP_FAILED_MESSAGE);
  }
}

/** run 상태 전이 — started 는 새 run 으로 초기화(running), event 는 계약 순서대로 반영 */
function reduceAgentRun(state: IAgentRunState, action: TRunAction): IAgentRunState {
  if (action.type === 'started') return { ...INITIAL_STATE, runId: action.runId, status: 'running' };
  const { event } = action;
  if (event.type === 'status') return { ...state, status: event.status };
  if (event.type === 'step') return { ...state, stepList: upsertStep(state.stepList, event.step) };
  const result = toRunResult(event);
  return result ? { ...state, result } : state;
}

/** 같은 n 이면 교체, 없으면 추가 — n 오름차순 유지 */
function upsertStep(stepList: TStep[], step: TStep): TStep[] {
  const restList = stepList.filter((item) => item.n !== step.n);
  return [...restList, step].sort((a, b) => a.n - b.n);
}

type TFinalEvent = Exclude<TAgentEvent, { type: 'status' } | { type: 'step' }>;

/** 종료 이벤트 → FR-5 문구. 승인·질문 이벤트는 종료가 아니라 null */
// TODO(spec 004 Task 8): 승인·질문 이벤트를 pending 상태로 반영하면 null 분기를 지운다
function toRunResult(event: TFinalEvent): IRunResult | null {
  switch (event.type) {
    case 'done':
      return { kind: 'done', text: event.summary };
    case 'failed':
      return { kind: 'failed', text: event.reason };
    case 'stopped':
      return { kind: 'stopped', text: '중지했습니다' };
    case 'guard_stopped':
      return {
        kind: 'guard_stopped',
        text: `확정 직전에 멈췄습니다 — ${event.display.action}: ${event.display.target}. 직접 확인하고 누르세요`,
      };
    case 'approval_required':
    case 'approval_resolved':
    case 'question':
    case 'question_answered':
      return null;
  }
}
