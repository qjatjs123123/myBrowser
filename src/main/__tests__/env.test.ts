import { describe, expect, it, vi } from 'vitest';

import { loadDotEnv, readEnv } from '../env';

const GATEWAY_DEFAULT = 'https://gateway.example.test';
const DEV = { isPackaged: false, defaultGatewayUrl: GATEWAY_DEFAULT };
const PACKAGED = { isPackaged: true, defaultGatewayUrl: GATEWAY_DEFAULT };
const PROXY = 'https://proxy.example.test';
/** 개발 실행의 최소 dev 프로필 env (spec 007 FR-2·FR-3) */
const DEV_PROFILE = { MYBROWSER_PROFILE: 'dev', ANTHROPIC_BASE_URL: PROXY } as const;

describe('readEnv', () => {
  it('dev 프로필 최소 설정이면 development · 포트 9222 · 명시 아님', () => {
    expect(readEnv(DEV_PROFILE, DEV)).toEqual({
      mode: 'development',
      isFakeModel: false,
      profileKind: 'dev',
      gatewayUrl: GATEWAY_DEFAULT,
      cdpPort: 9222,
      isCdpPortExplicit: false,
      userDataDir: undefined,
      rendererDevUrl: undefined,
      anthropicApiKey: undefined,
      anthropicBaseUrl: PROXY,
      fakeScenario: undefined,
      fakeScenarioDir: undefined,
      model: 'bedrock.anthropic.claude-opus-5-5',
    });
  });

  it('NODE_ENV=test 또는 MYBROWSER_FAKE_MODEL=1 이면 test 모드다', () => {
    expect(readEnv({ ...DEV_PROFILE, NODE_ENV: 'test' }, DEV).mode).toBe('test');
    const fake = readEnv({ MYBROWSER_FAKE_MODEL: '1' }, PACKAGED);
    expect(fake.mode).toBe('test');
    expect(fake.isFakeModel).toBe(true);
  });

  it('패키징된 앱이고 test 가 아니면 production 이다', () => {
    expect(readEnv({}, PACKAGED).mode).toBe('production');
  });

  it('MYBROWSER_CDP_PORT 를 숫자로 읽고 명시됨으로 표시한다 (0 포함)', () => {
    expect(readEnv({ ...DEV_PROFILE, MYBROWSER_CDP_PORT: '9333' }, DEV)).toMatchObject({ cdpPort: 9333, isCdpPortExplicit: true });
    expect(readEnv({ ...DEV_PROFILE, MYBROWSER_CDP_PORT: '0' }, DEV)).toMatchObject({ cdpPort: 0, isCdpPortExplicit: true });
  });

  it('포트가 숫자가 아니거나 범위를 넘으면 시작 시점에 실패한다', () => {
    expect(() => readEnv({ ...DEV_PROFILE, MYBROWSER_CDP_PORT: 'abc' }, DEV)).toThrow('MYBROWSER_CDP_PORT');
    expect(() => readEnv({ ...DEV_PROFILE, MYBROWSER_CDP_PORT: '70000' }, DEV)).toThrow('MYBROWSER_CDP_PORT');
  });

  it('MYBROWSER_USER_DATA 를 userDataDir 로 넘긴다', () => {
    expect(readEnv({ ...DEV_PROFILE, MYBROWSER_USER_DATA: '/tmp/profile-1' }, DEV).userDataDir).toBe('/tmp/profile-1');
  });

  it('ELECTRON_RENDERER_URL 을 rendererDevUrl 로 넘기고, URL 이 아니면 실패한다', () => {
    expect(readEnv({ ...DEV_PROFILE, ELECTRON_RENDERER_URL: 'http://localhost:5173' }, DEV).rendererDevUrl).toBe(
      'http://localhost:5173',
    );
    expect(() => readEnv({ ...DEV_PROFILE, ELECTRON_RENDERER_URL: 'not a url' }, DEV)).toThrow('ELECTRON_RENDERER_URL');
  });
});

