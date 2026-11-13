import { describe, expect, it } from 'vitest';

import {
  EVAL_MESSAGE,
  EVAL_REAL_ENV,
  EVAL_REPEAT_ENV,
  EVAL_SET_ENV,
  pickModelEnv,
  resolveEvalCommand,
} from '../cliArgs';

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

const REAL_ARG_LIST = ['--real', '--yes-spend'];

/** 인자로 해석 — 키는 있다고 본다 */
function resolve(argList: string[]) {
  return resolveEvalCommand({ argList, hasApiKey: true });
}

describe('resolveEvalCommand — --set·--repeat (spec 020)', () => {
  it('--set sites 를 --real 없이 쓰면 종료 코드 2 와 안내를 돌려준다', () => {
    expect(resolve(['--set', 'sites'])).toEqual({ kind: 'exit', code: 2, message: EVAL_MESSAGE.needRealForSites });
  });

  it('--real --yes-spend --set sites 면 세트 env 와 기본 반복 3 을 넘긴다', () => {
    expect(resolve([...REAL_ARG_LIST, '--set', 'sites'])).toMatchObject({
      kind: 'run',
      env: { [EVAL_REAL_ENV]: '1', [EVAL_SET_ENV]: 'sites', [EVAL_REPEAT_ENV]: '3' },
    });
  });

  it('--repeat 5 면 반복 env 가 5 다', () => {
    expect(resolve([...REAL_ARG_LIST, '--set', 'sites', '--repeat', '5'])).toMatchObject({
      env: { [EVAL_REPEAT_ENV]: '5' },
    });
  });

  it.each(['0', '11', 'x', '1.5'])('--repeat %s 면 종료 코드 2 다', (value) => {
    expect(resolve([...REAL_ARG_LIST, '--set', 'sites', '--repeat', value])).toEqual({
      kind: 'exit',
      code: 2,
      message: EVAL_MESSAGE.invalidRepeat,
    });
  });

  it('--set 값이 sites 가 아니면 종료 코드 2 다', () => {
    expect(resolve([...REAL_ARG_LIST, '--set', 'foo'])).toEqual({
      kind: 'exit',
      code: 2,
      message: EVAL_MESSAGE.unknownSet,
    });
  });

  it('--set 값이 없으면 종료 코드 2 다', () => {
    expect(resolve([...REAL_ARG_LIST, '--set'])).toEqual({ kind: 'exit', code: 2, message: EVAL_MESSAGE.unknownSet });
  });

  it('--set sites 없이 --repeat 를 쓰면 종료 코드 2 다', () => {
    expect(resolve([...REAL_ARG_LIST, '--repeat', '3'])).toEqual({
      kind: 'exit',
      code: 2,
      message: EVAL_MESSAGE.repeatNeedsSites,
    });
  });

  it('--set·--repeat 와 그 값은 playwright 인자로 넘기지 않는다', () => {
    expect(resolve([...REAL_ARG_LIST, '--set', 'sites', '--repeat', '2', '--grep', 'naver'])).toMatchObject({
      playwrightArgList: ['--grep', 'naver'],
    });
  });

  it('--set 이 없으면 실제 모델 env 만 넘긴다', () => {
    expect(resolve(REAL_ARG_LIST)).toEqual({
      kind: 'run',
      isReal: true,
      env: { [EVAL_REAL_ENV]: '1' },
      playwrightArgList: [],
    });
  });
});

describe('pickModelEnv (spec 020 FR-8)', () => {
  it('셸에 없는 모델 키만 .env 값으로 채운다', () => {
    const dotEnv = { ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE_URL: 'https://proxy.example' };
    expect(pickModelEnv({ dotEnv, processEnv: { ANTHROPIC_BASE_URL: 'https://shell.example' } })).toEqual({
      ANTHROPIC_API_KEY: 'k',
    });
  });

  it('두 모델 키 외의 .env 값은 넘기지 않는다', () => {
    expect(pickModelEnv({ dotEnv: { OTHER_SECRET: 'x', MYBROWSER_PROFILE: 'dev' }, processEnv: {} })).toEqual({});
  });

  it('셸에 값이 있으면 셸 값을 그대로 두고 아무것도 넘기지 않는다', () => {
    const env = { ANTHROPIC_API_KEY: 'shell', ANTHROPIC_BASE_URL: 'https://shell.example' };
    expect(pickModelEnv({ dotEnv: { ANTHROPIC_API_KEY: 'k' }, processEnv: env })).toEqual({});
  });
});
