/**
 * [가짜 구독 게이트웨이] 계정 e2e·단위 테스트가 mybrowser-gateway 대신 띄우는 로컬 HTTP 서버 — 127.0.0.1 임의 포트 (spec 005 「결정 사항」).
 * - `POST /v1/activations` → 활성화 생성 (purchase_url = 이 서버의 `/purchase?activation_id=…`, poll_secret 은 URL 에 없음)
 * - `GET /v1/activations/{id}` + `x-poll-secret` → 1회째 pending, 2회째 approved(device_token 1회), 이후 consumed. 비밀이 틀리면 404
 * - `GET /v1/account` → 크레딧(시작 1000) — 토큰 무효 401
 * - `POST /v1/messages`(쿼리 무관) → 텍스트 1블록 end_turn SSE(“완료했습니다”) + `x-mybrowser-credits`, 1회마다 크레딧 10 차감.
 *   `messagesStatus` 로 401·402 를 돌려준다 (Anthropic 오류 형식)
 * - 인증은 `x-api-key` 우선, 없으면 `Authorization: Bearer` (앱 SDK 는 Bearer 로 보낸다 — 계약 보정)
 * - `requestLog` 에는 메서드·경로·헤더 이름만 남긴다 — 토큰·비밀 값은 싣지 않는다 (SR-1)
 * 외부 네트워크를 쓰지 않는다. 규칙: .claude/rules/test-convention.md
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/** `/v1/messages` 의 응답 상태 — 200 이면 정상 SSE */
export type TFakeMessagesStatus = 200 | 401 | 402;

export interface IStartFakeGatewayOptions {
  messagesStatus?: TFakeMessagesStatus;
  /** 활성화 응답의 poll_interval_sec — e2e 가 빨리 끝나게 기본 1 */
  pollIntervalSec?: number;
  /** 시작 크레딧 — 기본 1000 */
  initialCredits?: number;
}

/** 받은 요청 1건 — 값은 싣지 않는다 */
export interface IFakeGatewayRequest {
  method: string;
  /** 쿼리 포함 경로 (예: `/v1/messages?beta=true`) */
  path: string;
  /** 소문자 헤더 이름 목록 */
  headerNameList: string[];
}

export interface IFakeGateway {
  /** 끝 `/` 없는 기본 주소 — 예: `http://127.0.0.1:53211` (MYBROWSER_GATEWAY_URL 로 넘긴다) */
  url: string;
  close: () => Promise<void>;
  requestLog: IFakeGatewayRequest[];
}

interface IActivation {
  secret: string;
  pollCount: number;
}

interface IGatewayState {
  url: string;
  options: Required<IStartFakeGatewayOptions>;
  activationMap: Map<string, IActivation>;
  tokenSet: Set<string>;
  credits: number;
}

const ACTIVATION_TTL_MS = 10 * 60_000;
const MESSAGE_COST = 10;
const REPLY_TEXT = '완료했습니다';
const FAKE_TOKEN_COUNT = 10;
const DEFAULT_POLL_INTERVAL_SEC = 1;
const DEFAULT_INITIAL_CREDITS = 1000;
const DEFAULT_MODEL = 'claude-opus-5-5';
const RENEWAL_PERIOD_MS = 30 * 24 * 3_600_000;
const ACTIVATION_PATH_PATTERN = /^\/v1\/activations\/([0-9a-f-]+)$/;
const PURCHASE_HTML =
  '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>가짜 구독 결제</title><h1>가짜 구독 결제 페이지</h1>';

/** 가짜 게이트웨이를 띄운다 — 테스트가 close 한다 */
export async function startFakeGateway(options: IStartFakeGatewayOptions = {}): Promise<IFakeGateway> {
  const requestLog: IFakeGatewayRequest[] = [];
  const state: IGatewayState = {
    url: '',
    options: {
      messagesStatus: 200,
      pollIntervalSec: DEFAULT_POLL_INTERVAL_SEC,
      initialCredits: DEFAULT_INITIAL_CREDITS,
      ...options,
    },
    activationMap: new Map(),
    tokenSet: new Set(),
    credits: options.initialCredits ?? DEFAULT_INITIAL_CREDITS,
  };
  const server = createServer((req, res) => {
    requestLog.push({ method: req.method ?? '', path: req.url ?? '', headerNameList: Object.keys(req.headers) });
    void handleRequest(state, req, res).catch(() => sendJson(res, 500, { status: 'error', data: {} }));
  });
  state.url = await listen(server);
  return { url: state.url, close: () => closeServer(server), requestLog };
}

async function handleRequest(state: IGatewayState, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  const activationMatch = ACTIVATION_PATH_PATTERN.exec(path);
  if (req.method === 'POST' && path === '/v1/activations') return createActivation(state, res);
  if (req.method === 'GET' && activationMatch?.[1]) return pollActivation(state, req, res, activationMatch[1]);
  if (req.method === 'GET' && path === '/v1/account') return sendAccount(state, req, res);
  if (req.method === 'POST' && path === '/v1/messages') return sendMessage(state, { req, res, body });
  if (req.method === 'GET' && (path === '/purchase' || path === '/account')) return sendHtml(res);
  sendFail(res, 404, '찾을 수 없습니다');
}