describe('readEnv — 에이전트 설정 (spec 003)', () => {
  it('ANTHROPIC_API_KEY 를 anthropicApiKey 로 넘기고, 빈 문자열이면 실패한다', () => {
    expect(readEnv({ ...DEV_PROFILE, ANTHROPIC_API_KEY: 'sk-test-key' }, DEV).anthropicApiKey).toBe('sk-test-key');
    expect(() => readEnv({ ...DEV_PROFILE, ANTHROPIC_API_KEY: '' }, DEV)).toThrow('ANTHROPIC_API_KEY');
  });

  it('MYBROWSER_FAKE_SCENARIO 를 fakeScenario 로 넘기고, 소문자·숫자·하이픈 밖이면 실패한다', () => {
    expect(readEnv({ ...DEV_PROFILE, MYBROWSER_FAKE_SCENARIO: 'search-read' }, DEV).fakeScenario).toBe('search-read');
    expect(() => readEnv({ ...DEV_PROFILE, MYBROWSER_FAKE_SCENARIO: '../etc' }, DEV)).toThrow('MYBROWSER_FAKE_SCENARIO');
  });

  it('fake 프로필은 MYBROWSER_MODEL 이 없으면 claude-opus-5-5, 있으면 그 값이다', () => {
    expect(readEnv({ MYBROWSER_FAKE_MODEL: '1' }, DEV).model).toBe('claude-opus-5-5');
    expect(readEnv({ MYBROWSER_FAKE_MODEL: '1', MYBROWSER_MODEL: 'claude-sonnet-5' }, DEV).model).toBe('claude-sonnet-5');
  });

  it('MYBROWSER_MODEL 에 날짜 접미사가 있으면 실패한다', () => {
    expect(() => readEnv({ ...DEV_PROFILE, MYBROWSER_MODEL: 'claude-opus-4-20250514' }, DEV)).toThrow('MYBROWSER_MODEL');
  });
});

describe('readEnv — 모델 프로필 (spec 005, spec 007)', () => {
  it('MYBROWSER_FAKE_MODEL=1 이면 게이트웨이 주소·패키징·PROFILE 과 상관없이 fake 다', () => {
    const env = readEnv(
      { MYBROWSER_FAKE_MODEL: '1', MYBROWSER_PROFILE: 'dev', MYBROWSER_GATEWAY_URL: 'http://127.0.0.1:4000' },
      PACKAGED,
    );
    expect(env.profileKind).toBe('fake');
  });

  it('fake 는 MYBROWSER_PROFILE 이 없어도 시작한다', () => {
    expect(readEnv({ MYBROWSER_FAKE_MODEL: '1' }, DEV).profileKind).toBe('fake');
  });

  it('패키징된 앱은 MYBROWSER_PROFILE=dev 여도 prod 다', () => {
    expect(readEnv({ ...DEV_PROFILE }, PACKAGED).profileKind).toBe('prod');
  });

  it('패키징된 앱은 PROFILE 이 없어도 prod 다', () => {
    expect(readEnv({}, PACKAGED).profileKind).toBe('prod');
  });

  it('개발 실행에서 MYBROWSER_PROFILE 이 없으면 시작 시점에 실패한다', () => {
    expect(() => readEnv({}, DEV)).toThrow('환경변수가 올바르지 않습니다: MYBROWSER_PROFILE');
  });

  it('MYBROWSER_PROFILE 이 dev·prod 가 아니면 실패한다', () => {
    expect(() => readEnv({ MYBROWSER_PROFILE: 'direct' }, DEV)).toThrow('MYBROWSER_PROFILE');
  });

  it('MYBROWSER_GATEWAY_URL 만으로는 prod 가 되지 않는다 (PROFILE 없으면 실패)', () => {
    expect(() => readEnv({ MYBROWSER_GATEWAY_URL: 'http://127.0.0.1:4000' }, DEV)).toThrow('MYBROWSER_PROFILE');
  });

  it('MYBROWSER_PROFILE=prod 면 개발 실행도 prod 다', () => {
    expect(readEnv({ MYBROWSER_PROFILE: 'prod' }, DEV).profileKind).toBe('prod');
  });

  it('NODE_ENV=test·FAKE=0·PROFILE=prod·게이트웨이 주소면 prod 이고 그 주소를 쓴다', () => {
    const env = readEnv(
      { MYBROWSER_FAKE_MODEL: '0', NODE_ENV: 'test', MYBROWSER_PROFILE: 'prod', MYBROWSER_GATEWAY_URL: 'http://127.0.0.1:4000' },
      DEV,
    );
    expect([env.profileKind, env.gatewayUrl]).toEqual(['prod', 'http://127.0.0.1:4000']);
  });

  it('MYBROWSER_GATEWAY_URL 이 없으면 defaultGatewayUrl 을 쓴다', () => {
    expect(readEnv({}, PACKAGED).gatewayUrl).toBe(GATEWAY_DEFAULT);
  });

  it('MYBROWSER_GATEWAY_URL 이 http(s) URL 이 아니면 실패한다', () => {
    expect(() => readEnv({ MYBROWSER_PROFILE: 'prod', MYBROWSER_GATEWAY_URL: 'file:///etc/passwd' }, DEV)).toThrow(
      'MYBROWSER_GATEWAY_URL',
    );
  });

  it('prod 는 MYBROWSER_MODEL 을 무시하고 claude-opus-5-5 로 고정한다', () => {
    expect(readEnv({ MYBROWSER_MODEL: 'claude-sonnet-5' }, PACKAGED).model).toBe('claude-opus-5-5');
  });

  it('prod 는 ANTHROPIC_API_KEY·ANTHROPIC_BASE_URL 을 무시한다', () => {
    const env = readEnv({ MYBROWSER_PROFILE: 'prod', ANTHROPIC_API_KEY: 'sk-test-key', ANTHROPIC_BASE_URL: PROXY }, DEV);
    expect([env.anthropicApiKey, env.anthropicBaseUrl]).toEqual([undefined, undefined]);
  });

  it('dev 기본 모델은 bedrock.anthropic.claude-opus-5-5 이고 MYBROWSER_MODEL 이 있으면 그 값이다', () => {
    expect(readEnv(DEV_PROFILE, DEV).model).toBe('bedrock.anthropic.claude-opus-5-5');
    expect(readEnv({ ...DEV_PROFILE, MYBROWSER_MODEL: 'vertex_ai.anthropic.claude-opus-5-5' }, DEV).model).toBe(
      'vertex_ai.anthropic.claude-opus-5-5',
    );
  });
});

