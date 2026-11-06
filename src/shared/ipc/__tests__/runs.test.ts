import { describe, expect, it } from 'vitest';

import { RunGetRequestSchema, RunGetResponseSchema, RunListResponseSchema, RunSummarySchema } from '../runs';

const VALID_RUN = {
  id: 'run-1',
  task: '오늘 7시 2명 예약해줘',
  status: 'done',
  summary: '예약 페이지까지 열었습니다',
  reason: null,
  createdAt: '2026-11-06T10:00:00.000Z',
  endedAt: '2026-11-06T10:01:00.000Z',
} as const;

const VALID_STEP = { n: 1, tool: 'navigate', summary: '예약 페이지 열기', status: 'ok' } as const;

describe('RunSummarySchema', () => {
  it('유효한 run 요약이면 통과한다', () => {
    expect(RunSummarySchema.safeParse(VALID_RUN).success).toBe(true);
  });

  it('실행 중이라 summary·endedAt 이 null 이어도 통과한다', () => {
    const running = { ...VALID_RUN, status: 'running', summary: null, endedAt: null };
    expect(RunSummarySchema.safeParse(running).success).toBe(true);
  });

  it('알 수 없는 status 면 실패한다', () => {
    expect(RunSummarySchema.safeParse({ ...VALID_RUN, status: 'paused' }).success).toBe(false);
  });

  it('input_json 같은 여분 키가 있으면 실패한다 (SR-2)', () => {
    expect(RunSummarySchema.safeParse({ ...VALID_RUN, input_json: '{}' }).success).toBe(false);
  });
});

describe('RunListResponseSchema', () => {
  it('run 목록이면 통과한다 (빈 목록 포함)', () => {
    expect(RunListResponseSchema.safeParse({ runList: [VALID_RUN] }).success).toBe(true);
    expect(RunListResponseSchema.safeParse({ runList: [] }).success).toBe(true);
  });

  it('50개를 넘으면 실패한다', () => {
    const runList = Array.from({ length: 51 }, (_, i) => ({ ...VALID_RUN, id: `run-${i}` }));
    expect(RunListResponseSchema.safeParse({ runList }).success).toBe(false);
  });

  it('runList 가 없으면 실패한다', () => {
    expect(RunListResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe('RunGetRequestSchema', () => {
  it('runId 가 있으면 통과한다', () => {
    expect(RunGetRequestSchema.safeParse({ runId: 'run-1' }).success).toBe(true);
  });

  it('runId 가 빈 문자열이거나 여분 키가 있으면 실패한다', () => {
    expect(RunGetRequestSchema.safeParse({ runId: '' }).success).toBe(false);
    expect(RunGetRequestSchema.safeParse({ runId: 'run-1', extra: 1 }).success).toBe(false);
  });
});

describe('RunGetResponseSchema', () => {
  it('run + 단계 목록이면 통과한다', () => {
    expect(RunGetResponseSchema.safeParse({ run: VALID_RUN, stepList: [VALID_STEP] }).success).toBe(true);
  });

  it('단계에 inputJson·resultText 가 섞이면 실패한다 (SR-2)', () => {
    const withInput = { ...VALID_STEP, inputJson: '{"text":"비밀"}' };
    expect(RunGetResponseSchema.safeParse({ run: VALID_RUN, stepList: [withInput] }).success).toBe(false);
    const withResult = { ...VALID_STEP, resultText: '원문' };
    expect(RunGetResponseSchema.safeParse({ run: VALID_RUN, stepList: [withResult] }).success).toBe(false);
  });

  it('응답에 여분 키가 있으면 실패한다', () => {
    const extra = { run: VALID_RUN, stepList: [], result_text: 'x' };
    expect(RunGetResponseSchema.safeParse(extra).success).toBe(false);
  });
});
