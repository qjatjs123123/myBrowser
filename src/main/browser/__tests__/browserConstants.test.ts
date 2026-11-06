import { describe, expect, it } from 'vitest';

import { DEFAULT_TIMEOUT_MS } from '../browserConstants';

describe('browserConstants', () => {
  it('도구 타임아웃 기본값은 10초다 (rules/agent/tools.md 「타임아웃 기본 10s」)', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
  });
});
