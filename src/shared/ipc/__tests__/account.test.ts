import { describe, expect, it } from 'vitest';

import { AccountStatusSchema } from '../account';

const ACTIVATION_ID = '3f2b8c1e-7a4d-4e5f-9b6a-1c2d3e4f5a6b';

describe('AccountStatusSchema', () => {
  it('not_required 상태는 통과한다', () => {
    expect(AccountStatusSchema.safeParse({ state: 'not_required' }).success).toBe(true);
  });

  it('inactive 상태는 message 가 있어도 없어도 통과한다', () => {
    expect(AccountStatusSchema.safeParse({ state: 'inactive' }).success).toBe(true);
    expect(AccountStatusSchema.safeParse({ state: 'inactive', message: '다시 시도해 주세요' }).success).toBe(true);
  });

  it('activating 상태는 uuid 와 UTC 시각이면 통과한다', () => {
    const raw = { state: 'activating', activationId: ACTIVATION_ID, expiresAt: '2026-11-05T10:00:00Z' };
    expect(AccountStatusSchema.safeParse(raw).success).toBe(true);
  });

  it('activating 상태의 activationId 가 uuid 가 아니면 실패한다', () => {
    const raw = { state: 'activating', activationId: 'act-1', expiresAt: '2026-11-05T10:00:00Z' };
    expect(AccountStatusSchema.safeParse(raw).success).toBe(false);
  });

  it('activating 상태의 expiresAt 이 +00:00 형식이면 실패한다', () => {
    const raw = { state: 'activating', activationId: ACTIVATION_ID, expiresAt: '2026-11-05T10:00:00+00:00' };
    expect(AccountStatusSchema.safeParse(raw).success).toBe(false);
  });

  it('active 상태는 크레딧·플랜·갱신일이 null 이어도 통과한다', () => {
    const raw = { state: 'active', credits: null, plan: null, renewsAt: null };
    expect(AccountStatusSchema.safeParse(raw).success).toBe(true);
  });

  it('active 상태는 값이 모두 있으면 통과한다', () => {
    const raw = { state: 'active', credits: 1000, plan: 'basic', renewsAt: '2026-12-05T00:00:00Z' };
    expect(AccountStatusSchema.safeParse(raw).success).toBe(true);
  });

  it('active 상태의 credits 가 정수가 아니면 실패한다', () => {
    const raw = { state: 'active', credits: 1.5, plan: null, renewsAt: null };
    expect(AccountStatusSchema.safeParse(raw).success).toBe(false);
  });

  it('active 상태에 deviceToken 키를 더하면 실패한다', () => {
    const raw = { state: 'active', credits: 1000, plan: null, renewsAt: null, deviceToken: 'x'.repeat(40) };
    expect(AccountStatusSchema.safeParse(raw).success).toBe(false);
  });

  it('not_required 상태에 추가 키가 있으면 실패한다', () => {
    expect(AccountStatusSchema.safeParse({ state: 'not_required', message: '안내' }).success).toBe(false);
  });

  it('없는 state 면 실패한다', () => {
    expect(AccountStatusSchema.safeParse({ state: 'expired' }).success).toBe(false);
  });
});
