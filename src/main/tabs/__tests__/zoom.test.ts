import { describe, expect, it } from 'vitest';

import { getNextZoomPercent } from '../zoom';

describe('getNextZoomPercent', () => {
  it('100 에서 in 이면 110 이다', () => {
    expect(getNextZoomPercent(100, 'in')).toBe(110);
  });

  it('100 에서 out 이면 90 이다', () => {
    expect(getNextZoomPercent(100, 'out')).toBe(90);
  });

  it('500 에서 in 이면 그대로 500 이다', () => {
    expect(getNextZoomPercent(500, 'in')).toBe(500);
  });

  it('25 에서 out 이면 그대로 25 다', () => {
    expect(getNextZoomPercent(25, 'out')).toBe(25);
  });

  it('단계 사이 값 105 에서 in 이면 110, out 이면 100 이다', () => {
    expect(getNextZoomPercent(105, 'in')).toBe(110);
    expect(getNextZoomPercent(105, 'out')).toBe(100);
  });

  it('reset 이면 어디서든 100 이다', () => {
    expect(getNextZoomPercent(250, 'reset')).toBe(100);
  });
});
