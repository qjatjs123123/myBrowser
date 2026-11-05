/**
 * [도구 래퍼] 15개 도구를 betaZodTool 로 감싸 공통 순서를 강제한다 (spec 003 「도구 래퍼」, spec 004 「승인 흐름」).
 * 구조 도구 13개와 픽셀 멤버는 같은 파이프라인 runGuardedAction 을 탄다:
 * ⓪ 정지 플래그·호출 상한 → 대상 해석 → ① step 시작 → ② 가드 (block → is_error,
 * require_approval → 실행 없이 사용자 대기 → 결정) → ③ 실행 → ④ step 완료.
 * 모든 호출은 ctx.runExclusive(run 하나에 큐 1개)로 하나씩 돈다 — 대기 중에는 다른 도구가 시작하지 않는다.
 * 승인 전에는 act() 를 부르지 않는다 (SR-1). 승인은 그 호출 1회에만 쓴다 (SR-2). 가드를 끄는 옵션은 없다.
 */
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ToolError } from '@anthropic-ai/sdk/lib/tools/ToolError';

import type { TStepStatus } from '@shared/agent/run';
import type { TGuardVerdict } from '@shared/guard/types';
import {
  STATEFUL_TOOL_NAME_LIST,
  type IBrowserDriver,
  type IGuardTarget,
  type IPoint,
  type TOverlayCommand,
  type TToolName,
} from '@shared/tools';

import { checkGuard, isSameDisplay } from '../guard';
import type { IModelClient } from '../modelClient';
import { summarizeStep } from '../summary';
import type { TWaitAnswer } from '../waits';
import { askUserTool } from './askUser';
import { clickTool } from './click';
import { goBackTool } from './goBack';
import { listTabsTool } from './listTabs';
import { navigateTool } from './navigate';
import { openTabTool } from './openTab';
import { pressKeyTool } from './pressKey';
import { readTextTool } from './readText';
import { DENIED_RESULT, requestApprovalTool } from './requestApproval';
import { scrollTool } from './scroll';
import { selectOptionTool } from './selectOption';
import { snapshotTool } from './snapshot';
import { switchTabTool } from './switchTab';
import {
  isHumanTool,
  type IAgentTool,
  type IHumanTool,
  type TAnyAgentTool,
  type TApprovalVerdict,
  type TUserRequest,
} from './toolType';
import { typeTextTool } from './typeText';
import { waitForTool } from './waitFor';

export type { TApprovalVerdict, TUserRequest } from './toolType';
export { DENIED_RESULT } from './requestApproval';

/** toolRunner 의 tools 항목 타입 */
export type TRunnableTool = Parameters<IModelClient['beta']['messages']['toolRunner']>[0]['tools'][number];

/** run 하나의 직렬 큐 — 구조 도구·사람 개입 도구·픽셀 toolset 이 같은 큐를 쓴다 */
export type TRunExclusive = <T>(task: () => Promise<T>) => Promise<T>;

/** 래퍼가 run 마다 쓰는 것 — service 가 만든다 */
export interface IToolRunContext {
  driver: IBrowserDriver;
  allowedHostList: string[];
  /** 이번 run 의 승인 요청 수 — 래퍼가 요청마다 1 늘린다 (가드 입력으로 넘겨 SR-4 판정) */
  approvalCount: number;
  /** 정지 플래그(중지·종료·상한 실패)가 섰는지 */
  isHalted(): boolean;
  /** 호출 1회를 센다 — 상한을 넘으면 run 을 failed 로 끝내고 false */
  countToolCall(): boolean;
  /** step 시작 기록·이벤트(running) — step 번호를 돌려준다. storedInput 은 비밀값을 생략한 입력 */
  beginStep(step: { tool: string; storedInput: unknown; summary: string }): number;
  /** step 상태 기록·이벤트 (waiting 포함) */
  endStep(n: number, status: Exclude<TStepStatus, 'running'>, resultText: string): void;
  /** run 을 waiting_user 로 두고 사용자 답을 기다린다 — 중지·종료면 cancelled (실행하지 않는다) */
  waitForUser(request: TUserRequest): Promise<TWaitAnswer>;
  /** 탭 커서·강조 오버레이 — 실패해도 resolve */
  overlay(cmd: TOverlayCommand): Promise<void>;
  /** run 하나의 직렬 큐 */
  runExclusive: TRunExclusive;
}

