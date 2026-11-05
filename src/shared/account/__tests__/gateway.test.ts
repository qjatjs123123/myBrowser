import { describe, expect, it } from 'vitest';

import {
  AccountInfoSchema,
  ActivationCreatedSchema,
  ActivationPollSchema,
  CreateActivationRequestSchema,
  ErrorEnvelopeSchema,
  FailEnvelopeSchema,
  toEnvelopeSchema,
} from '../gateway';

const CREATED = {
  activation_id: '3f2b8c1e-7a4d-4e5f-9b6a-1c2d3e4f5a6b',
  poll_secret: 's'.repeat(32),
  purchase_url: 'https://gateway.mybrowser.app/purchase?activation_id=3f2b8c1e-7a4d-4e5f-9b6a-1c2d3e4f5a6b',
  expires_at: '2026-11-05T10:15:00Z',
  poll_interval_sec: 3,
};

const ACCOUNT = {
  credits: 1000,
  plan: 'basic',
  subscription_status: 'active',
  renews_at: '2026-12-05T00:00:00Z',
  manage_url: 'https://gateway.mybrowser.app/account',
};

describe('CreateActivationRequestSchema', () => {
  it('기기 이름이 1~64자면 통과한다', () => {
    expect(CreateActivationRequestSchema.safeParse({ device_name: 'a' }).success).toBe(true);
    expect(CreateActivationRequestSchema.safeParse({ device_name: 'a'.repeat(64) }).success).toBe(true);
  });

  it('기기 이름이 비었거나 65자면 실패한다', () => {
    expect(CreateActivationRequestSchema.safeParse({ device_name: '' }).success).toBe(false);
    expect(CreateActivationRequestSchema.safeParse({ device_name: 'a'.repeat(65) }).success).toBe(false);
  });
});

describe('ActivationCreatedSchema', () => {
  it('계약대로의 응답은 통과한다', () => {
    expect(ActivationCreatedSchema.safeParse(CREATED).success).toBe(true);
  });

  it('activation_id 가 uuid 가 아니면 실패한다', () => {
    expect(ActivationCreatedSchema.safeParse({ ...CREATED, activation_id: 'act-1' }).success).toBe(false);
  });

  it('poll_secret 이 32자 미만이면 실패한다', () => {
    expect(ActivationCreatedSchema.safeParse({ ...CREATED, poll_secret: 's'.repeat(31) }).success).toBe(false);
  });

  it('poll_interval_sec 가 1~30 밖이면 실패한다', () => {
    expect(ActivationCreatedSchema.safeParse({ ...CREATED, poll_interval_sec: 0 }).success).toBe(false);
    expect(ActivationCreatedSchema.safeParse({ ...CREATED, poll_interval_sec: 31 }).success).toBe(false);
  });

  it('expires_at 이 +00:00 형식이면 실패한다', () => {
    const raw = { ...CREATED, expires_at: '2026-11-05T10:15:00+00:00' };
    expect(ActivationCreatedSchema.safeParse(raw).success).toBe(false);
  });
});

describe('ActivationPollSchema', () => {
  it.each(['pending', 'expired', 'consumed'])('%s 는 토큰 없이 통과한다', (status) => {
    expect(ActivationPollSchema.safeParse({ status }).success).toBe(true);
  });

  it('approved 는 32~256자 토큰이 있으면 통과한다', () => {
    expect(ActivationPollSchema.safeParse({ status: 'approved', device_token: 't'.repeat(32) }).success).toBe(true);
    expect(ActivationPollSchema.safeParse({ status: 'approved', device_token: 't'.repeat(256) }).success).toBe(true);
  });

  it('approved 에 토큰이 없으면 실패한다', () => {
    expect(ActivationPollSchema.safeParse({ status: 'approved' }).success).toBe(false);
  });

  it('approved 토큰이 31자거나 257자면 실패한다', () => {
    expect(ActivationPollSchema.safeParse({ status: 'approved', device_token: 't'.repeat(31) }).success).toBe(false);
    expect(ActivationPollSchema.safeParse({ status: 'approved', device_token: 't'.repeat(257) }).success).toBe(false);
  });

  it('pending 에 토큰이 실리면 실패한다', () => {
    expect(ActivationPollSchema.safeParse({ status: 'pending', device_token: 't'.repeat(32) }).success).toBe(false);
  });
});

describe('AccountInfoSchema', () => {
  it('계약대로의 응답은 통과한다', () => {
    expect(AccountInfoSchema.safeParse(ACCOUNT).success).toBe(true);
  });

  it('plan·renews_at 이 null 이어도 통과한다', () => {
    expect(AccountInfoSchema.safeParse({ ...ACCOUNT, plan: null, renews_at: null }).success).toBe(true);
  });

  it('없는 subscription_status 면 실패한다', () => {
    expect(AccountInfoSchema.safeParse({ ...ACCOUNT, subscription_status: 'trial' }).success).toBe(false);
  });

  it('credits 가 정수가 아니면 실패한다', () => {
    expect(AccountInfoSchema.safeParse({ ...ACCOUNT, credits: '1000' }).success).toBe(false);
  });

  it('manage_url 이 없으면 실패한다', () => {
    const { manage_url: _omit, ...rest } = ACCOUNT;
    expect(AccountInfoSchema.safeParse(rest).success).toBe(false);
  });
});

describe('toEnvelopeSchema', () => {
  const schema = toEnvelopeSchema(AccountInfoSchema);

  it('success envelope 안의 data 를 검증해 통과시킨다', () => {
    const parsed = schema.safeParse({ status: 'success', data: ACCOUNT });
    expect(parsed.success && parsed.data.data.credits).toBe(1000);
  });

  it('data 가 계약과 다르면 실패한다', () => {
    expect(schema.safeParse({ status: 'success', data: { ...ACCOUNT, credits: null } }).success).toBe(false);
  });

  it('status 가 fail 이면 실패한다', () => {
    expect(schema.safeParse({ status: 'fail', data: ACCOUNT }).success).toBe(false);
  });
});

describe('FailEnvelopeSchema', () => {
  it('4xx fail envelope 의 code·message 를 읽는다', () => {
    const raw = { status: 'fail', data: { code: 404, message: '활성화를 찾을 수 없습니다' } };
    const parsed = FailEnvelopeSchema.safeParse(raw);
    expect(parsed.success && parsed.data.data).toEqual({ code: 404, message: '활성화를 찾을 수 없습니다' });
  });

  it('message 가 없으면 실패한다', () => {
    expect(FailEnvelopeSchema.safeParse({ status: 'fail', data: { code: 400 } }).success).toBe(false);
  });
});

describe('ErrorEnvelopeSchema', () => {
  it('5xx error envelope 는 data 모양과 상관없이 통과한다', () => {
    expect(ErrorEnvelopeSchema.safeParse({ status: 'error', data: { detail: 'upstream' } }).success).toBe(true);
  });

  it('status 가 success 면 실패한다', () => {
    expect(ErrorEnvelopeSchema.safeParse({ status: 'success', data: {} }).success).toBe(false);
  });
});
