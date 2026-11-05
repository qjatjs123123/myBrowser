import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import { createModelClient, MissingApiKeyError } from '../modelClient';

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
});
