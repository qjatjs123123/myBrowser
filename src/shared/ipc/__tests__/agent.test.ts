import { describe, expect, it } from 'vitest';

import { AgentEventSchema, StartAgentRequestSchema, StartAgentResponseSchema, StopAgentRequestSchema } from '../agent';

describe('StartAgentRequestSchema', () => {
  it('할 일이 있으면 앞뒤 공백을 잘라 통과한다', () => {
    const parsed = StartAgentRequestSchema.safeParse({ task: '  강남역 맛집 찾아줘 ' });
    expect(parsed.success && parsed.data.task).toBe('강남역 맛집 찾아줘');
  });

  it('빈 문자열이면 실패한다', () => {
    expect(StartAgentRequestSchema.safeParse({ task: '' }).success).toBe(false);
  });

  it('공백만 있으면 실패한다', () => {
    expect(StartAgentRequestSchema.safeParse({ task: '   ' }).success).toBe(false);
  });

  it('2000자는 통과하고 2001자면 실패한다', () => {
    expect(StartAgentRequestSchema.safeParse({ task: 'a'.repeat(2000) }).success).toBe(true);
    expect(StartAgentRequestSchema.safeParse({ task: 'a'.repeat(2001) }).success).toBe(false);
  });

  it('추가 키가 있으면 실패한다', () => {
    expect(StartAgentRequestSchema.safeParse({ task: '할 일', autoApprove: true }).success).toBe(false);
  });
});

describe('StartAgentResponseSchema', () => {
  it('runId 가 있으면 통과하고 빈 문자열이면 실패한다', () => {
    expect(StartAgentResponseSchema.safeParse({ runId: 'run-1' }).success).toBe(true);
    expect(StartAgentResponseSchema.safeParse({ runId: '' }).success).toBe(false);
  });
});

describe('StopAgentRequestSchema', () => {
  it('runId 가 있으면 통과한다', () => {
    expect(StopAgentRequestSchema.safeParse({ runId: 'run-1' }).success).toBe(true);
  });

  it('runId 가 없거나 추가 키가 있으면 실패한다', () => {
    expect(StopAgentRequestSchema.safeParse({}).success).toBe(false);
    expect(StopAgentRequestSchema.safeParse({ runId: 'run-1', force: true }).success).toBe(false);
  });
});

describe('AgentEventSchema', () => {
  const VALID_EVENT_LIST = [
    { type: 'status', runId: 'r1', status: 'running' },
    { type: 'step', runId: 'r1', step: { n: 1, tool: 'snapshot', summary: '페이지 읽기', status: 'ok' } },
    { type: 'done', runId: 'r1', summary: '전화 02-123-4567' },
    { type: 'failed', runId: 'r1', reason: '도구 호출 한도(60회)를 넘었습니다' },
    { type: 'stopped', runId: 'r1' },
    {
      type: 'guard_stopped',
      runId: 'r1',
      reason: '확정·결제 행동: 예약 확정',
      display: { action: '클릭', target: '예약 확정' },
    },
  ];

  it.each(VALID_EVENT_LIST)('$type 이벤트가 계약대로면 통과한다', (event) => {
    expect(AgentEventSchema.safeParse(event).success).toBe(true);
  });

  it('없는 type 이면 실패한다', () => {
    expect(AgentEventSchema.safeParse({ type: 'approval_required', runId: 'r1' }).success).toBe(false);
  });

  it('step.n 이 0 이면 실패한다', () => {
    const event = { type: 'step', runId: 'r1', step: { n: 0, tool: 'snapshot', summary: '', status: 'ok' } };
    expect(AgentEventSchema.safeParse(event).success).toBe(false);
  });

  it('status 값이 enum 밖이면 실패한다', () => {
    expect(AgentEventSchema.safeParse({ type: 'status', runId: 'r1', status: 'paused' }).success).toBe(false);
  });

  it('guard_stopped 에 display 가 없으면 실패한다', () => {
    expect(AgentEventSchema.safeParse({ type: 'guard_stopped', runId: 'r1', reason: 'x' }).success).toBe(false);
  });

  it('이벤트에 추가 키가 있으면 실패한다', () => {
    expect(AgentEventSchema.safeParse({ type: 'stopped', runId: 'r1', apiKey: 'x' }).success).toBe(false);
  });
});
