import { useEffect, useReducer, useRef } from 'react';

import type {
  TApprovalDecision,
  TApprovalRequest,
  TModelApprovalDecision,
  TQuestion,
  TRunStatus,
  TStep,
} from '@shared/agent/run';
import type { TAgentEvent, TStartAgentResponse } from '@shared/ipc/agent';
import { fail, type TIpcResult } from '@shared/ipc/result';

import { getApi } from '@/lib/api';

/** run 종료 결과 — 사이드바 RunResult 가 보여줄 FR-5 문구 */
export interface IRunResult {
  kind: 'done' | 'failed' | 'stopped' | 'guard_stopped';
  text: string;
}

/** 승인 창의 결정 — kind=guard 는 agent·user_done·denied, kind=model 은 approved·denied */
export type TDecision = TApprovalDecision | TModelApprovalDecision;

interface IAgentRunState {
  runId: string | null;
  status: TRunStatus | null;
  stepList: TStep[];
  result: IRunResult | null;
  /** 답을 기다리는 승인 요청 — approval_resolved 가 오면 null */
  pendingApproval: TApprovalRequest | null;
  /** 답을 기다리는 질문 — question_answered 가 오면 null */
  pendingQuestion: TQuestion | null;
}

type TRunAction = { type: 'started'; runId: string } | { type: 'event'; event: TAgentEvent };

const INITIAL_STATE: IAgentRunState = {
  runId: null,
  status: null,
  stepList: [],
  result: null,
  pendingApproval: null,
  pendingQuestion: null,
};
const START_FAILED_MESSAGE = '작업을 시작하지 못했습니다';
const STOP_FAILED_MESSAGE = '작업을 중지하지 못했습니다';
const APPROVE_FAILED_MESSAGE = '승인 결과를 보내지 못했습니다';
const ANSWER_FAILED_MESSAGE = '답변을 보내지 못했습니다';
const NO_RUN_MESSAGE = '실행 중인 작업을 찾을 수 없습니다';
const NO_REQUEST_MESSAGE = '확인할 요청을 찾을 수 없습니다';

/**
 * [에이전트 run] agent:event 를 구독해 현재 run 의 상태·단계·결과·대기 요청(승인·질문)을 든다 — main 이 단일 출처.
 * start 응답 전에 온 이벤트는 runId 를 모르므로 버퍼에 모았다가, 응답의 runId 와 같은 것만 순서대로 적용한다.
 * start/stop/approve/answer 는 결과 봉투를 그대로 돌려준다 (toast 는 호출한 컴포넌트가).
 * 승인 창·질문 카드는 요청을 보낸 뒤에도 main 의 approval_resolved·question_answered 이벤트가 올 때 닫힌다.
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

  const approve = (decision: TDecision): Promise<TIpcResult<null>> =>
    requestApprove(runIdRef.current, state.pendingApproval?.requestId ?? null, decision);

  const answer = (text: string): Promise<TIpcResult<null>> =>
    requestAnswer(runIdRef.current, state.pendingQuestion?.requestId ?? null, text);

  return { ...state, start, stop, approve, answer };
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

/** agent:approve 호출 — 대기 중인 승인 요청이 없으면 부르지 않고 NOT_FOUND 봉투 */
async function requestApprove(
  runId: string | null,
  requestId: string | null,
  decision: TDecision,
): Promise<TIpcResult<null>> {
  if (!runId || !requestId) return fail('NOT_FOUND', NO_REQUEST_MESSAGE);
  try {
    return await getApi().agent.approve({ runId, requestId, decision });
  } catch {
    return fail('INTERNAL', APPROVE_FAILED_MESSAGE);
  }
}

/** agent:answer 호출 — 대기 중인 질문이 없으면 부르지 않고 NOT_FOUND 봉투 */
async function requestAnswer(
  runId: string | null,
  requestId: string | null,
  answer: string,
): Promise<TIpcResult<null>> {
  if (!runId || !requestId) return fail('NOT_FOUND', NO_REQUEST_MESSAGE);
  try {
    return await getApi().agent.answer({ runId, requestId, answer });
  } catch {
    return fail('INTERNAL', ANSWER_FAILED_MESSAGE);
  }
}

/** run 상태 전이 — started 는 새 run 으로 초기화(running), event 는 계약 순서대로 반영 */
function reduceAgentRun(state: IAgentRunState, action: TRunAction): IAgentRunState {
  if (action.type === 'started') return { ...INITIAL_STATE, runId: action.runId, status: 'running' };
  const { event } = action;
  if (event.type === 'status') return { ...state, status: event.status };
  if (event.type === 'step') return { ...state, stepList: upsertStep(state.stepList, event.step) };
  if (isWaitEvent(event)) return reduceWaitEvent(state, event);
  return { ...state, result: toRunResult(event), pendingApproval: null, pendingQuestion: null };
}

type TWaitEvent = Extract<
  TAgentEvent,
  { type: 'approval_required' | 'approval_resolved' | 'question' | 'question_answered' }
>;

/** 승인·질문 이벤트인가 */
function isWaitEvent(event: TAgentEvent): event is TWaitEvent {
  return ['approval_required', 'approval_resolved', 'question', 'question_answered'].includes(event.type);
}

/** 승인·질문 대기 반영 — 끝 이벤트는 지금 열린 요청과 requestId 가 같을 때만 닫는다 */
function reduceWaitEvent(state: IAgentRunState, event: TWaitEvent): IAgentRunState {
  switch (event.type) {
    case 'approval_required':
      return { ...state, pendingApproval: event.request };
    case 'approval_resolved':
      return state.pendingApproval?.requestId === event.requestId ? { ...state, pendingApproval: null } : state;
    case 'question':
      return { ...state, pendingQuestion: event.question };
    case 'question_answered':
      return state.pendingQuestion?.requestId === event.requestId ? { ...state, pendingQuestion: null } : state;
  }
}

/** 같은 n 이면 교체, 없으면 추가 — n 오름차순 유지 */
function upsertStep(stepList: TStep[], step: TStep): TStep[] {
  const restList = stepList.filter((item) => item.n !== step.n);
  return [...restList, step].sort((a, b) => a.n - b.n);
}

type TFinalEvent = Extract<TAgentEvent, { type: 'done' | 'failed' | 'stopped' | 'guard_stopped' }>;

/** 종료 이벤트 → FR-5 문구 */
// TODO(spec 004 5단계): guard_stopped 이벤트가 계약에서 삭제되면 그 분기와 kind 를 지운다
function toRunResult(event: TFinalEvent): IRunResult {
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
  }
}
