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
  kind: 'done' | 'failed' | 'stopped';
  text: string;
}

/** useAgentRun 의 반환 — App 이 한 번 구독해 사이드바·툴바 버튼에 나눠 준다 (spec 011) */
export type TAgentRun = ReturnType<typeof useAgentRun>;

/** 대화 기록의 한 턴 — 사용자가 준 할 일 + 그 run 의 상태·단계·결과 (renderer 메모리에만, spec 009) */
export interface ITurn {
  runId: string;
  task: string;
  status: TRunStatus | null;
  stepList: TStep[];
  result: IRunResult | null;
}

/** 아직 끝나지 않은 run 상태 — 이 동안에는 새 대화(reset)를 하지 않는다 */
const ACTIVE_STATUS_LIST: TRunStatus[] = ['queued', 'running', 'waiting_user'];

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
  /** 현재 run 의 할 일 — run 이 없으면 null */
  currentTask: string | null;
  /** 이번 세션에서 끝난(또는 다음 run 에 밀려난) 지난 턴들, 오래된 순 */
  pastTurnList: ITurn[];
}

type TRunAction =
  { type: 'started'; runId: string; task: string } | { type: 'event'; event: TAgentEvent } | { type: 'reset' };

const INITIAL_STATE: IAgentRunState = {
  runId: null,
  status: null,
  stepList: [],
  result: null,
  pendingApproval: null,
  pendingQuestion: null,
  currentTask: null,
  pastTurnList: [],
};
const START_FAILED_MESSAGE = '작업을 시작하지 못했습니다';
const STOP_FAILED_MESSAGE = '작업을 중지하지 못했습니다';
const APPROVE_FAILED_MESSAGE = '승인 결과를 보내지 못했습니다';
const ANSWER_FAILED_MESSAGE = '답변을 보내지 못했습니다';
const NO_RUN_MESSAGE = '실행 중인 작업을 찾을 수 없습니다';
const NO_REQUEST_MESSAGE = '확인할 요청을 찾을 수 없습니다';
const STOPPED_TEXT = '중지했습니다';

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
    dispatch({ type: 'started', runId: result.data.runId, task });
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

  /** 새 대화 — 실행·대기 중이면 무시한다 */
  const reset = (): void => dispatch({ type: 'reset' });

  /** 대화에 그릴 현재 턴 — run 이 없으면 null */
  const currentTurn = state.runId === null ? null : toTurn(state);

  return { ...state, currentTurn, start, stop, approve, answer, reset };
}

/** agent:start 호출 — IPC 자체가 실패해도 throw 하지 않고 실패 봉투로 바꾼다 */
async function requestStart(task: string): Promise<TIpcResult<TStartAgentResponse>> {
  return callSafely(() => getApi().agent.start({ task }), START_FAILED_MESSAGE);
}

/** agent:stop 호출 — run 이 없으면 부르지 않고 NOT_FOUND 봉투 */
async function requestStop(runId: string | null): Promise<TIpcResult<null>> {
  if (!runId) return fail('NOT_FOUND', NO_RUN_MESSAGE);
  return callSafely(() => getApi().agent.stop({ runId }), STOP_FAILED_MESSAGE);
}

/** agent:approve 호출 — 대기 중인 승인 요청이 없으면 부르지 않고 NOT_FOUND 봉투 */
async function requestApprove(
  runId: string | null,
  requestId: string | null,
  decision: TDecision,
): Promise<TIpcResult<null>> {
  if (!runId || !requestId) return fail('NOT_FOUND', NO_REQUEST_MESSAGE);
  return callSafely(() => getApi().agent.approve({ runId, requestId, decision }), APPROVE_FAILED_MESSAGE);
}

/** agent:answer 호출 — 대기 중인 질문이 없으면 부르지 않고 NOT_FOUND 봉투 */
async function requestAnswer(
  runId: string | null,
  requestId: string | null,
  answer: string,
): Promise<TIpcResult<null>> {
  if (!runId || !requestId) return fail('NOT_FOUND', NO_REQUEST_MESSAGE);
  return callSafely(() => getApi().agent.answer({ runId, requestId, answer }), ANSWER_FAILED_MESSAGE);
}

/** IPC 호출 자체가 throw 해도(preload 미노출·채널 오류) 실패 봉투로 바꾼다 — 훅은 throw 하지 않는다 */
async function callSafely<T>(call: () => Promise<TIpcResult<T>>, failMessage: string): Promise<TIpcResult<T>> {
  try {
    return await call();
  } catch {
    return fail('INTERNAL', failMessage);
  }
}

/** run 상태 전이 — started 는 직전 run 을 기록으로 넘기고 새 run(running), reset 은 기록까지 비움, event 는 계약 순서대로 반영 */
function reduceAgentRun(state: IAgentRunState, action: TRunAction): IAgentRunState {
  if (action.type === 'started') return startNewTurn(state, action.runId, action.task);
  if (action.type === 'reset') return isRunActive(state.status) ? state : INITIAL_STATE;
  const { event } = action;
  if (event.type === 'status') return { ...state, status: event.status };
  if (event.type === 'step') return { ...state, stepList: upsertStep(state.stepList, event.step) };
  if (isWaitEvent(event)) return reduceWaitEvent(state, event);
  return { ...state, result: toRunResult(event), pendingApproval: null, pendingQuestion: null };
}

/** 새 run 시작 — 직전 run 이 있으면 지난 턴으로 쌓는다 */
function startNewTurn(state: IAgentRunState, runId: string, task: string): IAgentRunState {
  const pastTurnList = state.runId === null ? state.pastTurnList : [...state.pastTurnList, toTurn(state)];
  return { ...INITIAL_STATE, runId, status: 'running', currentTask: task, pastTurnList };
}

/** 현재 run 상태 → 지난 턴 */
function toTurn({ runId, currentTask, status, stepList, result }: IAgentRunState): ITurn {
  return { runId: runId ?? '', task: currentTask ?? '', status, stepList, result };
}

/** 아직 끝나지 않은 run 인가 */
export function isRunActive(status: TRunStatus | null): boolean {
  return status !== null && ACTIVE_STATUS_LIST.includes(status);
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

type TFinalEvent = Extract<TAgentEvent, { type: 'done' | 'failed' | 'stopped' }>;

/** 종료 이벤트 → FR-5 문구 */
function toRunResult(event: TFinalEvent): IRunResult {
  switch (event.type) {
    case 'done':
      return { kind: 'done', text: event.summary };
    case 'failed':
      return { kind: 'failed', text: event.reason };
    case 'stopped':
      return { kind: 'stopped', text: STOPPED_TEXT };
  }
}