/** runGuardedAction 의 가드 호출 — null 이면 가드 없음 (SR-6 뷰포트 검사는 호출부) */
export interface IGuardCall {
  tool: TToolName | 'request_approval';
  source: 'structure' | 'pixel';
  input: unknown;
  point?: IPoint;
}

/** act() 결과 — value 는 도구가 돌려줄 결과(픽셀 screenshot 은 이미지), text 는 step 기록용 */
export type TActOutcome<T> = { ok: true; value: T; text: string } | { ok: false; reason: string };

/** runGuardedAction 한 번의 명세 (spec 004 「공통 파이프라인」) */
export interface IGuardedActionSpec<T> {
  /** 구조 = 도구 이름, 픽셀 = `computer.{member}` */
  stepTool: string;
  guard: IGuardCall | null;
  /** 최초 판정과 [에이전트가 누르기] 재확인 때 각각 부른다. 실패(throw)는 null 로 본다 */
  resolveTarget: () => Promise<IGuardTarget | null>;
  /** 타임라인 요약 — 함수면 최초 해석한 대상으로 만든다 */
  summary: string | ((target: IGuardTarget | null) => string);
  /** DB 저장용 입력 (비밀값 생략된 것) */
  storedInput: unknown;
  /** 승인 대기 중 강조할 대상 */
  overlayTarget: { ref: string } | { point: IPoint } | null;
  act: () => Promise<TActOutcome<T>>;
}

/** 정지 뒤 남은 tool_use 에 돌려주는 결과 (모델 요청은 이미 abort 됐다) */
export const HALTED_RESULT = 'stopped: 실행이 멈춰 도구를 실행하지 않았습니다';
/** [직접 누를게요] 뒤 결과 — 에이전트는 실행하지 않았다 */
export const USER_DONE_RESULT = '사용자가 직접 처리함 — snapshot 으로 결과를 확인하고 이어가라';
const USER_DONE_STEP_TEXT = '사용자가 직접 처리';
const UNEXPECTED_ERROR_RESULT = '도구 실행 중 예상하지 못한 오류가 났습니다';
const WAITING_QUESTION_TEXT = '사용자 답 대기';
const OMITTED_TEXT = '[입력값 생략]';

const STATEFUL_NAME_SET: ReadonlySet<string> = new Set(STATEFUL_TOOL_NAME_LIST);

/** 15개 도구 — 이 순서로 모델에 보인다 (브라우저 13개 + 사람 개입 2개) */
export const AGENT_TOOL_LIST = [
  snapshotTool,
  readTextTool,
  navigateTool,
  goBackTool,
  clickTool,
  typeTextTool,
  selectOptionTool,
  pressKeyTool,
  scrollTool,
  waitForTool,
  listTabsTool,
  switchTabTool,
  openTabTool,
  askUserTool,
  requestApprovalTool,
] as const;

/** run 하나의 직렬 큐를 만든다 — 앞 작업이 실패해도 다음 작업은 돈다 */
export function createExclusiveQueue(): TRunExclusive {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
}

/** run 하나에 쓸 betaZodTool 15개 (eager_input_streaming) — ctx.runExclusive 로 하나씩 실행된다 */
export function createToolList(ctx: IToolRunContext): TRunnableTool[] {
  return (AGENT_TOOL_LIST as readonly TAnyAgentTool[]).map((tool) => toRunnableTool(tool, ctx));
}

function toRunnableTool(tool: TAnyAgentTool, ctx: IToolRunContext): TRunnableTool {
  return betaZodTool({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    eager_input_streaming: true,
    run: (input) => (isHumanTool(tool) ? runHumanTool(tool, ctx, input) : runStructureTool(tool, ctx, input)),
  });
}

