/**
 * [AgentService] run 하나의 시작·중지·승인·질문·상태 전이·기록·이벤트 발신을 맡는다 (spec 003 「AgentService」, spec 004).
 * - run 은 한 번에 하나. 시작 중(createDriver 대기)에도 BUSY.
 * - 종료 전이는 run 당 정확히 1회: 종료 이벤트 → store 갱신 → status 이벤트. 이미 끝났으면 아무것도 하지 않는다.
 * - 승인·질문은 도구 run 안의 await — 대기 레지스트리(waits.ts)로 기다리고 approve()/answer() 가 푼다.
 * - stop()·shutdown()·상한 실패는 정지 플래그 → 대기 전부 취소(실행 없음, SR-1) → 즉시 모델 요청 abort.
 * - API 키는 여기에 들어오지 않는다 (createModelClient 안에만) — 이벤트·store·로그에 키를 싣지 않는다 (SR-6).
 * - ask_user 답 원문은 store 에 싣지 않는다 (SR-5) — 모델 tool_result 로만 간다.
 */
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';

import {
  ApprovalDecisionSchema,
  ModelApprovalDecisionSchema,
  type IRunStore,
  type TApprovalDecision,
  type TModelApprovalDecision,
  type TRunStatus,
  type TStep,
  type TStepStatus,
} from '@shared/agent/run';
import type { TAgentEvent } from '@shared/ipc/agent';
import type { IBrowserDriver, TOverlayCommand } from '@shared/tools';

import { runAgentLoop, type TLoopOutcome } from './loop';
import type { TModelMode } from '../env';
import { MissingApiKeyError, MissingCredentialError, type IModelClient } from './modelClient';
import { buildFirstUserMessage, SYSTEM_PROMPT } from './prompts/system';
import { isFinalStatus, transition, type TRunEvent } from './runs';
import { createExclusiveQueue, createToolList, type IToolRunContext, type TUserRequest } from './tools';
import {
  createWaitRegistry,
  type IWaitRegistry,
  type TCancelReason,
  type TUserAnswer,
  type TWaitAnswer,
  type TWaitKind,
} from './waits';

/** 서비스 로그 — main 의 log 와 같은 모양 */
export interface IAgentLog {
  error(scope: string, message: string, meta?: unknown): void;
}

export interface IAgentServiceDeps {
  createModelClient: () => IModelClient;
  createDriver: () => Promise<IBrowserDriver>;
  runStore: IRunStore;
  emit: (event: TAgentEvent) => void;
  now: () => Date;
  createId: () => string;
  guardOptions: { allowedHostList: string[] };
  model: string;
  maxToolCalls: number;
  log?: IAgentLog;
  /** 모델 호출 경로 — 'gateway' 일 때만 401/402/429 를 구독 문장으로 바꾼다 (spec 005 FR-6). 없으면 direct 와 같다 */
  modelMode?: TModelMode;
  /** gateway 모드 401 — 계정 서비스가 저장 토큰을 지우고 inactive 로 */
  onAuthFailure?: () => void;
  /** run 종료(done·failed·stopped) 직후 — 계정 서비스의 크레딧 갱신 (spec 005 FR-5) */
  onRunEnd?: () => void;
}

export type TStartResult = { ok: true; runId: string } | { ok: false; code: 'BUSY' | 'AGENT_ERROR'; message: string };

/** approve·answer 결과 — 실패 code 는 IPC 봉투 code 그대로 */
export type TControlResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'INVALID_INPUT'; message: string };

export interface IAgentService {
  start(task: string): Promise<TStartResult>;
  /** 실행 중(대기 포함)인 run 이면 중지 요청 후 true, 없거나 끝난 run 이면 false */
  stop(runId: string): boolean;
  /** 승인 창 결정 — kind 와 맞지 않는 decision 은 INVALID_INPUT, 없거나 처리된 요청은 NOT_FOUND */
  approve(runId: string, requestId: string, decision: TApprovalDecision | TModelApprovalDecision): TControlResult;
  /** 질문 카드 답 */
  answer(runId: string, requestId: string, answer: string): TControlResult;
  /** 앱 종료 — 활성 run 의 대기를 취소하고 failed(“앱이 종료됐습니다”)로 끝낸다 */
  shutdown(): void;
}

