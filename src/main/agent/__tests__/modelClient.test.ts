import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ANTHROPIC_DEFAULT_BASE_URL,
  createModelClient,
  MissingApiKeyError,
  MissingCredentialError,
  toDirectClientOptions,
} from '../modelClient';

describe('createModelClient', () => {
  it('가짜 모드면 키 없이도 시나리오를 재생하는 SDK 클라이언트를 만든다', async () => {
    const client = createModelClient({
      isFake: true,
      scenario: { turns: [{ content: [{ type: 'text', text: '가짜 응답' }] }] },
    });
    const message = await client.beta.messages
      .stream({ model: 'claude-opus-5-5', max_tokens: 100, messages: [{ role: 'user', content: '안녕' }] })
      .finalMessage();
    expect(message.content).toMatchObject([{ type: 'text', text: '가짜 응답' }]);
  });

  it('실제 모드에서 키가 없으면 MissingApiKeyError 를 던진다', () => {
    expect(() => createModelClient({ isFake: false })).toThrow(MissingApiKeyError);
  });

  it('실제 모드에서 키가 있으면 Anthropic 인스턴스를 만든다 (요청은 보내지 않는다)', () => {
    expect(createModelClient({ isFake: false, apiKey: 'sk-test-key' })).toBeInstanceOf(Anthropic);
  });

  it('baseURL 을 주면 그 주소로 부르는 Anthropic 인스턴스를 만든다 (요청은 보내지 않는다)', () => {
    const client = createModelClient({ isFake: false, apiKey: 'device-token', baseURL: 'http://127.0.0.1:4000' });
    expect(client).toBeInstanceOf(Anthropic);
    expect((client as Anthropic).baseURL).toBe('http://127.0.0.1:4000');
  });

  it('gateway 형태(maxRetries 0 명시)면 SDK 재시도를 끈다', () => {
    const client = createModelClient({
      isFake: false,
      apiKey: 'device-token',
      baseURL: 'http://127.0.0.1:4000',
      maxRetries: 0,
    });
    expect((client as Anthropic).maxRetries).toBe(0);
  });

  it('gateway 모드(baseURL)에서 토큰이 없으면 MissingCredentialError 를 던진다', () => {
    expect(() => createModelClient({ isFake: false, baseURL: 'http://127.0.0.1:4000' })).toThrow(
      MissingCredentialError,
    );
  });

  it('missingKeyError 를 주면 키가 없을 때 그 오류를 던진다', () => {
    const missingKeyError = () => new MissingCredentialError();
    expect(() => createModelClient({ isFake: false, missingKeyError })).toThrow(MissingCredentialError);
  });
});

describe('toDirectClientOptions (spec 006)', () => {
  const PROXY = 'https://proxy.example.test';

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('프록시 주소를 주면 그 주소로 부른다', () => {
    const client = createModelClient(toDirectClientOptions({ apiKey: 'sk-test-key', baseUrl: PROXY })) as Anthropic;
    expect(client.baseURL).toBe(PROXY);
  });

  it('프록시를 써도 SDK 기본 재시도(2)를 유지한다', () => {
    const client = createModelClient(toDirectClientOptions({ apiKey: 'sk-test-key', baseUrl: PROXY })) as Anthropic;
    expect(client.maxRetries).toBe(2);
  });

  it('프록시 주소가 없으면 기본 주소·기본 재시도로 부른다', () => {
    const client = createModelClient(toDirectClientOptions({ apiKey: 'sk-test-key' })) as Anthropic;
    expect([client.baseURL, client.maxRetries]).toEqual([ANTHROPIC_DEFAULT_BASE_URL, 2]);
  });

  it('키가 없으면 프록시 주소가 있어도 MissingApiKeyError 를 던진다', () => {
    expect(() => createModelClient(toDirectClientOptions({ baseUrl: PROXY }))).toThrow(MissingApiKeyError);
  });

  it('셸에 ANTHROPIC_BASE_URL 이 있어도 프록시 주소 없는 direct 클라이언트는 기본 주소를 쓴다', () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://leak.invalid');
    const client = createModelClient(toDirectClientOptions({ apiKey: 'sk-test-key' })) as Anthropic;
    expect(client.baseURL).toBe(ANTHROPIC_DEFAULT_BASE_URL);
  });

  it('셸에 ANTHROPIC_BASE_URL 이 있어도 가짜 클라이언트는 기본 주소를 쓴다', () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://leak.invalid');
    const client = createModelClient({ isFake: true }) as Anthropic;
    expect(client.baseURL).toBe(ANTHROPIC_DEFAULT_BASE_URL);
  });
});