/** 구조 도구 1회 — 공통 파이프라인에 도구별 대상 해석·요약·실행을 넘긴다 */
async function runStructureTool(tool: IAgentTool<unknown>, ctx: IToolRunContext, input: unknown): Promise<string> {
  return runGuardedAction<string>(ctx, {
    stepTool: tool.name,
    guard: STATEFUL_NAME_SET.has(tool.name) ? { tool: tool.name, source: 'structure', input } : null,
    resolveTarget: () => resolveGuardTarget(tool.name, ctx.driver, input),
    summary: (target) => summarizeStep(tool.name, input, target),
    storedInput: toStoredInput(tool.name, input),
    overlayTarget: toOverlayTarget(input),
    act: async () => {
      const result = await tool.execute(ctx.driver, input);
      return result.ok ? { ok: true, value: result.text, text: result.text } : result;
    },
  });
}

/**
 * 공통 파이프라인 — 구조 도구 래퍼와 픽셀 멤버가 같이 쓴다. 전체가 ctx.runExclusive 안에서 돈다.
 * 반환: act 의 value, 또는 실행하지 않은 경우의 텍스트(HALTED·USER_DONE·DENIED). 실패·차단은 ToolError throw.
 */
export function runGuardedAction<T>(ctx: IToolRunContext, spec: IGuardedActionSpec<T>): Promise<T | string> {
  return ctx.runExclusive(() => runPipeline(ctx, spec));
}

async function runPipeline<T>(ctx: IToolRunContext, spec: IGuardedActionSpec<T>): Promise<T | string> {
  if (ctx.isHalted() || !ctx.countToolCall()) return HALTED_RESULT;
  const target = await safeResolve(spec);
  if (ctx.isHalted()) return HALTED_RESULT;
  const summary = typeof spec.summary === 'function' ? spec.summary(target) : spec.summary;
  const n = ctx.beginStep({ tool: spec.stepTool, storedInput: spec.storedInput, summary });
  if (spec.guard) {
    const gate = await passGate(ctx, { spec, guard: spec.guard, n, target });
    if (gate.kind === 'skip') return gate.result;
  }
  return executeStep(ctx, spec, n);
}

async function executeStep<T>(ctx: IToolRunContext, spec: IGuardedActionSpec<T>, n: number): Promise<T> {
  const result = await spec.act().catch((): TActOutcome<T> => ({ ok: false, reason: UNEXPECTED_ERROR_RESULT }));
  if (!result.ok) return failStep(ctx, n, 'error', result.reason);
  ctx.endStep(n, 'ok', result.text);
  return result.value;
}

/** 가드 문 통과 결과 — pass 면 실행, skip 이면 실행 없이 result 를 모델에 */
type TGate = { kind: 'pass' } | { kind: 'skip'; result: string };

interface IGateInput<T> {
  spec: IGuardedActionSpec<T>;
  guard: IGuardCall;
  n: number;
  target: IGuardTarget | null;
}

const PASS: TGate = { kind: 'pass' };

/** 판정 → (require_approval 이면) 대기 → 결정 → [에이전트가 누르기] 재확인. 같은 step 에서 반복할 수 있다 */
async function passGate<T>(ctx: IToolRunContext, input: IGateInput<T>): Promise<TGate> {
  let verdict = await judge(ctx, input.guard, input.target, ctx.approvalCount);
  for (;;) {
    if (verdict.kind === 'block') return failStep(ctx, input.n, 'blocked', verdict.reason);
    if (verdict.kind === 'allow') return PASS;
    const approvedCount = ctx.approvalCount;
    const decided = await askApproval(ctx, input, verdict);
    if (decided.kind === 'skip') return decided;
    const next = await recheck(ctx, input, { approved: verdict, approvedCount });
    if (next === 'same' || next === 'halted') return next === 'same' ? PASS : skipHalted(ctx, input.n);
    verdict = next;
  }
}

