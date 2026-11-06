import { describe, expect, it } from 'vitest';

import { fail, ok } from '@shared/ipc/result';

import { callSafely } from '../callSafely';

const FAIL_MESSAGE = '요청을 처리하지 못했습니다';

describe('callSafely', () => {
  it('성공 봉투는 그대로 돌려준다', async () => {
    const result = await callSafely(() => Promise.resolve(ok({ runId: 'run-1' })), FAIL_MESSAGE);
    expect(result).toEqual({ ok: true, data: { runId: 'run-1' } });
  });

  it('실패 봉투는 주어진 문장으로 바꾸지 않고 그대로 돌려준다', async () => {
    const result = await callSafely(() => Promise.resolve(fail('BUSY', '이미 실행 중입니다')), FAIL_MESSAGE);
    expect(result).toEqual({ ok: false, error: { code: 'BUSY', message: '이미 실행 중입니다' } });
  });

  it('호출이 throw 하면 INTERNAL 과 주어진 문장의 실패 봉투를 돌려준다', async () => {
    const result = await callSafely(() => Promise.reject(new Error('no handler')), FAIL_MESSAGE);
    expect(result).toEqual({ ok: false, error: { code: 'INTERNAL', message: FAIL_MESSAGE } });
  });
});
