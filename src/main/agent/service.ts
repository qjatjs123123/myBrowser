/**
 * [AgentService] run 하나의 시작·중지·상태 전이·기록·이벤트 발신을 맡는다 (spec 003 「AgentService」).
 * - run 은 한 번에 하나. 시작 중(createDriver 대기)에도 BUSY.
 * - 종료 전이는 run 당 정확히 1회: 종료 이벤트 → store 갱신 → status 이벤트. 이미 끝났으면 아무것도 하지 않는다.
 * - stop()·가드 정지·상한 실패는 정지 플래그를 세우고 즉시 모델 요청을 abort 한다.
 * - API 키는 여기에 들어오지 않는다 (createModelClient 안에만) — 이벤트·store·로그에 키를 싣지 않는다 (SR-6).
 */
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';

import type { IRunStore, TRunStatus, TStep, TStepStatus } from '@shared/agent/run';
import type { TAgentEvent } from '@shared/ipc/agent';
import type { IBrowserDriver, TToolName } from '@shared/tools';

import { runAgentLoop, type TLoopOutcome } from './loop';
import { MissingApiKeyError, type IModelClient } from './modelClient';
import { buildFirstUserMessage, SYSTEM_PROMPT } from './prompts/system';
import { isFinalStatus, transition, type TRunEvent } from './runs';
import { createToolList, toStoredInputJson, type IToolRunContext, type TApprovalVerdict } from './tools';

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
}

export type TStartResult = { ok: true; runId: string } | { ok: false; code: 'BUSY' | 'AGENT_ERROR'; message: string };

export interface IAgentService {
  start(task: string): Promise<TStartResult>;
  /** 실행 중인 run 이면 중지 요청 후 true, 없거나 끝난 run 이면 false */
  stop(runId: string): boolean;
}

export const AGENT_MESSAGE = {
  busy: '이미 실행 중인 작업이 있습니다',
  missingApiKey: 'API 키가 없습니다. .env 에 ANTHROPIC_API_KEY 를 넣고 앱을 다시 켜 주세요',
  driverFailed: '브라우저 제어 연결에 실패했습니다',
  unexpected: '예상하지 못한 오류로 작업을 끝냈습니다',
} as const;

type THaltReason = 'stopped' | 'guard' | 'failed';

interface IRunSession {
  runId: string;
  status: TRunStatus;
  haltReason: THaltReason | null;
  controller: AbortController;
  driver: IBrowserDriver;
  toolCallCount: number;
  stepMap: Map<number, Omit<TStep, 'status'> & { inputJson: string; createdAt: string }>;
  usage: { inputTokens: number; outputTokens: number };
}

type TEndPayload =
  | { event: 'finish'; summary: string }
  | { event: 'fail'; reason: string }
  | { event: 'stop' }
  | { event: 'guardStop'; verdict: TApprovalVerdict };

const LOG_SCOPE = 'agent';

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

  const stop = (runId: string): boolean => {
    if (!active || active.runId !== runId || isFinalStatus(active.status)) return false;
    halt(active, 'stopped');
    return true;
  };

  return { start, stop };
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
    toolCallCount: 0,
    stepMap: new Map(),
    usage: { inputTokens: 0, outputTokens: 0 },
  };
  deps.runStore.createRun({ id: session.runId, task, status: 'queued', createdAt: deps.now().toISOString() });
  applyTransition(deps, session, 'start');
  return session;
}

/** 백그라운드 루프 — 예외는 failed 로 기록, 끝나면 driver.dispose() */
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
  if (outcome.kind === 'failed') return endRun(deps, session, { event: 'fail', reason: outcome.reason });
  if (!session.haltReason) endRun(deps, session, { event: 'fail', reason: AGENT_MESSAGE.unexpected });
}

function createToolContext(deps: IAgentServiceDeps, session: IRunSession): IToolRunContext {
  return {
    driver: session.driver,
    allowedHostList: deps.guardOptions.allowedHostList,
    isHalted: () => session.haltReason !== null || isFinalStatus(session.status),
    countToolCall: () => countToolCall(deps, session),
    beginStep: (step) => beginStep(deps, session, step),
    endStep: (n, status, resultText) => endStep(deps, session, { n, status, resultText }),
    stopBeforeConfirm: (verdict) => {
      endRun(deps, session, { event: 'guardStop', verdict });
      halt(session, 'guard');
    },
  };
}

function countToolCall(deps: IAgentServiceDeps, session: IRunSession): boolean {
  session.toolCallCount += 1;
  if (session.toolCallCount <= deps.maxToolCalls) return true;
  endRun(deps, session, { event: 'fail', reason: `도구 호출 한도(${deps.maxToolCalls}회)를 넘었습니다` });
  halt(session, 'failed');
  return false;
}

function beginStep(
  deps: IAgentServiceDeps,
  session: IRunSession,
  step: { tool: TToolName; input: unknown; summary: string },
) {
  const n = session.stepMap.size + 1;
  const record = {
    n,
    tool: step.tool,
    summary: step.summary,
    inputJson: toStoredInputJson(step.tool, step.input),
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

/** 정지 플래그 + 즉시 abort — 이미 선 플래그는 바꾸지 않는다 */
function halt(session: IRunSession, reason: THaltReason): void {
  session.haltReason ??= reason;
  session.controller.abort();
}

/** 종료 전이 — run 당 1회 (끝난 run 이면 무시) */
function endRun(deps: IAgentServiceDeps, session: IRunSession, payload: TEndPayload): void {
  if (isFinalStatus(session.status)) return;
  deps.emit(toEndEvent(session.runId, payload));
  applyTransition(deps, session, payload.event, toEndPatch(deps, session, payload));
}

function toEndEvent(runId: string, payload: TEndPayload): TAgentEvent {
  if (payload.event === 'finish') return { type: 'done', runId, summary: payload.summary };
  if (payload.event === 'fail') return { type: 'failed', runId, reason: payload.reason };
  if (payload.event === 'stop') return { type: 'stopped', runId };
  return { type: 'guard_stopped', runId, reason: payload.verdict.reason, display: payload.verdict.display };
}

function toEndPatch(deps: IAgentServiceDeps, session: IRunSession, payload: TEndPayload) {
  const base = { endedAt: deps.now().toISOString(), usageJson: JSON.stringify(session.usage) };
  if (payload.event === 'finish') return { ...base, summary: payload.summary };
  if (payload.event === 'fail') return { ...base, reason: payload.reason };
  if (payload.event === 'guardStop')
    return { ...base, reason: `${payload.verdict.display.action}: ${payload.verdict.display.target}` };
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
