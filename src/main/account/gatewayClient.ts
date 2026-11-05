import type { z } from 'zod';

import {
  AccountInfoSchema,
  ActivationCreatedSchema,
  ActivationPollSchema,
  CreateActivationRequestSchema,
  FailEnvelopeSchema,
  toEnvelopeSchema,
} from '@shared/account/gateway';

import type { IGatewayClient, TFetch } from './types';

export const GATEWAY_MESSAGE = {
  network: '구독 서버에 연결하지 못했습니다',
  invalidResponse: '구독 서버 응답 형식이 올바르지 않습니다',
  requestFailed: '구독 서버 요청이 실패했습니다',
} as const;

const DEFAULT_TIMEOUT_MS = 10_000;

/** 게이트웨이 호출 실패 — status 는 HTTP 상태(네트워크 오류·타임아웃은 0), message 는 한국어 */
export class GatewayError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
  }
}

export interface IGatewayClientOptions {
  baseUrl: string;
  fetch?: TFetch;
  timeoutMs?: number;
}

interface IRequest<T> {
  path: string;
  init: RequestInit;
  schema: z.ZodType<T>;
}

/**
 * [게이트웨이 클라이언트] envelope 를 벗기고 zod 로 검증한다. 비밀(poll_secret·기기 토큰)은 헤더로만 보낸다.
 * 규칙: .claude/skills/desktop/zod-usage — 외부 응답은 safeParse 후 GatewayError
 */
export function createGatewayClient(options: IGatewayClientOptions): IGatewayClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const send = <T>(request: IRequest<T>) => sendRequest({ ...options, baseUrl }, request);
  return {
    baseUrl,
    createActivation: (deviceName) =>
      send({
        path: '/v1/activations',
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(CreateActivationRequestSchema.parse({ device_name: deviceName })),
        },
        schema: ActivationCreatedSchema,
      }),
    pollActivation: (activationId, pollSecret) =>
      send({
        path: `/v1/activations/${encodeURIComponent(activationId)}`,
        init: { method: 'GET', headers: { 'x-poll-secret': pollSecret } },
        schema: ActivationPollSchema,
      }),
    getAccount: (deviceToken) =>
      send({
        path: '/v1/account',
        init: { method: 'GET', headers: { 'x-api-key': deviceToken } },
        schema: AccountInfoSchema,
      }),
  };
}

async function sendRequest<T>(options: IGatewayClientOptions, { path, init, schema }: IRequest<T>): Promise<T> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    response = await fetchFn(`${options.baseUrl}${path}`, { ...init, signal });
  } catch {
    throw new GatewayError(0, GATEWAY_MESSAGE.network);
  }
  const body = await readJson(response);
  if (!response.ok) throw new GatewayError(response.status, toFailMessage(body));
  const parsed = toEnvelopeSchema(schema).safeParse(body);
  if (!parsed.success) throw new GatewayError(response.status, GATEWAY_MESSAGE.invalidResponse);
  return parsed.data.data as T;
}

/** 본문이 JSON 이 아니면 undefined — 비 2xx 는 기본 문장, 2xx 는 형식 오류가 된다 */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function toFailMessage(body: unknown): string {
  const parsed = FailEnvelopeSchema.safeParse(body);
  return parsed.success ? parsed.data.data.message : GATEWAY_MESSAGE.requestFailed;
}
