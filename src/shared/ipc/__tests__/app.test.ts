import { describe, expect, it } from 'vitest';

import { AppInfoSchema, ShowMenuRequestSchema } from '../app';

describe('AppInfoSchema', () => {
  it('이름·semver 버전·모드가 맞으면 통과한다', () => {
    expect(AppInfoSchema.safeParse({ name: 'myBrowser', version: '0.1.0', mode: 'test' }).success).toBe(true);
  });

  it('버전이 semver 가 아니면 실패한다', () => {
    expect(AppInfoSchema.safeParse({ name: 'myBrowser', version: 'v1', mode: 'test' }).success).toBe(false);
  });

  it('알 수 없는 모드나 추가 키가 있으면 실패한다', () => {
    expect(AppInfoSchema.safeParse({ name: 'myBrowser', version: '0.1.0', mode: 'beta' }).success).toBe(false);
    expect(AppInfoSchema.safeParse({ name: 'myBrowser', version: '0.1.0', mode: 'test', extra: 1 }).success).toBe(
      false,
    );
  });
});

describe('ShowMenuRequestSchema (spec 023)', () => {
  it('0 이상 정수 좌표면 통과한다', () => {
    expect(ShowMenuRequestSchema.safeParse({ x: 0, y: 40 }).success).toBe(true);
  });

  it('음수·소수·추가 필드면 실패한다', () => {
    expect(ShowMenuRequestSchema.safeParse({ x: -1, y: 40 }).success).toBe(false);
    expect(ShowMenuRequestSchema.safeParse({ x: 10.5, y: 40 }).success).toBe(false);
    expect(ShowMenuRequestSchema.safeParse({ x: 10, y: 40, item: 'quit' }).success).toBe(false);
  });
});