export const AGENT_MESSAGE = {
  busy: '이미 실행 중인 작업이 있습니다',
  missingApiKey: 'API 키가 없습니다. .env 에 ANTHROPIC_API_KEY 를 넣고 앱을 다시 켜 주세요',
  driverFailed: '브라우저 제어 연결에 실패했습니다',
  unexpected: '예상하지 못한 오류로 작업을 끝냈습니다',
  requestNotFound: '확인할 요청을 찾을 수 없습니다',
  invalidRequest: '요청 형식이 올바르지 않습니다',
  appQuit: '앱이 종료됐습니다',
  missingCredential: '구독을 시작하면 쓸 수 있습니다 — 사이드바의 [구독하고 시작하기]를 눌러 주세요',
  gatewayUnauthorized: '기기 연결이 해제됐습니다 — 다시 구독 연결을 해 주세요',
  gatewayNoCredits: '크레딧이 부족합니다 — [구독 관리]에서 충전해 주세요',
  gatewayRateLimited: '요청이 너무 많습니다 — 잠시 후 다시 시도해 주세요',
} as const;

type THaltReason = 'stopped' | 'shutdown' | 'failed';

interface IRunSession {
  runId: string;
  status: TRunStatus;
  haltReason: THaltReason | null;
  controller: AbortController;
  driver: IBrowserDriver;
  waits: IWaitRegistry;
  toolCallCount: number;
  stepMap: Map<number, Omit<TStep, 'status'> & { inputJson: string; createdAt: string }>;
  usage: { inputTokens: number; outputTokens: number };
}

type TEndPayload = { event: 'finish'; summary: string } | { event: 'fail'; reason: string } | { event: 'stop' };

const LOG_SCOPE = 'agent';
const CANCELLED: TWaitAnswer = { type: 'cancelled', reason: 'stopped' };
const NOT_FOUND: TControlResult = { ok: false, code: 'NOT_FOUND', message: AGENT_MESSAGE.requestNotFound };
const INVALID: TControlResult = { ok: false, code: 'INVALID_INPUT', message: AGENT_MESSAGE.invalidRequest };

/** AgentService 를 만든다 — 의존은 모두 주입 (테스트는 가짜 driver·store·fetch) */
export function createAgentService(deps: IAgentServiceDeps): IAgentService {
  let active: IRunSession | null = null;
  let isStarting = false;

  const start = async (task: string): Promise<TStartResult> => {
    if (active || isStarting) return { ok: false, code: 'BUSY', message: AGENT_MESSAGE.busy };
    isStarting = true;
    try {
      const prepared = await prepareRun(deps);
      if (!prepared.ok) return prepared;
      active = openSession(deps, task, prepared.driver);
      const session = active;
      void runSession(deps, session, { client: prepared.client, task }).finally(() => {
        if (active === session) active = null;
      });
      return { ok: true, runId: session.runId };
    } finally {
      isStarting = false;
    }
  };

  /** runId 가 지금 살아 있는 run 이면 그 세션 */
  const findLive = (runId: string): IRunSession | null =>
    active && active.runId === runId && !isFinalStatus(active.status) ? active : null;

  const stop = (runId: string): boolean => {
    const session = findLive(runId);
    if (!session) return false;
    halt(deps, session, 'stopped');
    return true;
  };

  const approve: IAgentService['approve'] = (runId, requestId, decision) =>
    resolveWait(findLive(runId), requestId, { type: 'decision', decision });

  const answer: IAgentService['answer'] = (runId, requestId, text) =>
    resolveWait(findLive(runId), requestId, { type: 'answer', answer: text });

  const shutdown = (): void => {
    if (!active || isFinalStatus(active.status)) return;
    halt(deps, active, 'shutdown');
    endRun(deps, active, { event: 'fail', reason: AGENT_MESSAGE.appQuit });
  };

  return { start, stop, approve, answer, shutdown };
}

