import { describe, expect, it } from 'vitest';

import {
  SKILL_BODY_MAX,
  SKILL_COUNT_MAX,
  SKILL_NAME_MAX,
  SkillCreateRequestSchema,
  SkillDeleteRequestSchema,
  SkillListResponseSchema,
  SkillSchema,
  SkillUpdateRequestSchema,
} from '../skills';

const SKILL_ID = '6f1c2b8e-4d3a-4b7e-9c1a-2f5d8e7a9b10';

const VALID_SKILL = {
  id: SKILL_ID,
  name: '기본 인원',
  description: '인원 말이 없을 때',
  body: '인원 말이 없으면 2명으로 한다.',
  isEnabled: true,
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:00:00.000Z',
} as const;

const VALID_CREATE = { name: '기본 인원', description: '', body: '인원 말이 없으면 2명' } as const;

describe('SkillCreateRequestSchema', () => {
  it('유효한 요청이면 통과하고 앞뒤 공백을 지운다', () => {
    const result = SkillCreateRequestSchema.safeParse({ ...VALID_CREATE, name: '  기본 인원  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('기본 인원');
  });

  it('이름이 공백뿐이면 거부한다', () => {
    expect(SkillCreateRequestSchema.safeParse({ ...VALID_CREATE, name: '   ' }).success).toBe(false);
  });

  it('이름이 41자면 거부하고 40자는 통과한다', () => {
    const tooLong = 'ㄱ'.repeat(SKILL_NAME_MAX + 1);
    expect(SkillCreateRequestSchema.safeParse({ ...VALID_CREATE, name: tooLong }).success).toBe(false);
    const maxName = 'ㄱ'.repeat(SKILL_NAME_MAX);
    expect(SkillCreateRequestSchema.safeParse({ ...VALID_CREATE, name: maxName }).success).toBe(true);
  });

  it('이름에 줄바꿈이 있으면 거부한다', () => {
    expect(SkillCreateRequestSchema.safeParse({ ...VALID_CREATE, name: '기본\n## 결제' }).success).toBe(false);
    expect(SkillCreateRequestSchema.safeParse({ ...VALID_CREATE, name: '기본\r인원' }).success).toBe(false);
  });

  it('본문이 4001자면 거부한다', () => {
    const body = 'a'.repeat(SKILL_BODY_MAX + 1);
    expect(SkillCreateRequestSchema.safeParse({ ...VALID_CREATE, body }).success).toBe(false);
  });

  it('본문이 비면 거부한다', () => {
    expect(SkillCreateRequestSchema.safeParse({ ...VALID_CREATE, body: '  ' }).success).toBe(false);
  });

  it('설명이 201자면 거부한다', () => {
    expect(SkillCreateRequestSchema.safeParse({ ...VALID_CREATE, description: 'a'.repeat(201) }).success).toBe(false);
  });

  it('여분 키가 있으면 거부한다 (SR-4)', () => {
    expect(SkillCreateRequestSchema.safeParse({ ...VALID_CREATE, isEnabled: false }).success).toBe(false);
  });
});

describe('SkillUpdateRequestSchema', () => {
  it('id 와 바꿀 값이 하나 이상이면 통과한다', () => {
    expect(SkillUpdateRequestSchema.safeParse({ id: SKILL_ID, isEnabled: false }).success).toBe(true);
  });

  it('id 만 있으면 거부한다', () => {
    expect(SkillUpdateRequestSchema.safeParse({ id: SKILL_ID }).success).toBe(false);
  });

  it('id 가 uuid 가 아니면 거부한다', () => {
    expect(SkillUpdateRequestSchema.safeParse({ id: 'skill-1', isEnabled: true }).success).toBe(false);
  });

  it('여분 키가 있으면 거부한다', () => {
    expect(SkillUpdateRequestSchema.safeParse({ id: SKILL_ID, isEnabled: true, createdAt: 'x' }).success).toBe(false);
  });
});

describe('SkillDeleteRequestSchema', () => {
  it('uuid id 면 통과하고 여분 키는 거부한다', () => {
    expect(SkillDeleteRequestSchema.safeParse({ id: SKILL_ID }).success).toBe(true);
    expect(SkillDeleteRequestSchema.safeParse({ id: SKILL_ID, force: true }).success).toBe(false);
  });
});

describe('SkillListResponseSchema', () => {
  it('스킬 목록이면 통과한다 (빈 목록 포함)', () => {
    expect(SkillListResponseSchema.safeParse({ skillList: [VALID_SKILL] }).success).toBe(true);
    expect(SkillListResponseSchema.safeParse({ skillList: [] }).success).toBe(true);
  });

  it('30개를 넘으면 거부한다', () => {
    const skillList = Array.from({ length: SKILL_COUNT_MAX + 1 }, () => VALID_SKILL);
    expect(SkillListResponseSchema.safeParse({ skillList }).success).toBe(false);
  });

  it('스킬에 여분 키가 있으면 거부한다', () => {
    expect(SkillSchema.safeParse({ ...VALID_SKILL, nameKey: '기본 인원' }).success).toBe(false);
  });
});