/** 승인 요청 1회 — 상한 카운트 → step waiting → 강조 → 대기 → 결정. agent 면 pass(재확인은 호출부) */
async function askApproval<T>(ctx: IToolRunContext, input: IGateInput<T>, verdict: TApprovalVerdict) {
  ctx.approvalCount += 1;
  ctx.endStep(input.n, 'waiting', verdict.reason);
  await showHighlight(ctx, input.spec.overlayTarget);
  const answer = await ctx.waitForUser({
    kind: 'approval',
    approval: { stepN: input.n, kind: 'guard', source: input.guard.source, ...pickVerdict(verdict), modelNote: null },
  });
  if (input.spec.overlayTarget) await ctx.overlay({ kind: 'clear' });
  return toGate(ctx, input.n, answer);
}

/** 사용자 결정 → 문 통과 여부. agent 외의 결정·취소·정지는 실행하지 않는다 (SR-1) */
function toGate(ctx: IToolRunContext, n: number, answer: TWaitAnswer): TGate {
  if (answer.type !== 'decision' || ctx.isHalted()) return skipHalted(ctx, n);
  if (answer.decision === 'agent') return PASS;
  if (answer.decision === 'user_done') {
    ctx.endStep(n, 'ok', USER_DONE_STEP_TEXT);
    return { kind: 'skip', result: USER_DONE_RESULT };
  }
  ctx.endStep(n, 'denied', DENIED_RESULT);
  return { kind: 'skip', result: DENIED_RESULT };
}

interface IApprovedState {
  approved: TApprovalVerdict;
  /** 승인한 요청을 판정할 때의 승인 수 — 재확인은 같은 조건으로 판정한다 */
  approvedCount: number;
}

/**
 * [에이전트가 누르기] 재확인 — 대상을 다시 해석해 가드를 다시 돌린다.
 * 같은 display 의 require_approval 이면 'same'(그 1회만 실행), allow·block 이면 그 판정,
 * display 가 다르면 새 승인 요청으로 다시 판정(현재 승인 수 — 상한 포함)한다.
 */
async function recheck<T>(
  ctx: IToolRunContext,
  input: IGateInput<T>,
  { approved, approvedCount }: IApprovedState,
): Promise<TGuardVerdict | 'same' | 'halted'> {
  const target = await safeResolve(input.spec);
  if (ctx.isHalted()) return 'halted';
  const verdict = await judge(ctx, input.guard, target, approvedCount);
  if (verdict.kind !== 'require_approval') return verdict;
  if (isSameDisplay(verdict.display, approved.display)) return 'same';
  return judge(ctx, input.guard, target, ctx.approvalCount);
}

function skipHalted(ctx: IToolRunContext, n: number): Extract<TGate, { kind: 'skip' }> {
  ctx.endStep(n, 'error', HALTED_RESULT);
  return { kind: 'skip', result: HALTED_RESULT };
}

function pickVerdict(verdict: TApprovalVerdict) {
  return { reason: verdict.reason, display: verdict.display };
}

async function showHighlight(ctx: IToolRunContext, overlayTarget: IGuardedActionSpec<unknown>['overlayTarget']) {
  if (!overlayTarget) return;
  await ctx.overlay(
    'ref' in overlayTarget
      ? { kind: 'highlight', ref: overlayTarget.ref }
      : { kind: 'highlight', point: overlayTarget.point },
  );
}

async function judge(
  ctx: IToolRunContext,
  guard: IGuardCall,
  target: IGuardTarget | null,
  approvalCount: number,
): Promise<TGuardVerdict> {
  const pageUrl = target?.pageUrl ?? (await getPageUrl(ctx.driver));
  const { tool, source, input, point } = guard;
  return checkGuard({
    tool,
    input,
    target,
    pageUrl,
    allowedHostList: ctx.allowedHostList,
    source,
    approvalCount,
    point,
  });
}