/** 대기 1건을 푼다 — 없으면 NOT_FOUND, 종류와 맞지 않는 답이면 INVALID_INPUT (풀지 않는다) */
function resolveWait(session: IRunSession | null, requestId: string, userAnswer: TUserAnswer): TControlResult {
  const pending = session?.waits.getPending(requestId);
  if (!session || !pending) return NOT_FOUND;
  if (!isAnswerForKind(pending.kind, userAnswer)) return INVALID;
  return session.waits.resolve(requestId, userAnswer) ? { ok: true } : NOT_FOUND;
}

/** guard 는 agent·user_done·denied, model 은 approved·denied, question 은 답만 */
function isAnswerForKind(kind: TWaitKind, userAnswer: TUserAnswer): boolean {
  if (userAnswer.type === 'answer') return kind === 'question';
  if (kind === 'guard') return ApprovalDecisionSchema.safeParse(userAnswer.decision).success;
  if (kind === 'model') return ModelApprovalDecisionSchema.safeParse(userAnswer.decision).success;
  return false;
}

type TPrepared = { ok: true; client: IModelClient; driver: IBrowserDriver } | Extract<TStartResult, { ok: false }>;

/** ② 모델 클라이언트 ③ 드라이버 — 실패면 run 을 만들지 않는다 */
async function prepareRun(deps: IAgentServiceDeps): Promise<TPrepared> {
  let client: IModelClient;
  try {
    client = deps.createModelClient();
  } catch (error) {
    if (error instanceof MissingApiKeyError)
      return { ok: false, code: 'AGENT_ERROR', message: AGENT_MESSAGE.missingApiKey };
    if (error instanceof MissingCredentialError)
      return { ok: false, code: 'AGENT_ERROR', message: AGENT_MESSAGE.missingCredential };
    throw error;
  }
  try {
    return { ok: true, client, driver: await deps.createDriver() };
  } catch (error) {
    deps.log?.error(LOG_SCOPE, '브라우저 제어 연결 실패', toLogMeta(error));
    return { ok: false, code: 'AGENT_ERROR', message: AGENT_MESSAGE.driverFailed };
  }
}

/** ④ run 생성 → running */
function openSession(deps: IAgentServiceDeps, task: string, driver: IBrowserDriver): IRunSession {
  const session: IRunSession = {
    runId: deps.createId(),
    status: 'queued',
    haltReason: null,
    controller: new AbortController(),
    driver,
    waits: createWaitRegistry(),
    toolCallCount: 0,
    stepMap: new Map(),
    usage: { inputTokens: 0, outputTokens: 0 },
  };
  deps.runStore.createRun({ id: session.runId, task, status: 'queued', createdAt: deps.now().toISOString() });
  applyTransition(deps, session, 'start');
  return session;
}

/** 백그라운드 루프 — 예외는 failed 로 기록, 끝나면 남은 대기 취소 + driver.dispose() */
async function runSession(
  deps: IAgentServiceDeps,
  session: IRunSession,
  input: { client: IModelClient; task: string },
) {
  try {
    const outcome = await runLoopFor(deps, session, input);
    settleOutcome(deps, session, outcome);
  } catch (error) {
    deps.log?.error(LOG_SCOPE, 'run 실행 중 예외', toLogMeta(error));
    settleOutcome(deps, session, { kind: 'failed', reason: AGENT_MESSAGE.unexpected });
  } finally {
    cancelWaits(deps, session, 'stopped');
    await session.driver
      .dispose()
      .catch((error: unknown) => deps.log?.error(LOG_SCOPE, 'driver 정리 실패', toLogMeta(error)));
  }
}

async function runLoopFor(
  deps: IAgentServiceDeps,
  session: IRunSession,
  { client, task }: { client: IModelClient; task: string },
) {
  const page = await session.driver.getPageInfo();
  return runAgentLoop({
    client,
    model: deps.model,
    tools: createToolList(createToolContext(deps, session)),
    systemPrompt: SYSTEM_PROMPT,
    firstUserMessage: buildFirstUserMessage({ today: deps.now(), pageUrl: page.url, pageTitle: page.title, task }),
    signal: session.controller.signal,
    onFinal: (message) => addUsage(session, message),
  });
}