describe('readEnv — CDP 포트 (spec 005)', () => {
  it('패키징된 앱이 포트를 지정하지 않으면 cdpPort 0 이고 명시 아님이다', () => {
    expect(readEnv({}, PACKAGED)).toMatchObject({ cdpPort: 0, isCdpPortExplicit: false });
  });

  it('패키징된 앱도 MYBROWSER_CDP_PORT 를 주면 그 값을 쓴다', () => {
    expect(readEnv({ MYBROWSER_CDP_PORT: '9400' }, PACKAGED)).toMatchObject({ cdpPort: 9400, isCdpPortExplicit: true });
  });
});

describe('readEnv — fakeScenarioDir (spec 005)', () => {
  it('test 모드면 MYBROWSER_FAKE_SCENARIO_DIR 를 fakeScenarioDir 로 넘긴다', () => {
    const env = readEnv({ MYBROWSER_FAKE_MODEL: '1', MYBROWSER_FAKE_SCENARIO_DIR: '/tmp/scenarios' }, PACKAGED);
    expect(env.fakeScenarioDir).toBe('/tmp/scenarios');
  });

  it('test 모드가 아니면 MYBROWSER_FAKE_SCENARIO_DIR 를 무시한다', () => {
    expect(readEnv({ MYBROWSER_FAKE_SCENARIO_DIR: '/tmp/scenarios' }, PACKAGED).fakeScenarioDir).toBeUndefined();
    expect(readEnv({ ...DEV_PROFILE, MYBROWSER_FAKE_SCENARIO_DIR: '/tmp/scenarios' }, DEV).fakeScenarioDir).toBeUndefined();
  });
});

describe('readEnv — 입력 토큰 상한 (spec 020 FR-1)', () => {
  it('MYBROWSER_MAX_INPUT_TOKENS=1500000 이면 maxInputTokens 가 1500000 이다', () => {
    expect(readEnv({ ...DEV_PROFILE, MYBROWSER_MAX_INPUT_TOKENS: '1500000' }, DEV).maxInputTokens).toBe(1_500_000);
  });

  it('MYBROWSER_MAX_INPUT_TOKENS 가 없으면 maxInputTokens 는 undefined 다', () => {
    expect(readEnv(DEV_PROFILE, DEV).maxInputTokens).toBeUndefined();
  });

  it.each(['0', '-1', 'abc', '1.5'])('MYBROWSER_MAX_INPUT_TOKENS=%s 면 시작 시점에 실패한다', (value) => {
    expect(() => readEnv({ ...DEV_PROFILE, MYBROWSER_MAX_INPUT_TOKENS: value }, DEV)).toThrow(
      'MYBROWSER_MAX_INPUT_TOKENS',
    );
  });
});

