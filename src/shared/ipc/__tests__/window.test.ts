import { describe, expect, it } from 'vitest';

import { WindowStateSchema } from '../window';

describe('WindowStateSchema', () => {
  it('isMaximized boolean 을 받는다', () => {
    expect(WindowStateSchema.parse({ isMaximized: true })).toEqual({ isMaximized: true });
  });

  it('여분 키를 거부한다 (strict)', () => {
    expect(WindowStateSchema.safeParse({ isMaximized: false, extra: 1 }).success).toBe(false);
  });

  it('boolean 이 아니면 거부한다', () => {
    expect(WindowStateSchema.safeParse({ isMaximized: 'yes' }).success).toBe(false);
  });
});
