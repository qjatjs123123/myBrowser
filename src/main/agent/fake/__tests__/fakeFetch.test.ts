import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import type { TFakeScenario } from '@shared/agent/fakeScenario';

import { createFakeFetch } from '../fakeFetch';

const SCENARIO: TFakeScenario = {
  turns: [
    {
      content: [
        { type: 'text', text: '페이지를 읽겠습니다' },
        { type: 'tool_use', name: 'snapshot', input: {} },
      ],
    },
    { content: [{ type: 'tool_use', name: 'click', input: { ref: '$ref(button:예약 조회)' } }] },
  ],
};

const BASE_PARAMS = { model: 'claude-opus-5-5', max_tokens: 1024 } as const;

/** 실제 SDK 클라이언트 + 가짜 fetch — 네트워크 없음 */
function createClient(scenario: TFakeScenario) {
  const fake = createFakeFetch(scenario);
  return { client: new Anthropic({ apiKey: 'fake', fetch: fake.fetch, maxRetries: 0 }), requestList: fake.requestList };
}

describe('createFakeFetch', () => {
  it('첫 요청에 text·tool_use 블록과 tool_use stop_reason 을 SSE 로 돌려준다', async () => {
    const { client } = createClient(SCENARIO);
    const message = await client.beta.messages
      .stream({ ...BASE_PARAMS, messages: [{ role: 'user', content: '할 일' }] })
      .finalMessage();
    expect(message.stop_reason).toBe('tool_use');
    expect(message.content).toMatchObject([
      { type: 'text', text: '페이지를 읽겠습니다' },
      { type: 'tool_use', id: 'toolu_fake_1', name: 'snapshot', input: {} },
    ]);
  });

  it('두 번째 요청에는 두 번째 턴을 주고 ref 자리표시자를 마지막 snapshot 결과로 바꾼다', async () => {
    const { client } = createClient(SCENARIO);
    const first = await client.beta.messages
      .stream({ ...BASE_PARAMS, messages: [{ role: 'user', content: '할 일' }] })
      .finalMessage();
    const second = await client.beta.messages
      .stream({
        ...BASE_PARAMS,
        messages: [
          { role: 'user', content: '할 일' },
          { role: 'assistant', content: first.content },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'toolu_fake_1', content: '- button "예약 조회" [ref=e4]' }],
          },
        ],
      })
      .finalMessage();
    expect(second.content).toMatchObject([
      { type: 'tool_use', id: 'toolu_fake_2', name: 'click', input: { ref: 'e4' } },
    ]);
  });

  it('받은 요청 본문을 requestList 에 기록한다', async () => {
    const { client, requestList } = createClient(SCENARIO);
    await client.beta.messages.stream({ ...BASE_PARAMS, messages: [{ role: 'user', content: '기록' }] }).finalMessage();
    expect(requestList).toHaveLength(1);
    expect(requestList[0]).toMatchObject({ model: 'claude-opus-5-5', messages: [{ role: 'user', content: '기록' }] });
  });

  it('시나리오가 끝난 뒤 요청에는 end_turn 과 “(시나리오 끝)” 을 돌려준다', async () => {
    const { client } = createClient({ turns: [] });
    const message = await client.beta.messages
      .stream({ ...BASE_PARAMS, messages: [{ role: 'user', content: '할 일' }] })
      .finalMessage();
    expect(message.stop_reason).toBe('end_turn');
    expect(message.content).toMatchObject([{ type: 'text', text: '(시나리오 끝)' }]);
  });

  it('지정한 stop_reason 을 그대로 쓰고 refusal 이면 분류를 싣는다', async () => {
    const { client } = createClient({ turns: [{ content: [{ type: 'text', text: '거절' }], stop_reason: 'refusal' }] });
    const message = await client.beta.messages
      .stream({ ...BASE_PARAMS, messages: [{ role: 'user', content: '할 일' }] })
      .finalMessage();
    expect(message.stop_reason).toBe('refusal');
    expect(message.stop_details?.category).toBe('general_harms');
  });

  it('tool_use 에 toolset_name 이 있으면 content_block_start 에 그대로 싣는다', async () => {
    const { client } = createClient({
      turns: [{ content: [{ type: 'tool_use', name: 'screenshot', input: {}, toolset_name: 'computer' }] }],
    });
    const message = await client.beta.messages
      .stream({ ...BASE_PARAMS, messages: [{ role: 'user', content: '할 일' }] })
      .finalMessage();
    expect(message.content).toMatchObject([{ type: 'tool_use', name: 'screenshot', toolset_name: 'computer' }]);
  });

  it('toolset_name 이 없으면 tool_use 에 toolset_name 을 싣지 않는다', async () => {
    const { client } = createClient(SCENARIO);
    const message = await client.beta.messages
      .stream({ ...BASE_PARAMS, messages: [{ role: 'user', content: '할 일' }] })
      .finalMessage();
    expect(message.content[1]).not.toHaveProperty('toolset_name');
  });
});

describe('createFakeFetch — {{skillNames}}', () => {
  const ECHO_SCENARIO: TFakeScenario = {
    turns: [{ content: [{ type: 'text', text: '적용한 스킬: {{skillNames}}' }] }],
  };

  async function getEchoText(system?: { type: 'text'; text: string }[]): Promise<string> {
    const { client } = createClient(ECHO_SCENARIO);
    const message = await client.beta.messages
      .stream({ ...BASE_PARAMS, ...(system ? { system } : {}), messages: [{ role: 'user', content: '할 일' }] })
      .finalMessage();
    const block = message.content[0];
    return block?.type === 'text' ? block.text : '';
  }

  it('system 블록의 ## 이름 줄을 모아 쉼표로 이어 바꾼다', async () => {
    const text = await getEchoText([
      { type: 'text', text: '# 역할\n고정 프롬프트' },
      { type: 'text', text: '# 사용자 지침\n머리말\n\n## 캐치테이블\n날짜 먼저\n\n## 기본 인원\n2명' },
    ]);
    expect(text).toBe('적용한 스킬: 캐치테이블, 기본 인원');
  });

  it('## 이름 줄이 없으면 없음 으로 바꾼다', async () => {
    expect(await getEchoText([{ type: 'text', text: '# 역할\n고정 프롬프트' }])).toBe('적용한 스킬: 없음');
  });

  it('system 이 없으면 없음 으로 바꾼다', async () => {
    expect(await getEchoText()).toBe('적용한 스킬: 없음');
  });
});

describe('createFakeFetch — {{firstImage}} (spec 021)', () => {
  const ECHO_SCENARIO: TFakeScenario = {
    turns: [{ content: [{ type: 'text', text: '첫 화면 캡처: {{firstImage}}' }] }],
  };

  async function getEchoText(content: unknown): Promise<string> {
    const { client } = createClient(ECHO_SCENARIO);
    const message = await client.beta.messages
      .stream({ ...BASE_PARAMS, messages: [{ role: 'user', content: content as string }] })
      .finalMessage();
    const block = message.content[0];
    return block?.type === 'text' ? block.text : '';
  }

  it('첫 user content 에 image 블록이 있으면 있음 으로 바꾼다', async () => {
    const content = [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      { type: 'text', text: '할 일' },
    ];
    expect(await getEchoText(content)).toBe('첫 화면 캡처: 있음');
  });

  it('첫 user content 가 문자열이면 없음 으로 바꾼다', async () => {
    expect(await getEchoText('할 일')).toBe('첫 화면 캡처: 없음');
  });
});
