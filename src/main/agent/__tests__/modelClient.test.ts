import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import { createModelClient, MissingApiKeyError, MissingCredentialError } from '../modelClient';

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

  it('baseURL 을 주면 SDK 재시도를 끈다', () => {
    const client = createModelClient({ isFake: false, apiKey: 'device-token', baseURL: 'http://127.0.0.1:4000' });
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
