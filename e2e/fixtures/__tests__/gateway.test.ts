import Anthropic, { APIError } from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AccountInfoSchema,
  ActivationCreatedSchema,
  ActivationPollSchema,
  FailEnvelopeSchema,
  toEnvelopeSchema,
} from '@shared/account/gateway';

import { type IFakeGateway, startFakeGateway, type IStartFakeGatewayOptions } from '../gateway';

let gateway: IFakeGateway | undefined;

afterEach(async () => {
  await gateway?.close();
  gateway = undefined;
});

async function start(options?: IStartFakeGatewayOptions): Promise<IFakeGateway> {
  gateway = await startFakeGateway(options);
  return gateway;
}

async function createActivation(url: string) {
  const response = await fetch(`${url}/v1/activations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device_name: 'test-pc' }),
  });
  return { status: response.status, data: toEnvelopeSchema(ActivationCreatedSchema).parse(await response.json()).data };
}

async function poll(url: string, { id, secret }: { id: string; secret: string }) {
  const response = await fetch(`${url}/v1/activations/${id}`, { headers: { 'x-poll-secret': secret } });
  return { status: response.status, body: (await response.json()) as unknown };
}

/** 활성화 생성 → 폴링 2회 → 기기 토큰 */
async function activate(url: string): Promise<string> {
  const { data } = await createActivation(url);
  const ids = { id: data.activation_id, secret: data.poll_secret };
  await poll(url, ids);
  const approved = toEnvelopeSchema(ActivationPollSchema).parse((await poll(url, ids)).body).data;
  if (approved.status !== 'approved') throw new Error('approved 가 아닙니다');
  return approved.device_token;
}

async function getAccount(url: string, headers: Record<string, string>) {
  const response = await fetch(`${url}/v1/account`, { headers });
  return { status: response.status, body: (await response.json()) as unknown };
}

function createClient(url: string, token: string): Anthropic {
  return new Anthropic({ apiKey: token, baseURL: url, maxRetries: 0 });
}

async function streamOnce(client: Anthropic) {
  return client.beta.messages
    .stream({ model: 'claude-opus-5-5', max_tokens: 1024, messages: [{ role: 'user', content: '안녕' }] })
    .finalMessage();
}

describe('활성화', () => {
  it('활성화를 만들면 201 과 계약 스키마에 맞는 data 를 돌려주고 구매 URL 에 비밀이 없다', async () => {
    const { url } = await start();
    const { status, data } = await createActivation(url);
    expect(status).toBe(201);
    expect(data.purchase_url).toBe(`${url}/purchase?activation_id=${data.activation_id}`);
    expect(data.purchase_url).not.toContain(data.poll_secret);
  });

  it('폴링은 1회째 pending, 2회째 approved(토큰), 3회째 consumed 를 돌려준다', async () => {
    const { url } = await start();
    const { data } = await createActivation(url);
    const ids = { id: data.activation_id, secret: data.poll_secret };
    const schema = toEnvelopeSchema(ActivationPollSchema);
    const statusList = [];
    for (let count = 0; count < 3; count += 1) statusList.push(schema.parse((await poll(url, ids)).body).data.status);
    expect(statusList).toEqual(['pending', 'approved', 'consumed']);
  });

  it('poll secret 이 틀리면 404 fail envelope 을 돌려준다', async () => {
    const { url } = await start();
    const { data } = await createActivation(url);
    const { status, body } = await poll(url, { id: data.activation_id, secret: 'wrong' });
    expect(status).toBe(404);
    expect(FailEnvelopeSchema.parse(body).data.code).toBe(404);
  });
});

describe('계정', () => {
  it('x-api-key 로 부르면 시작 크레딧 1000 을 계약 스키마대로 돌려준다', async () => {
    const { url } = await start();
    const token = await activate(url);
    const { body } = await getAccount(url, { 'x-api-key': token });
    expect(toEnvelopeSchema(AccountInfoSchema).parse(body).data.credits).toBe(1000);
  });

  it('Authorization Bearer 로 불러도 계정을 돌려준다', async () => {
    const { url } = await start();
    const token = await activate(url);
    expect((await getAccount(url, { authorization: `Bearer ${token}` })).status).toBe(200);
  });

  it('토큰이 무효면 401 fail envelope 을 돌려준다', async () => {
    const { url } = await start();
    const { status, body } = await getAccount(url, { 'x-api-key': 'x'.repeat(64) });
    expect(status).toBe(401);
    expect(FailEnvelopeSchema.parse(body).data.code).toBe(401);
  });
});

describe('메시지', () => {
  it('SDK 스트림으로 읽으면 텍스트 “완료했습니다” 와 stop_reason end_turn 을 받는다', async () => {
    const { url } = await start();
    const message = await streamOnce(createClient(url, await activate(url)));
    expect(message.content).toMatchObject([{ type: 'text', text: '완료했습니다' }]);
    expect(message.stop_reason).toBe('end_turn');
  });

  it('메시지 1회 뒤 /v1/account 크레딧은 990 이다', async () => {
    const { url } = await start();
    const token = await activate(url);
    await streamOnce(createClient(url, token));
    const { body } = await getAccount(url, { 'x-api-key': token });
    expect(toEnvelopeSchema(AccountInfoSchema).parse(body).data.credits).toBe(990);
  });

  it('응답 헤더 x-mybrowser-credits 에 남은 크레딧을 싣고 ?beta=true 쿼리도 같은 경로로 받는다', async () => {
    const { url } = await start();
    const token = await activate(url);
    const response = await fetch(`${url}/v1/messages?beta=true`, {
      method: 'POST',
      headers: { 'x-api-key': token, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-5-5', max_tokens: 10, stream: true, messages: [] }),
    });
    expect(response.headers.get('x-mybrowser-credits')).toBe('990');
  });

  it('messagesStatus 402 면 Anthropic 형식 insufficient_credits 오류를 돌려준다', async () => {
    const { url } = await start({ messagesStatus: 402 });
    const response = await fetch(`${url}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': await activate(url) },
      body: '{}',
    });
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({
      type: 'error',
      error: { type: 'insufficient_credits', message: '크레딧이 부족합니다' },
    });
  });

  it('messagesStatus 401 이면 SDK 가 status 401 APIError 를 던진다', async () => {
    const { url } = await start({ messagesStatus: 401 });
    const error: unknown = await streamOnce(createClient(url, await activate(url))).catch((caught: unknown) => caught);
    expect(error instanceof APIError && error.status).toBe(401);
  });
});

describe('requestLog', () => {
  it('경로·헤더 이름만 남기고 토큰·비밀 값은 남기지 않는다', async () => {
    const { url, requestLog } = await start();
    const token = await activate(url);
    await getAccount(url, { 'x-api-key': token });
    const logText = JSON.stringify(requestLog);
    expect(requestLog.at(-1)).toMatchObject({ method: 'GET', path: '/v1/account' });
    expect(requestLog.at(-1)?.headerNameList).toContain('x-api-key');
    expect(logText).not.toContain(token);
  });
});
