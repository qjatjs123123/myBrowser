import { describe, expect, it } from 'vitest';

import { toRunTimeText } from '../formatRunTime';

describe('toRunTimeText', () => {
  it('로컬 시각을 `M월 D일 HH:mm` 으로 만든다', () => {
    const createdAt = new Date(2026, 10, 6, 19, 5).toISOString();
    expect(toRunTimeText(createdAt)).toBe('11월 6일 19:05');
  });

  it('한 자리 시·분은 0 을 붙이고 월·일은 붙이지 않는다', () => {
    const createdAt = new Date(2026, 0, 3, 7, 9).toISOString();
    expect(toRunTimeText(createdAt)).toBe('1월 3일 07:09');
  });

  it('읽을 수 없는 값이면 빈 문자열이다', () => {
    expect(toRunTimeText('not-a-date')).toBe('');
  });
});