/** 루프 결과 → 종료 전이 (중지 플래그가 섰으면 결과와 상관없이 stopped) */
function settleOutcome(deps: IAgentServiceDeps, session: IRunSession, outcome: TLoopOutcome): void {
  if (session.haltReason === 'stopped') return endRun(deps, session, { event: 'stop' });
  if (outcome.kind === 'done') return endRun(deps, session, { event: 'finish', summary: outcome.summary });
  if (outcome.kind === 'failed')
    return endRun(deps, session, { event: 'fail', reason: toFailureReason(deps, outcome) });
  if (!session.haltReason) endRun(deps, session, { event: 'fail', reason: AGENT_MESSAGE.unexpected });
}

function createToolContext(deps: IAgentServiceDeps, session: IRunSession): IToolRunContext {
  return {
    driver: session.driver,
    allowedHostList: deps.guardOptions.allowedHostList,
    approvalCount: 0,
    isHalted: () => session.haltReason !== null || isFinalStatus(session.status),
    countToolCall: () => countToolCall(deps, session),
    beginStep: (step) => beginStep(deps, session, step),
    endStep: (n, status, resultText) => endStep(deps, session, { n, status, resultText }),
    waitForUser: (request) => waitForUser(deps, session, request),
    overlay: (cmd) => showOverlay(deps, session, cmd),
    runExclusive: createExclusiveQueue(),
  };
}

function countToolCall(deps: IAgentServiceDeps, session: IRunSession): boolean {
  session.toolCallCount += 1;
  if (session.toolCallCount <= deps.maxToolCalls) return true;
  endRun(deps, session, { event: 'fail', reason: `도구 호출 한도(${deps.maxToolCalls}회)를 넘었습니다` });
  halt(deps, session, 'failed');
  return false;
}

function beginStep(
  deps: IAgentServiceDeps,
  session: IRunSession,
  step: { tool: string; storedInput: unknown; summary: string },
) {
  const n = session.stepMap.size + 1;
  const record = {
    n,
    tool: step.tool,
    summary: step.summary,
    inputJson: JSON.stringify(step.storedInput ?? {}),
    createdAt: deps.now().toISOString(),
  };
  session.stepMap.set(n, record);
  deps.runStore.upsertStep(session.runId, { ...record, status: 'running' });
  deps.emit({
    type: 'step',
    runId: session.runId,
    step: { n, tool: step.tool, summary: step.summary, status: 'running' },
  });
  return n;
}

function endStep(
  deps: IAgentServiceDeps,
  session: IRunSession,
  { n, status, resultText }: { n: number; status: TStepStatus; resultText: string },
) {
  const record = session.stepMap.get(n);
  if (!record) return;
  deps.runStore.upsertStep(session.runId, { ...record, status, resultText });
  deps.emit({ type: 'step', runId: session.runId, step: { n, tool: record.tool, summary: record.summary, status } });
}

/**
 * 사용자 대기 — wait 전이(status waiting_user) → approval_required|question → 답 → approval_resolved|question_answered → resume.
 * 취소(중지·종료)면 이벤트는 cancelWaits 가 이미 보냈고, 전이는 종료 전이가 맡는다.
 */
async function waitForUser(deps: IAgentServiceDeps, session: IRunSession, request: TUserRequest) {
  if (session.haltReason !== null || isFinalStatus(session.status)) return CANCELLED;
  const requestId = session.waits.createRequestId();
  const kind: TWaitKind = request.kind === 'question' ? 'question' : request.approval.kind;
  const answerPromise = session.waits.open({ requestId, kind });
  applyTransition(deps, session, 'wait');
  deps.emit(
    request.kind === 'question'
      ? { type: 'question', runId: session.runId, question: { requestId, ...request.question } }
      : { type: 'approval_required', runId: session.runId, request: { requestId, ...request.approval } },
  );
  const answer = await answerPromise;
  if (answer.type !== 'cancelled') finishWait(deps, session, { requestId, answer });
  return answer;
}

function finishWait(
  deps: IAgentServiceDeps,
  session: IRunSession,
  { requestId, answer }: { requestId: string; answer: TUserAnswer },
) {
  const { runId } = session;
  deps.emit(
    answer.type === 'answer'
      ? { type: 'question_answered', runId, requestId }
      : { type: 'approval_resolved', runId, requestId, decision: answer.decision },
  );
  if (session.status === 'waiting_user') applyTransition(deps, session, 'resume');
}

