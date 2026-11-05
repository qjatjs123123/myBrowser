/**
 * [도구 래퍼] 13개 도구를 betaZodTool 로 감싸 공통 순서를 강제한다 (spec 003 「도구 래퍼」, SR-4):
 * ⓪ 정지 플래그·호출 상한 → 대상 해석 → ① step 시작 → ② 상태 변경 도구면 checkGuard
 * (block → is_error, require_approval → 실행 없이 run 정지) → ③ 실행 → ④ step 완료.
 * 한 턴의 tool_use 는 SDK 가 동시에 부르므로 여기서 하나씩 차례로 실행한다 — 앞 도구가 run 을 멈추면 뒤 도구는 실행되지 않는다.
 * 가드를 끄는 옵션은 없다.
 */
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ToolError } from '@anthropic-ai/sdk/lib/tools/ToolError';

import type { TStepStatus } from '@shared/agent/run';
import type { TGuardVerdict } from '@shared/guard/types';
import {
  STATEFUL_TOOL_NAME_LIST,
  type IBrowserDriver,
  type IGuardTarget,
  type TStatefulToolName,
  type TToolName,
} from '@shared/tools';

import { checkGuard } from '../guard';
import type { IModelClient } from '../modelClient';
import { summarizeStep } from '../summary';
import { clickTool } from './click';
import { goBackTool } from './goBack';
import { listTabsTool } from './listTabs';
import { navigateTool } from './navigate';
import { openTabTool } from './openTab';
import { pressKeyTool } from './pressKey';
import { readTextTool } from './readText';
import { scrollTool } from './scroll';
import { selectOptionTool } from './selectOption';
import { snapshotTool } from './snapshot';
import { switchTabTool } from './switchTab';
import type { IAgentTool } from './toolType';
import { typeTextTool } from './typeText';
import { waitForTool } from './waitFor';

/** toolRunner 의 tools 항목 타입 */
export type TRunnableTool = Parameters<IModelClient['beta']['messages']['toolRunner']>[0]['tools'][number];

export type TApprovalVerdict = Extract<TGuardVerdict, { kind: 'require_approval' }>;

/** 래퍼가 run 마다 쓰는 것 — service 가 만든다 */
export interface IToolRunContext {
  driver: IBrowserDriver;
  allowedHostList: string[];
  /** 정지 플래그(중지·가드 정지·상한 실패)가 섰는지 */
  isHalted(): boolean;
  /** 호출 1회를 센다 — 상한을 넘으면 run 을 failed 로 끝내고 false */
  countToolCall(): boolean;
  /** step 시작 기록·이벤트(running) — step 번호를 돌려준다 */
  beginStep(step: { tool: TToolName; input: unknown; summary: string }): number;
  /** step 완료 기록·이벤트 */
  endStep(n: number, status: Exclude<TStepStatus, 'running'>, resultText: string): void;
  /** 가드 require_approval — run 을 stopped_before_confirm 으로 끝내고 모델 요청을 abort */
  stopBeforeConfirm(verdict: TApprovalVerdict): void;
}

/** 정지 뒤 남은 tool_use 에 돌려주는 결과 (모델 요청은 이미 abort 됐다) */
export const HALTED_RESULT = 'stopped: 실행이 멈춰 도구를 실행하지 않았습니다';
/** 가드 정지 결과 */
export const GUARD_STOPPED_RESULT = 'stopped: 사용자 확인 필요 — 루프 종료';
const UNEXPECTED_ERROR_RESULT = '도구 실행 중 예상하지 못한 오류가 났습니다';
const OMITTED_TEXT = '[입력값 생략]';

const STATEFUL_NAME_SET: ReadonlySet<TToolName> = new Set(STATEFUL_TOOL_NAME_LIST);

/** 13개 도구 — 이 순서로 모델에 보인다 */
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
] as const;

/** run 하나에 쓸 betaZodTool 13개 (eager_input_streaming) — 한 번에 하나씩 실행된다 */
export function createToolList(ctx: IToolRunContext): TRunnableTool[] {
  let tail: Promise<unknown> = Promise.resolve();
  const runExclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
  return AGENT_TOOL_LIST.map((tool) => toRunnableTool(tool as IAgentTool<unknown>, ctx, runExclusive));
}

