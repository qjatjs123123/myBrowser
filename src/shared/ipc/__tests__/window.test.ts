import { describe, expect, it } from 'vitest';

import { WindowPointerMoveRequestSchema, WindowPointerStartRequestSchema, WindowStateSchema } from '../window';

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

describe('WindowPointerStartRequestSchema (spec 016)', () => {
  it.each(['move', 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'])('kind %s 를 받는다', (kind) => {
    expect(WindowPointerStartRequestSchema.safeParse({ kind, screenX: 1, screenY: 2 }).success).toBe(true);
  });

  it('다중 모니터의 음수 좌표를 받는다', () => {
    expect(WindowPointerStartRequestSchema.safeParse({ kind: 'move', screenX: -1920, screenY: -5 }).success).toBe(true);
  });

  it.each([
    { kind: 'move', screenX: 1.5, screenY: 2 },
    { kind: 'move', screenX: '1', screenY: 2 },
    { kind: 'grab', screenX: 1, screenY: 2 },
    { kind: 'move', screenX: 1, screenY: 2, extra: 1 },
  ])('잘못된 요청 %o 를 거부한다', (raw) => {
    expect(WindowPointerStartRequestSchema.safeParse(raw).success).toBe(false);
  });
});

describe('WindowPointerMoveRequestSchema (spec 016)', () => {
  it('정수 좌표를 받고 소수·kind 를 거부한다', () => {
    expect(WindowPointerMoveRequestSchema.safeParse({ screenX: 3, screenY: -4 }).success).toBe(true);
    expect(WindowPointerMoveRequestSchema.safeParse({ screenX: 3.2, screenY: 4 }).success).toBe(false);
    expect(WindowPointerMoveRequestSchema.safeParse({ kind: 'move', screenX: 3, screenY: 4 }).success).toBe(false);
  });
});
