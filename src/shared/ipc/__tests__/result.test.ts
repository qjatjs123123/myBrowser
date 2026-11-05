import { describe, expect, it } from 'vitest';

import { fail, ok } from '../result';

describe('IPC 봉투', () => {
  it('ok 는 data 를 담은 성공 봉투를 만든다', () => {
    expect(ok({ a: 1 })).toEqual({ ok: true, data: { a: 1 } });
  });

  it('fail 은 code 와 한국어 message 를 담은 실패 봉투를 만든다', () => {
    expect(fail('INTERNAL', '앱 내부 오류가 발생했습니다')).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: '앱 내부 오류가 발생했습니다' },
    });
  });

  it('fail 에 issues 를 주면 함께 담는다', () => {
    const result = fail('INVALID_INPUT', '입력이 올바르지 않습니다', [{ path: ['x'] }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues).toEqual([{ path: ['x'] }]);
  });
});