function createActivation(state: IGatewayState, res: ServerResponse): void {
  const id = randomUUID();
  state.activationMap.set(id, { secret: randomBytes(24).toString('hex'), pollCount: 0 });
  sendJson(res, 201, {
    status: 'success',
    data: {
      activation_id: id,
      poll_secret: state.activationMap.get(id)?.secret,
      purchase_url: `${state.url}/purchase?activation_id=${id}`,
      expires_at: toUtcText(new Date(Date.now() + ACTIVATION_TTL_MS)),
      poll_interval_sec: state.options.pollIntervalSec,
    },
  });
}

/** 1회째 pending → 2회째 approved(토큰 1회) → 이후 consumed */
function pollActivation(state: IGatewayState, req: IncomingMessage, res: ServerResponse, id: string): void {
  const activation = state.activationMap.get(id);
  if (!activation || req.headers['x-poll-secret'] !== activation.secret) return sendFail(res, 404, '찾을 수 없습니다');
  activation.pollCount += 1;
  if (activation.pollCount === 1) return sendJson(res, 200, { status: 'success', data: { status: 'pending' } });
  if (activation.pollCount > 2) return sendJson(res, 200, { status: 'success', data: { status: 'consumed' } });
  const token = randomBytes(32).toString('hex');
  state.tokenSet.add(token);
  sendJson(res, 200, { status: 'success', data: { status: 'approved', device_token: token } });
}

function sendAccount(state: IGatewayState, req: IncomingMessage, res: ServerResponse): void {
  if (!isAuthorized(state, req)) return sendFail(res, 401, '기기 연결이 해제됐습니다');
  sendJson(res, 200, {
    status: 'success',
    data: {
      credits: state.credits,
      plan: 'basic',
      subscription_status: 'active',
      renews_at: toUtcText(new Date(Date.now() + RENEWAL_PERIOD_MS)),
      manage_url: `${state.url}/account`,
    },
  });
}

/** Anthropic Messages 호환 — 인증·옵션 상태·크레딧 순으로 판정한 뒤 SSE */
function sendMessage(
  state: IGatewayState,
  { req, res, body }: { req: IncomingMessage; res: ServerResponse; body: string },
): void {
  const { messagesStatus } = state.options;
  if (messagesStatus === 401 || !isAuthorized(state, req)) {
    return sendApiError(res, 401, { type: 'authentication_error', message: '기기 토큰이 올바르지 않습니다' });
  }
  if (messagesStatus === 402 || state.credits < MESSAGE_COST) {
    return sendApiError(res, 402, { type: 'insufficient_credits', message: '크레딧이 부족합니다' });
  }
  state.credits -= MESSAGE_COST;
  res.writeHead(200, { 'content-type': 'text/event-stream', 'x-mybrowser-credits': String(state.credits) });
  res.end(toSseText(getModel(body)));
}

/** x-api-key 우선, 없으면 Authorization: Bearer */
function isAuthorized(state: IGatewayState, req: IncomingMessage): boolean {
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string') return state.tokenSet.has(apiKey);
  const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
  return bearer !== undefined && state.tokenSet.has(bearer);
}

/** message_start → content_block_start/delta/stop → message_delta(end_turn, usage) → message_stop */
function toSseText(model: string): string {
  const eventList = [
    {
      type: 'message_start',
      message: {
        id: `msg_gateway_${randomUUID()}`,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: FAKE_TOKEN_COUNT, output_tokens: 0 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '', citations: null } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: REPLY_TEXT } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: FAKE_TOKEN_COUNT },
    },
    { type: 'message_stop' },
  ];
  return eventList.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}

function getModel(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    const model = typeof parsed === 'object' && parsed !== null ? (parsed as { model?: unknown }).model : undefined;
    return typeof model === 'string' ? model : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

/** 시각은 UTC `Z`, 밀리초 없이 (계약: `2026-11-05T10:00:00Z`) */
function toUtcText(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
}

function sendFail(res: ServerResponse, code: number, message: string): void {
  sendJson(res, code, { status: 'fail', data: { code, message } });
}

function sendApiError(res: ServerResponse, status: number, error: { type: string; message: string }): void {
  sendJson(res, status, { type: 'error', error });
}

function sendHtml(res: ServerResponse): void {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PURCHASE_HTML);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunkList: Buffer[] = [];
  for await (const chunk of req) chunkList.push(chunk as Buffer);
  return Buffer.concat(chunkList).toString('utf8');
}

function listen(server: Server): Promise<string> {
  return new Promise((resolveUrl) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolveUrl(`http://127.0.0.1:${String(port)}`);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolveClose, reject) => server.close((error) => (error ? reject(error) : resolveClose())));
}
