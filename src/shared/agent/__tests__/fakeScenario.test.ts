import { describe, expect, it } from 'vitest';

import { FakeScenarioSchema } from '../fakeScenario';

describe('FakeScenarioSchema', () => {
  it('text·tool_use 블록과 stop_reason 이 있는 시나리오는 통과한다', () => {
    const scenario = {
      turns: [
        { content: [{ type: 'tool_use', name: 'snapshot', input: {} }] },
        {
          content: [
            { type: 'text', text: '두 번째 페이지로 갑니다' },
            { type: 'tool_use', name: 'click', input: { ref: '$ref(link:두 번째 페이지)' } },
          ],
          stop_reason: 'tool_use',
        },
        { content: [{ type: 'text', text: '전화 02-123-4567' }], stop_reason: 'end_turn' },
      ],
    };
    expect(FakeScenarioSchema.safeParse(scenario).success).toBe(true);
  });

  it('stop_reason 을 생략해도 통과한다', () => {
    expect(FakeScenarioSchema.safeParse({ turns: [{ content: [{ type: 'text', text: '끝' }] }] }).success).toBe(true);
  });

  it('없는 블록 type 이면 실패한다', () => {
    const scenario = { turns: [{ content: [{ type: 'image', source: {} }] }] };
    expect(FakeScenarioSchema.safeParse(scenario).success).toBe(false);
  });

  it('stop_reason 이 enum 밖이면 실패한다', () => {
    const scenario = { turns: [{ content: [{ type: 'text', text: 'x' }], stop_reason: 'pause_turn' }] };
    expect(FakeScenarioSchema.safeParse(scenario).success).toBe(false);
  });

  it('tool_use 에 name 이 없으면 실패한다', () => {
    const scenario = { turns: [{ content: [{ type: 'tool_use', input: {} }] }] };
    expect(FakeScenarioSchema.safeParse(scenario).success).toBe(false);
  });

  it('content 가 비어 있거나 turns 가 없으면 실패한다', () => {
    expect(FakeScenarioSchema.safeParse({ turns: [{ content: [] }] }).success).toBe(false);
    expect(FakeScenarioSchema.safeParse({}).success).toBe(false);
  });
});
