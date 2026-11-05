/**
 * [에이전트 루프] SDK toolRunner(stream) 로 모델 ↔ 도구 루프를 돌린다 — 루프를 손으로 쓰지 않는다 (rules/agent/tools.md).
 * 파라미터는 claude-api 스킬 기준: thinking·temperature·budget_tokens 를 보내지 않는다.
 * 턴마다 stop_reason 을 보고 max_tokens·refusal 이면 그 턴의 도구를 실행하지 않고 끝낸다.
 */
import {
  AnthropicError,
  APIConnectionError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';

import type { IModelClient } from './modelClient';
import type { TRunnableTool } from './tools';

/** 루프 결과 — aborted 는 중지·가드 정지·상한 실패로 abort 된 경우 (서비스가 정지 플래그로 상태를 정한다) */
/** failed 의 apiStatus — 모델(게이트웨이) HTTP 오류 상태. 서비스가 gateway 모드 문장으로 바꿀 때 쓴다 (spec 005 FR-6) */
export type TLoopOutcome =
  { kind: 'done'; summary: string } | { kind: 'failed'; reason: string; apiStatus?: number } | { kind: 'aborted' };

export interface IRunAgentLoopOptions {
  client: IModelClient;
  model: string;
  tools: TRunnableTool[];
  systemPrompt: string;
  firstUserMessage: string;
  signal: AbortSignal;
  /** 턴마다 완성된 응답 — usage 합산 등 */
  onFinal?: (message: BetaMessage) => void;
}

const MAX_TOKENS = 64000;
const BETA_LIST = ['server-side-fallback-2026-07-01', 'context-management-2025-06-27'] as const;
const DEFAULT_SUMMARY = '작업을 마쳤습니다';
const PARSE_ERROR_PATTERN = /Unable to parse tool parameter JSON/;

/** 한 run 의 모델 루프 — API 오류·파싱 오류는 failed, abort 는 aborted, 그 밖의 예외는 던진다 */
export async function runAgentLoop(options: IRunAgentLoopOptions): Promise<TLoopOutcome> {
  try {
    return await consumeRunner(options);
  } catch (error) {
    return toErrorOutcome(error, options.signal);
  }
}

async function consumeRunner(options: IRunAgentLoopOptions): Promise<TLoopOutcome> {
  const runner = createRunner(options);
  let lastMessage: BetaMessage | null = null;
  for await (const stream of runner) {
    const message = await stream.finalMessage();
    options.onFinal?.(message);
    const stopped = checkStopReason(message);
    if (stopped) return stopped;
    lastMessage = message;
  }
  return { kind: 'done', summary: getSummary(lastMessage) };
}

/**
 * thread: false — 매 턴 전체 히스토리를 보낸다 (append-only 히스토리, 가짜 모델의 ref 자리표시자가 요청 messages 를 읽는다).
 * runToolsEagerly 는 켜지 않는다 — stop_reason 확인 전에 도구가 실행되면 안 된다.
 */
function createRunner({ client, model, tools, systemPrompt, firstUserMessage, signal }: IRunAgentLoopOptions) {
  return client.beta.messages.toolRunner(
    {
      model,
      max_tokens: MAX_TOKENS,
      stream: true,
      thread: false,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools,
      messages: [{ role: 'user', content: firstUserMessage }],
      output_config: { effort: 'high' },
      betas: [...BETA_LIST],
      fallbacks: 'default',
      context_management: { edits: [{ type: 'clear_tool_uses_20250919' }] },
    },
    { signal },
  );
}

function checkStopReason(message: BetaMessage): TLoopOutcome | null {
  if (message.stop_reason === 'max_tokens') {
    return { kind: 'failed', reason: '모델 응답이 너무 길어 중단됐습니다 (max_tokens)' };
  }
  if (message.stop_reason === 'refusal') {
    const category = message.stop_details?.category ?? '분류 없음';
    return { kind: 'failed', reason: `모델이 요청을 거절했습니다 (${category})` };
  }
  return null;
}

/** 마지막 응답의 text 블록 — 완료 요약 */
function getSummary(message: BetaMessage | null): string {
  const text = (message?.content ?? [])
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n')
    .trim();
  return text || DEFAULT_SUMMARY;
}

function toErrorOutcome(error: unknown, signal: AbortSignal): TLoopOutcome {
  if (signal.aborted || error instanceof APIUserAbortError) return { kind: 'aborted' };
  if (error instanceof APIError) {
    const reason = toApiErrorReason(error);
    return typeof error.status === 'number'
      ? { kind: 'failed', reason, apiStatus: error.status }
      : { kind: 'failed', reason };
  }
  if (error instanceof AnthropicError && PARSE_ERROR_PATTERN.test(error.message)) {
    return { kind: 'failed', reason: '모델 응답을 해석하지 못했습니다' };
  }
  throw error;
}

/** 타입 있는 API 오류 → 사용자 문장 (오류 원문·키는 싣지 않는다) */
function toApiErrorReason(error: APIError): string {
  if (error instanceof AuthenticationError)
    return 'API 키가 올바르지 않습니다. .env 의 ANTHROPIC_API_KEY 를 확인해 주세요';
  if (error instanceof PermissionDeniedError) return '이 API 키로는 모델을 쓸 수 없습니다';
  if (error instanceof RateLimitError) return '요청 한도를 넘었습니다. 잠시 후 다시 시도해 주세요';
  if (error instanceof BadRequestError) return '모델 요청이 거부됐습니다';
  if (error instanceof InternalServerError) return '모델 서버에 문제가 있습니다. 잠시 후 다시 시도해 주세요';
  if (error instanceof APIConnectionError) return '모델 서버에 연결하지 못했습니다';
  return '모델 호출에 실패했습니다';
}
