import { describe, expect, it } from 'vitest';

import { cn } from '../utils';

describe('cn', () => {
  it('충돌하는 Tailwind 클래스는 뒤쪽을 남긴다', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('거짓 값은 빼고 조건부 클래스를 합친다', () => {
    const isActive = false;
    expect(cn('a', isActive && 'b', undefined, { c: true, d: false })).toBe('a c');
  });
});