type TRunExclusive = <T>(task: () => Promise<T>) => Promise<T>;

function toRunnableTool(tool: IAgentTool<unknown>, ctx: IToolRunContext, runExclusive: TRunExclusive): TRunnableTool {
  return betaZodTool({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    eager_input_streaming: true,
    run: (input) => runExclusive(() => runTool(tool, ctx, input)),
  });
}

/** 공통 순서 — 성공은 텍스트, 실패·차단은 ToolError(→ is_error tool_result) */
async function runTool(tool: IAgentTool<unknown>, ctx: IToolRunContext, input: unknown): Promise<string> {
  if (ctx.isHalted() || !ctx.countToolCall()) return HALTED_RESULT;
  const target = await resolveGuardTarget(tool.name, ctx.driver, input);
  if (ctx.isHalted()) return HALTED_RESULT;
  const n = ctx.beginStep({ tool: tool.name, input, summary: summarizeStep(tool.name, input, target) });
  if (isStatefulTool(tool.name)) {
    const verdict = await getVerdict({ tool: tool.name, ctx, input, target });
    if (verdict.kind === 'block') return failStep(ctx, n, 'blocked', verdict.reason);
    if (verdict.kind === 'require_approval') {
      ctx.endStep(n, 'blocked', verdict.reason);
      ctx.stopBeforeConfirm(verdict);
      return GUARD_STOPPED_RESULT;
    }
  }
  return executeStep(tool, ctx, n, input);
}

async function executeStep(tool: IAgentTool<unknown>, ctx: IToolRunContext, n: number, input: unknown) {
  const result = await tool
    .execute(ctx.driver, input)
    .catch(() => ({ ok: false as const, reason: UNEXPECTED_ERROR_RESULT }));
  if (!result.ok) return failStep(ctx, n, 'error', result.reason);
  ctx.endStep(n, 'ok', result.text);
  return result.text;
}

function failStep(ctx: IToolRunContext, n: number, status: 'error' | 'blocked', reason: string): never {
  ctx.endStep(n, status, reason);
  throw new ToolError(reason);
}

interface IVerdictInput {
  tool: TStatefulToolName;
  ctx: IToolRunContext;
  input: unknown;
  target: IGuardTarget | null;
}

async function getVerdict({ tool, ctx, input, target }: IVerdictInput): Promise<TGuardVerdict> {
  const pageUrl = target?.pageUrl ?? (await getPageUrl(ctx.driver));
  return checkGuard({ tool, input, target, pageUrl, allowedHostList: ctx.allowedHostList });
}

/** 가드·요약용 대상 — ref 를 받는 상태 변경 도구와 Enter 만. 해석 실패는 null (가드가 fail-closed) */
async function resolveGuardTarget(tool: TToolName, driver: IBrowserDriver, input: unknown) {
  const request = toResolveRequest(tool, input);
  if (!request) return null;
  return driver.resolveTarget(request).catch(() => null);
}

function toResolveRequest(tool: TToolName, input: unknown): { ref?: string; focused?: boolean } | null {
  const record = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  if (tool === 'press_key') return record.key === 'Enter' ? { focused: true } : null;
  if (tool !== 'click' && tool !== 'type_text' && tool !== 'select_option') return null;
  return typeof record.ref === 'string' ? { ref: record.ref } : null;
}

async function getPageUrl(driver: IBrowserDriver): Promise<string> {
  try {
    return (await driver.getPageInfo()).url;
  } catch {
    return '';
  }
}

function isStatefulTool(tool: TToolName): tool is TStatefulToolName {
  return STATEFUL_NAME_SET.has(tool);
}

/** step 저장용 입력 JSON — type_text 의 text 는 남기지 않는다 (SR-2·SR-6 연장) */
export function toStoredInputJson(tool: TToolName, input: unknown): string {
  if (tool === 'type_text' && typeof input === 'object' && input !== null) {
    return JSON.stringify({ ...input, text: OMITTED_TEXT });
  }
  return JSON.stringify(input ?? {});
}
