import { describe, expect, it, vi } from 'vitest';

import { createGatewayClient, GatewayError } from '../gatewayClient';
import type { TFetch } from '../types';

const BASE = 'http://127.0.0.1:4100';
const ACTIVATION_ID = '0b9a3e7e-6c1f-4c55-9d4a-0e1f2a3b4c5d';
const SECRET = 's'.repeat(40);
const TOKEN = 't'.repeat(48);

const CREATED = {
  activation_id: ACTIVATION_ID,
  poll_secret: SECRET,
  purchase_url: `${BASE}/purchase?activation_id=${ACTIVATION_ID}`,
  expires_at: '2026-11-05T10:15:00Z',
  poll_interval_sec: 3,
};

const ACCOUNT = {
  credits: 1000,
  plan: 'basic',
  subscription_status: 'active',
  renews_at: '2026-12-05T00:00:00Z',
  manage_url: `${BASE}/account`,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function setup(response: Response | (() => Promise<Response>)) {
  const fetch = vi.fn<TFetch>(async () => (typeof response === 'function' ? response() : response));
  return { fetch, client: createGatewayClient({ baseUrl: `${BASE}/`, fetch }) };
}

function getHeaders(fetch: ReturnType<typeof setup>['fetch']): Record<string, string> {
  return fetch.mock.calls[0]?.[1].headers as Record<string, string>;
}

describe('createActivation', () => {
  it('POST /v1/activations 에 device_name 을 보내고 envelope 의 data 를 돌려준다', async () => {
    const { fetch, client } = setup(jsonResponse(201, { status: 'success', data: CREATED }));
    expect(await client.createActivation('my-laptop')).toEqual(CREATED);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE}/v1/activations`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ device_name: 'my-laptop' });
  });

  it('요청마다 타임아웃 signal 을 넘긴다', async () => {
    const { fetch, client } = setup(jsonResponse(201, { status: 'success', data: CREATED }));
    await client.createActivation('my-laptop');
    expect(fetch.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('fail envelope 이면 그 HTTP 상태와 message 로 GatewayError 를 던진다', async () => {
    const { client } = setup(
      jsonResponse(400, { status: 'fail', data: { code: 400, message: '기기 이름이 올바르지 않습니다' } }),
    );
    await expect(client.createActivation('x')).rejects.toMatchObject({
      name: 'GatewayError',
      status: 400,
      message: '기기 이름이 올바르지 않습니다',
    });
  });

  it('5xx error envelope 면 상태와 기본 문장으로 GatewayError 를 던진다', async () => {
    const { client } = setup(jsonResponse(503, { status: 'error', data: {} }));
    await expect(client.createActivation('x')).rejects.toMatchObject({
      status: 503,
      message: '구독 서버 요청이 실패했습니다',
    });
  });

  it('성공 응답의 형식이 계약과 다르면 형식 오류 GatewayError 다', async () => {
    const { client } = setup(jsonResponse(201, { status: 'success', data: { ...CREATED, poll_secret: 'short' } }));
    await expect(client.createActivation('x')).rejects.toMatchObject({
      status: 201,
      message: '구독 서버 응답 형식이 올바르지 않습니다',
    });
  });

  it('JSON 이 아닌 성공 응답이면 형식 오류 GatewayError 다', async () => {
    const { client } = setup(new Response('<html>', { status: 200 }));
    await expect(client.createActivation('x')).rejects.toMatchObject({
      message: '구독 서버 응답 형식이 올바르지 않습니다',
    });
  });

  it('네트워크 오류면 status 0 + “구독 서버에 연결하지 못했습니다” 다', async () => {
    const { client } = setup(() => Promise.reject(new TypeError('fetch failed')));
    const error = await client.createActivation('x').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GatewayError);
    expect(error).toMatchObject({ status: 0, message: '구독 서버에 연결하지 못했습니다' });
  });

  it('응답이 타임아웃보다 늦으면 status 0 GatewayError 다', async () => {
    const fetch = vi.fn<TFetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    const client = createGatewayClient({ baseUrl: BASE, fetch, timeoutMs: 5 });
    await expect(client.createActivation('x')).rejects.toMatchObject({ status: 0 });
  });
});

describe('pollActivation', () => {
  it('x-poll-secret 헤더로 GET /v1/activations/{id} 를 부르고 비밀은 URL 에 싣지 않는다', async () => {
    const { fetch, client } = setup(jsonResponse(200, { status: 'success', data: { status: 'pending' } }));
    expect(await client.pollActivation(ACTIVATION_ID, SECRET)).toEqual({ status: 'pending' });
    expect(fetch.mock.calls[0]?.[0]).toBe(`${BASE}/v1/activations/${ACTIVATION_ID}`);
    expect(fetch.mock.calls[0]?.[0]).not.toContain(SECRET);
    expect(getHeaders(fetch)['x-poll-secret']).toBe(SECRET);
  });

  it('approved 응답이면 device_token 을 돌려준다', async () => {
    const { client } = setup(
      jsonResponse(200, { status: 'success', data: { status: 'approved', device_token: TOKEN } }),
    );
    expect(await client.pollActivation(ACTIVATION_ID, SECRET)).toEqual({ status: 'approved', device_token: TOKEN });
  });

  it('approved 인데 토큰이 없으면 형식 오류 GatewayError 다', async () => {
    const { client } = setup(jsonResponse(200, { status: 'success', data: { status: 'approved' } }));
    await expect(client.pollActivation(ACTIVATION_ID, SECRET)).rejects.toBeInstanceOf(GatewayError);
  });

  it('비밀이 틀린 404 면 status 404 GatewayError 다', async () => {
    const { client } = setup(
      jsonResponse(404, { status: 'fail', data: { code: 404, message: '활성화를 찾을 수 없습니다' } }),
    );
    await expect(client.pollActivation(ACTIVATION_ID, 'wrong')).rejects.toMatchObject({ status: 404 });
  });
});

describe('getAccount', () => {
  it('x-api-key 헤더로 GET /v1/account 를 부르고 계정 정보를 돌려준다', async () => {
    const { fetch, client } = setup(jsonResponse(200, { status: 'success', data: ACCOUNT }));
    expect(await client.getAccount(TOKEN)).toEqual(ACCOUNT);
    expect(fetch.mock.calls[0]?.[0]).toBe(`${BASE}/v1/account`);
    expect(getHeaders(fetch)['x-api-key']).toBe(TOKEN);
  });

  it('토큰이 무효인 401 이면 status 401 GatewayError 다', async () => {
    const { client } = setup(jsonResponse(401, { status: 'fail', data: { code: 401, message: '인증이 필요합니다' } }));
    await expect(client.getAccount(TOKEN)).rejects.toMatchObject({ status: 401, message: '인증이 필요합니다' });
  });

  it('GatewayError 메시지에 토큰 값이 실리지 않는다', async () => {
    const { client } = setup(jsonResponse(401, { foo: TOKEN }));
    const error = await client.getAccount(TOKEN).catch((caught: unknown) => caught);
    expect(String((error as Error).message)).not.toContain(TOKEN);
  });
});

describe('baseUrl', () => {
  it('끝 슬래시를 뗀 주소를 노출한다', () => {
    expect(setup(jsonResponse(200, {})).client.baseUrl).toBe(BASE);
  });
});
