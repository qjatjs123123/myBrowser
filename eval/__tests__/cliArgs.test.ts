import { describe, expect, it } from 'vitest';

import { EVAL_MESSAGE, EVAL_REAL_ENV, resolveEvalCommand } from '../cliArgs';

describe('resolveEvalCommand', () => {
  it('인자가 없으면 가짜 모델로 실행하고 env 를 바꾸지 않는다', () => {
    expect(resolveEvalCommand({ argList: [], hasApiKey: false })).toEqual({
      kind: 'run',
      isReal: false,
      env: {},
      playwrightArgList: [],
    });
  });

  it('--real 단독이면 실행하지 않고 비용 안내와 종료 코드 2 를 돌려준다', () => {
    expect(resolveEvalCommand({ argList: ['--real'], hasApiKey: true })).toEqual({
      kind: 'exit',
      code: 2,
      message: EVAL_MESSAGE.needYesSpend,
    });
  });

  it('--real --yes-spend 면 실제 모델 env 를 켠다', () => {
    const command = resolveEvalCommand({ argList: ['--real', '--yes-spend'], hasApiKey: true });
    expect(command).toMatchObject({ kind: 'run', isReal: true, env: { [EVAL_REAL_ENV]: '1' } });
  });

  it('--real --yes-spend 인데 키가 없으면 키 안내와 종료 코드 1 을 돌려준다', () => {
    expect(resolveEvalCommand({ argList: ['--real', '--yes-spend'], hasApiKey: false })).toEqual({
      kind: 'exit',
      code: 1,
      message: EVAL_MESSAGE.missingApiKey,
    });
  });

  it('pnpm 이 넘기는 -- 와 자기 플래그를 빼고 나머지는 playwright 에 넘긴다', () => {
    const command = resolveEvalCommand({ argList: ['--', '--grep', 'search-read'], hasApiKey: false });
    expect(command).toMatchObject({ kind: 'run', playwrightArgList: ['--grep', 'search-read'] });
  });

  it('--yes-spend 만 주면 가짜 모델로 실행한다', () => {
    expect(resolveEvalCommand({ argList: ['--yes-spend'], hasApiKey: false })).toMatchObject({
      kind: 'run',
      isReal: false,
    });
  });
});
