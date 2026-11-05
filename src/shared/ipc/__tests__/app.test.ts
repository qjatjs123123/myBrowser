import { describe, expect, it } from 'vitest';

import { AppInfoSchema } from '../app';

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
