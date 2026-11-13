/**
 * [가짜 모델] SDK 에 주입하는 fetch — `/v1/messages` 요청 n 번째에 시나리오 n 번째 턴을 SSE 로 돌려준다.
 * SDK toolRunner 는 그대로 돌고 HTTP 만 가짜다 (spec 003 「가짜 모델」). 네트워크를 쓰지 않는다.
 */
import type { TFakeScenario, TFakeTurn } from '@shared/agent/fakeScenario';

import { resolveRefPlaceholders } from './refPlaceholder';

/** 가짜 fetch 와 받은 요청 본문 기록 (테스트 단언용) */
export interface IFakeFetch {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  requestList: TFakeRequestBody[];
}

/** 받은 요청 본문 (JSON) */
export type TFakeRequestBody = Record<string, unknown> & { messages?: unknown[] };

type TStopReason = NonNullable<TFakeTurn['stop_reason']>;
type TFakeEvent = Record<string, unknown> & { type: string };

const END_OF_SCENARIO_TURN: TFakeTurn = { content: [{ type: 'text', text: '(시나리오 끝)' }], stop_reason: 'end_turn' };
/** 가짜 usage 토큰 수 — 서비스의 usage 합산 경로만 태우면 되므로 고정값 */
const FAKE_TOKEN_COUNT = 10;
/** text 블록의 `{{skillNames}}` — 요청 system 에 붙은 스킬 이름(`## {이름}` 줄)으로 바꾼다 (spec 013, e2e 확인용) */
const SKILL_NAMES_PLACEHOLDER = '{{skillNames}}';
const SKILL_HEADING_PATTERN = /^## (.+)$/gm;
const NO_SKILL_TEXT = '없음';
/** text 블록의 `{{firstImage}}` — 첫 user 메시지에 image 블록이 있으면 있음, 없으면 없음 (spec 021, e2e 확인용) */
const FIRST_IMAGE_PLACEHOLDER = '{{firstImage}}';
/** refusal 턴의 가짜 분류 — 시나리오 형식에 category 가 없어 고정값을 쓴다 */
const FAKE_REFUSAL_DETAILS = { type: 'refusal', category: 'general_harms', explanation: '(가짜 거절)' };

/** 시나리오를 재생하는 fetch 를 만든다 */
export function createFakeFetch(scenario: TFakeScenario): IFakeFetch {
  const requestList: TFakeRequestBody[] = [];
  let toolUseCount = 0;
  const createToolUseId = () => `toolu_fake_${++toolUseCount}`;

  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (init?.signal?.aborted) throw new DOMException('This operation was aborted', 'AbortError');
    if (!getUrl(input).pathname.endsWith('/v1/messages')) return createNotFoundResponse();
    const body = parseBody(init?.body);
    requestList.push(body);
    const turn = scenario.turns[requestList.length - 1] ?? END_OF_SCENARIO_TURN;
    const message = createMessage({ turn, body, index: requestList.length, createToolUseId });
    return body.stream === true ? createSseResponse(message) : Response.json(message);
  };
  return { fetch, requestList };
}

interface ICreateMessage {
  turn: TFakeTurn;
  body: TFakeRequestBody;
  index: number;
  createToolUseId: () => string;
}

/** 턴 → 완성된 Message 객체 (SSE 는 이것을 쪼개 보낸다) */
function createMessage({ turn, body, index, createToolUseId }: ICreateMessage) {
  const messageList = Array.isArray(body.messages) ? body.messages : [];
  const content = turn.content.map((block) =>
    block.type === 'text'
      ? { type: 'text' as const, text: resolveTextPlaceholders(block.text, body), citations: null }
      : {
          type: 'tool_use' as const,
          id: createToolUseId(),
          name: block.name,
          input: resolveRefPlaceholders(block.input, messageList),
          // 픽셀 toolset 멤버 호출 — SDK 가 toolset_name 으로 멤버를 찾는다 (spec 004)
          ...(block.toolset_name ? { toolset_name: block.toolset_name } : {}),
        },
  );
  const hasToolUse = turn.content.some((block) => block.type === 'tool_use');
  const stopReason = turn.stop_reason ?? (hasToolUse ? 'tool_use' : 'end_turn');
  return {
    id: `msg_fake_${index}`,
    type: 'message',
    role: 'assistant',
    model: typeof body.model === 'string' ? body.model : 'fake',
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details: stopReason === 'refusal' ? FAKE_REFUSAL_DETAILS : null,
    usage: { input_tokens: FAKE_TOKEN_COUNT, output_tokens: FAKE_TOKEN_COUNT },
  };
}

