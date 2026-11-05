import { describe, expect, it } from 'vitest';

import {
  ApprovalDecisionSchema,
  ApprovalRequestSchema,
  ModelApprovalDecisionSchema,
  QuestionSchema,
  RequestIdSchema,
  StepStatusSchema,
} from '../run';

const GUARD_REQUEST = {
  requestId: 'req-1',
  stepN: 2,
  kind: 'guard',
  source: 'pixel',
  reason: '요소를 확인할 수 없는 좌표 클릭',
  display: { action: '클릭', target: '좌표 (10, 20) — 요소를 확인할 수 없음' },
  modelNote: null,
};

const MODEL_REQUEST = {
  requestId: 'req-2',
  stepN: 5,
  kind: 'model',
  source: 'model',
  reason: '에이전트가 확인을 요청함',
  display: { action: '확인 요청', target: '' },
  modelNote: '2명 7시로 예약을 진행할까요?',
};

const QUESTION = { requestId: 'req-3', stepN: 1, text: '몇 명인가요?', optionList: ['2명', '4명'] };

describe('StepStatusSchema', () => {
  it('waiting·denied 를 포함한 6종 상태를 받는다', () => {
    expect(StepStatusSchema.options).toEqual(['running', 'waiting', 'ok', 'error', 'blocked', 'denied']);
  });

  it('계약 밖 상태면 실패한다', () => {
    expect(StepStatusSchema.safeParse('approved').success).toBe(false);
  });
});

describe('RequestIdSchema', () => {
  it('req-숫자 형식은 통과한다', () => {
    expect(RequestIdSchema.safeParse('req-12').success).toBe(true);
  });

  it('숫자가 아닌 접미사면 실패한다', () => {
    expect(RequestIdSchema.safeParse('req-x').success).toBe(false);
  });
});

describe('승인 결정 스키마', () => {
  it('가드 승인 결정은 agent·user_done·denied 3종이다', () => {
    expect(ApprovalDecisionSchema.options).toEqual(['agent', 'user_done', 'denied']);
  });

  it('모델 승인 결정은 approved·denied 2종이다', () => {
    expect(ModelApprovalDecisionSchema.options).toEqual(['approved', 'denied']);
  });
});

describe('ApprovalRequestSchema', () => {
  it('kind=guard 이고 modelNote 가 null 이면 통과한다', () => {
    expect(ApprovalRequestSchema.safeParse(GUARD_REQUEST).success).toBe(true);
  });

  it('kind=model 이면 modelNote 에 모델 문장을 싣고 통과한다', () => {
    expect(ApprovalRequestSchema.safeParse(MODEL_REQUEST).success).toBe(true);
  });

  it('modelNote 가 500자면 통과하고 501자면 실패한다', () => {
    expect(ApprovalRequestSchema.safeParse({ ...MODEL_REQUEST, modelNote: 'a'.repeat(500) }).success).toBe(true);
    expect(ApprovalRequestSchema.safeParse({ ...MODEL_REQUEST, modelNote: 'a'.repeat(501) }).success).toBe(false);
  });

  it('stepN 이 0 이면 실패한다', () => {
    expect(ApprovalRequestSchema.safeParse({ ...GUARD_REQUEST, stepN: 0 }).success).toBe(false);
  });

  it('source 가 계약 밖이면 실패한다', () => {
    expect(ApprovalRequestSchema.safeParse({ ...GUARD_REQUEST, source: 'auto' }).success).toBe(false);
  });

  it('추가 키가 있으면 실패한다', () => {
    expect(ApprovalRequestSchema.safeParse({ ...GUARD_REQUEST, autoApprove: true }).success).toBe(false);
  });
});

describe('QuestionSchema', () => {
  it('선택지가 있는 질문은 통과한다', () => {
    expect(QuestionSchema.safeParse(QUESTION).success).toBe(true);
  });

  it('선택지 6개는 통과하고 7개면 실패한다', () => {
    const optionList = Array.from({ length: 7 }, (_, i) => `${i + 1}명`);
    expect(QuestionSchema.safeParse({ ...QUESTION, optionList: optionList.slice(0, 6) }).success).toBe(true);
    expect(QuestionSchema.safeParse({ ...QUESTION, optionList }).success).toBe(false);
  });

  it('질문이 301자면 실패한다', () => {
    expect(QuestionSchema.safeParse({ ...QUESTION, text: 'a'.repeat(301) }).success).toBe(false);
  });

  it('빈 선택지가 있으면 실패한다', () => {
    expect(QuestionSchema.safeParse({ ...QUESTION, optionList: [''] }).success).toBe(false);
  });
});