describe('loadDotEnv', () => {
  /** 파일 내용을 source 에 쓰는 가짜 loadEnvFile */
  function createFakeLoad(source: NodeJS.ProcessEnv, fileValues: Record<string, string>) {
    return vi.fn(() => {
      Object.assign(source, fileValues);
    });
  }

  it('파일이 있으면 읽어서 source 에 넣는다', () => {
    const source: NodeJS.ProcessEnv = {};
    const loadEnvFile = createFakeLoad(source, { ANTHROPIC_API_KEY: 'from-file' });
    loadDotEnv({ path: '/app/.env', isPackaged: false, source, exists: () => true, loadEnvFile });
    expect(loadEnvFile).toHaveBeenCalledWith('/app/.env');
    expect(source.ANTHROPIC_API_KEY).toBe('from-file');
  });

  it('파일이 없으면 loadEnvFile 을 부르지 않는다', () => {
    const loadEnvFile = vi.fn();
    loadDotEnv({ path: '/app/.env', isPackaged: false, source: {}, exists: () => false, loadEnvFile });
    expect(loadEnvFile).not.toHaveBeenCalled();
  });

  it('이미 설정된 값은 파일 값으로 덮어쓰지 않는다', () => {
    const source: NodeJS.ProcessEnv = { MYBROWSER_MODEL: 'from-shell' };
    const loadEnvFile = createFakeLoad(source, { MYBROWSER_MODEL: 'from-file', ANTHROPIC_API_KEY: 'k' });
    loadDotEnv({ path: '/app/.env', isPackaged: false, source, exists: () => true, loadEnvFile });
    expect(source).toEqual({ MYBROWSER_MODEL: 'from-shell', ANTHROPIC_API_KEY: 'k' });
  });

  it('NODE_ENV=test 이면 파일이 있어도 loadEnvFile 을 부르지 않는다', () => {
    const loadEnvFile = vi.fn();
    loadDotEnv({ path: '/app/.env', isPackaged: false, source: { NODE_ENV: 'test' }, exists: () => true, loadEnvFile });
    expect(loadEnvFile).not.toHaveBeenCalled();
  });

  it('MYBROWSER_FAKE_MODEL=1 이면 파일이 있어도 loadEnvFile 을 부르지 않는다', () => {
    const loadEnvFile = vi.fn();
    loadDotEnv({
      path: '/app/.env',
      isPackaged: false,
      source: { MYBROWSER_FAKE_MODEL: '1' },
      exists: () => true,
      loadEnvFile,
    });
    expect(loadEnvFile).not.toHaveBeenCalled();
  });

  it('패키징된 앱이면 파일이 있어도 loadEnvFile 을 부르지 않는다', () => {
    const loadEnvFile = vi.fn();
    loadDotEnv({ path: '/app/.env', isPackaged: true, source: {}, exists: () => true, loadEnvFile });
    expect(loadEnvFile).not.toHaveBeenCalled();
  });
});

describe('readEnv — dev 프로필 프록시 주소 (spec 006, spec 007 FR-3)', () => {
  it('dev 면 ANTHROPIC_BASE_URL 을 anthropicBaseUrl 로 넘긴다', () => {
    expect(readEnv(DEV_PROFILE, DEV).anthropicBaseUrl).toBe(PROXY);
  });

  it('dev 인데 ANTHROPIC_BASE_URL 이 없으면 시작 시점에 실패한다', () => {
    expect(() => readEnv({ MYBROWSER_PROFILE: 'dev' }, DEV)).toThrow('환경변수가 올바르지 않습니다: ANTHROPIC_BASE_URL');
  });

  it('fake 면 ANTHROPIC_BASE_URL 을 무시한다', () => {
    expect(readEnv({ MYBROWSER_FAKE_MODEL: '1', ANTHROPIC_BASE_URL: PROXY }, DEV).anthropicBaseUrl).toBeUndefined();
  });

  it('패키징된 앱(prod)이면 ANTHROPIC_BASE_URL 을 무시한다', () => {
    expect(readEnv({ ANTHROPIC_BASE_URL: PROXY }, PACKAGED).anthropicBaseUrl).toBeUndefined();
  });

  it('ANTHROPIC_BASE_URL 이 http(s) URL 이 아니면 시작 시점에 실패한다', () => {
    expect(() => readEnv({ MYBROWSER_PROFILE: 'dev', ANTHROPIC_BASE_URL: 'file:///etc/passwd' }, DEV)).toThrow(
      'ANTHROPIC_BASE_URL',
    );
  });
});