type TFakeMessage = ReturnType<typeof createMessage>;

/** text 블록의 자리표시자를 요청 본문으로 채운다 — 스킬 이름, 첫 화면 캡처 여부 */
function resolveTextPlaceholders(text: string, body: TFakeRequestBody): string {
  return resolveFirstImage(resolveSkillNames(text, body.system), body.messages);
}

function resolveFirstImage(text: string, messages: unknown[] | undefined): string {
  if (!text.includes(FIRST_IMAGE_PLACEHOLDER)) return text;
  return text.replaceAll(FIRST_IMAGE_PLACEHOLDER, hasFirstImage(messages) ? '있음' : '없음');
}

/** 첫 user 메시지 content 에 image 블록이 있는가 */
function hasFirstImage(messages: unknown[] | undefined): boolean {
  const first: unknown = messages?.[0];
  if (typeof first !== 'object' || first === null || !('content' in first) || !Array.isArray(first.content))
    return false;
  return first.content.some(
    (block: unknown) => typeof block === 'object' && block !== null && 'type' in block && block.type === 'image',
  );
}

function resolveSkillNames(text: string, system: unknown): string {
  if (!text.includes(SKILL_NAMES_PLACEHOLDER)) return text;
  const nameList = getSystemText(system).flatMap((blockText) =>
    [...blockText.matchAll(SKILL_HEADING_PATTERN)].map((matched) => matched[1] ?? ''),
  );
  return text.replaceAll(SKILL_NAMES_PLACEHOLDER, nameList.length > 0 ? nameList.join(', ') : NO_SKILL_TEXT);
}

/** 요청 system — 문자열 또는 text 블록 배열 */
function getSystemText(system: unknown): string[] {
  if (typeof system === 'string') return [system];
  if (!Array.isArray(system)) return [];
  return system.flatMap((block: unknown) =>
    typeof block === 'object' && block !== null && 'text' in block && typeof block.text === 'string'
      ? [block.text]
      : [],
  );
}

function createSseResponse(message: TFakeMessage): Response {
  const text = toEventList(message)
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
  return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** message_start → 블록별 start/delta/stop → message_delta → message_stop */
function toEventList(message: TFakeMessage): TFakeEvent[] {
  const start = {
    ...message,
    content: [],
    stop_reason: null,
    stop_details: null,
    usage: { input_tokens: FAKE_TOKEN_COUNT, output_tokens: 0 },
  };
  return [
    { type: 'message_start', message: start },
    ...message.content.flatMap((block, index) => toBlockEventList(block, index)),
    {
      type: 'message_delta',
      delta: {
        stop_reason: message.stop_reason as TStopReason,
        stop_sequence: null,
        stop_details: message.stop_details,
      },
      usage: { output_tokens: message.usage.output_tokens },
    },
    { type: 'message_stop' },
  ];
}

function toBlockEventList(block: TFakeMessage['content'][number], index: number): TFakeEvent[] {
  const stop = { type: 'content_block_stop', index };
  if (block.type === 'text') {
    return [
      { type: 'content_block_start', index, content_block: { type: 'text', text: '', citations: null } },
      { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } },
      stop,
    ];
  }
  return [
    { type: 'content_block_start', index, content_block: { ...block, input: {} } },
    {
      type: 'content_block_delta',
      index,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) },
    },
    stop,
  ];
}

function getUrl(input: string | URL | Request): URL {
  if (input instanceof URL) return input;
  return new URL(typeof input === 'string' ? input : input.url);
}

function parseBody(body: RequestInit['body'] | undefined): TFakeRequestBody {
  if (typeof body !== 'string') return {};
  const parsed: unknown = JSON.parse(body);
  return typeof parsed === 'object' && parsed !== null ? (parsed as TFakeRequestBody) : {};
}

function createNotFoundResponse(): Response {
  return Response.json(
    { type: 'error', error: { type: 'not_found_error', message: '가짜 모델은 /v1/messages 만 지원합니다' } },
    { status: 404 },
  );
}