/** 열린 대기를 전부 취소 — 승인 창에는 approval_resolved(cancelled) 를 보낸다 */
function cancelWaits(deps: IAgentServiceDeps, session: IRunSession, reason: TCancelReason): void {
  for (const request of session.waits.cancelAll(reason)) {
    if (request.kind === 'question') continue;
    deps.emit({ type: 'approval_resolved', runId: session.runId, requestId: request.requestId, decision: 'cancelled' });
  }
}

/** 오버레이 — 실패는 로그만 (오버레이 때문에 행동이 실패하지 않는다) */
async function showOverlay(deps: IAgentServiceDeps, session: IRunSession, cmd: TOverlayCommand): Promise<void> {
  await session.driver
    .showOverlay(cmd)
    .catch((error: unknown) => deps.log?.error(LOG_SCOPE, '오버레이 실패', toLogMeta(error)));
}

/** 정지 플래그 + 대기 취소 + 즉시 abort — 이미 선 플래그는 바꾸지 않는다 */
function halt(deps: IAgentServiceDeps, session: IRunSession, reason: THaltReason): void {
  session.haltReason ??= reason;
  cancelWaits(deps, session, reason === 'shutdown' ? 'shutdown' : 'stopped');
  session.controller.abort();
}

/** 종료 전이 — run 당 1회 (끝난 run 이면 무시) */
function endRun(deps: IAgentServiceDeps, session: IRunSession, payload: TEndPayload): void {
  if (isFinalStatus(session.status)) return;
  deps.emit(toEndEvent(session.runId, payload));
  applyTransition(deps, session, payload.event, toEndPatch(deps, session, payload));
  deps.onRunEnd?.();
}

const GATEWAY_REASON_MAP: Record<number, string> = {
  401: AGENT_MESSAGE.gatewayUnauthorized,
  402: AGENT_MESSAGE.gatewayNoCredits,
  429: AGENT_MESSAGE.gatewayRateLimited,
};

/** 루프 실패 사유 — gateway 모드의 401·402·429 만 구독 문장으로 바꾸고 401 이면 계정 해제를 알린다 (direct 문장은 그대로) */
function toFailureReason(deps: IAgentServiceDeps, outcome: Extract<TLoopOutcome, { kind: 'failed' }>): string {
  if (deps.modelMode !== 'gateway' || outcome.apiStatus === undefined) return outcome.reason;
  const gatewayReason = GATEWAY_REASON_MAP[outcome.apiStatus];
  if (!gatewayReason) return outcome.reason;
  if (outcome.apiStatus === 401) deps.onAuthFailure?.();
  return gatewayReason;
}

function toEndEvent(runId: string, payload: TEndPayload): TAgentEvent {
  if (payload.event === 'finish') return { type: 'done', runId, summary: payload.summary };
  if (payload.event === 'fail') return { type: 'failed', runId, reason: payload.reason };
  return { type: 'stopped', runId };
}

function toEndPatch(deps: IAgentServiceDeps, session: IRunSession, payload: TEndPayload) {
  const base = { endedAt: deps.now().toISOString(), usageJson: JSON.stringify(session.usage) };
  if (payload.event === 'finish') return { ...base, summary: payload.summary };
  if (payload.event === 'fail') return { ...base, reason: payload.reason };
  return base;
}

/** 상태 전이 1회 — store 갱신 + status 이벤트 */
function applyTransition(
  deps: IAgentServiceDeps,
  session: IRunSession,
  event: TRunEvent,
  patch: Record<string, string> = {},
) {
  session.status = transition(session.status, event);
  deps.runStore.updateRun(session.runId, { ...patch, status: session.status });
  deps.emit({ type: 'status', runId: session.runId, status: session.status });
}

function addUsage(session: IRunSession, message: BetaMessage): void {
  session.usage.inputTokens += message.usage.input_tokens;
  session.usage.outputTokens += message.usage.output_tokens;
}

/** 로그 meta — 오류 이름·메시지만 (요청 본문·헤더를 싣지 않는다) */
function toLogMeta(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: 'unknown', message: String(error) };
}