async function safeResolve(spec: IGuardedActionSpec<unknown>): Promise<IGuardTarget | null> {
  try {
    return await spec.resolveTarget();
  } catch {
    return null;
  }
}

function failStep(ctx: IToolRunContext, n: number, status: 'error' | 'blocked', reason: string): never {
  ctx.endStep(n, status, reason);
  throw new ToolError(reason);
}

/** 사람 개입 도구 1회 — 같은 큐에서, 브라우저·가드 없이(request_approval 은 상한만) 사용자 답을 기다린다 */
function runHumanTool(tool: IHumanTool<unknown>, ctx: IToolRunContext, input: unknown): Promise<string> {
  return ctx.runExclusive(async () => {
    if (ctx.isHalted() || !ctx.countToolCall()) return HALTED_RESULT;
    const n = ctx.beginStep({ tool: tool.name, storedInput: input, summary: summarizeStep(tool.name, input) });
    const approvalVerdict = tool.isApprovalRequest ? passApprovalLimit(ctx, n, input) : null;
    const result = await tool.executeWithContext(
      { stepN: n, approvalVerdict, waitForUser: (request) => waitInStep(ctx, n, request) },
      input,
    );
    if (result.status === 'halted') return skipHalted(ctx, n).result;
    ctx.endStep(n, result.status, result.storedText);
    return result.text;
  });
}

/** request_approval 의 승인 상한(SR-4) — 넘으면 step blocked + ToolError */
function passApprovalLimit(ctx: IToolRunContext, n: number, input: unknown): TApprovalVerdict {
  const verdict = checkGuard({
    tool: 'request_approval',
    input,
    target: null,
    pageUrl: '',
    allowedHostList: ctx.allowedHostList,
    approvalCount: ctx.approvalCount,
  });
  if (verdict.kind !== 'require_approval')
    return failStep(ctx, n, 'blocked', verdict.kind === 'block' ? verdict.reason : '');
  ctx.approvalCount += 1;
  return verdict;
}

function waitInStep(ctx: IToolRunContext, n: number, request: TUserRequest): Promise<TWaitAnswer> {
  ctx.endStep(n, 'waiting', request.kind === 'approval' ? request.approval.reason : WAITING_QUESTION_TEXT);
  return ctx.waitForUser(request);
}

/** 가드·요약용 대상 — ref 를 받는 상태 변경 도구와 Enter 만. 해석 실패는 null (가드가 fail-closed) */
async function resolveGuardTarget(tool: TToolName, driver: IBrowserDriver, input: unknown) {
  const request = toResolveRequest(tool, input);
  if (!request) return null;
  return driver.resolveTarget(request).catch(() => null);
}

function toResolveRequest(tool: TToolName, input: unknown): { ref?: string; focused?: boolean } | null {
  const record = toRecord(input);
  if (tool === 'press_key') return record.key === 'Enter' ? { focused: true } : null;
  if (tool !== 'click' && tool !== 'type_text' && tool !== 'select_option') return null;
  return typeof record.ref === 'string' ? { ref: record.ref } : null;
}

/** 승인 대기 중 강조할 ref — ref 를 받는 도구만 */
function toOverlayTarget(input: unknown): { ref: string } | null {
  const ref = toRecord(input).ref;
  return typeof ref === 'string' ? { ref } : null;
}

async function getPageUrl(driver: IBrowserDriver): Promise<string> {
  try {
    return (await driver.getPageInfo()).url;
  } catch {
    return '';
  }
}

function toRecord(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
}

/** step 저장용 입력 — type_text 의 text 는 남기지 않는다 (SR-2·SR-6 연장) */
export function toStoredInput(tool: string, input: unknown): unknown {
  if (tool === 'type_text' && typeof input === 'object' && input !== null) return { ...input, text: OMITTED_TEXT };
  return input ?? {};
}

/** step 저장용 입력 JSON — toStoredInput 의 JSON */
export function toStoredInputJson(tool: string, input: unknown): string {
  return JSON.stringify(toStoredInput(tool, input));
}
