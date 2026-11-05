import { describe, expect, it, vi } from 'vitest';

import { loadDotEnv, readEnv } from '../env';

const DEV = { isPackaged: false };

describe('readEnv', () => {
  it('아무것도 없으면 development · 포트 9222 · 명시 아님', () => {
    expect(readEnv({}, DEV)).toEqual({
      mode: 'development',
      isFakeModel: false,
      cdpPort: 9222,
      isCdpPortExplicit: false,
      userDataDir: undefined,
      rendererDevUrl: undefined,
      anthropicApiKey: undefined,
      fakeScenario: undefined,
      model: 'claude-opus-5-5',
    });
  });

  it('NODE_ENV=test 또는 MYBROWSER_FAKE_MODEL=1 이면 test 모드다', () => {
    expect(readEnv({ NODE_ENV: 'test' }, DEV).mode).toBe('test');
    const fake = readEnv({ MYBROWSER_FAKE_MODEL: '1' }, { isPackaged: true });
    expect(fake.mode).toBe('test');
    expect(fake.isFakeModel).toBe(true);
  });

  it('패키징된 앱이고 test 가 아니면 production 이다', () => {
    expect(readEnv({}, { isPackaged: true }).mode).toBe('production');
  });

  it('MYBROWSER_CDP_PORT 를 숫자로 읽고 명시됨으로 표시한다 (0 포함)', () => {
    expect(readEnv({ MYBROWSER_CDP_PORT: '9333' }, DEV)).toMatchObject({ cdpPort: 9333, isCdpPortExplicit: true });
    expect(readEnv({ MYBROWSER_CDP_PORT: '0' }, DEV)).toMatchObject({ cdpPort: 0, isCdpPortExplicit: true });
  });

  it('포트가 숫자가 아니거나 범위를 넘으면 시작 시점에 실패한다', () => {
    expect(() => readEnv({ MYBROWSER_CDP_PORT: 'abc' }, DEV)).toThrow('MYBROWSER_CDP_PORT');
    expect(() => readEnv({ MYBROWSER_CDP_PORT: '70000' }, DEV)).toThrow('MYBROWSER_CDP_PORT');
  });

  it('MYBROWSER_USER_DATA 를 userDataDir 로 넘긴다', () => {
    expect(readEnv({ MYBROWSER_USER_DATA: '/tmp/profile-1' }, DEV).userDataDir).toBe('/tmp/profile-1');
  });

  it('ELECTRON_RENDERER_URL 을 rendererDevUrl 로 넘기고, URL 이 아니면 실패한다', () => {
    expect(readEnv({ ELECTRON_RENDERER_URL: 'http://localhost:5173' }, DEV).rendererDevUrl).toBe(
      'http://localhost:5173',
    );
    expect(() => readEnv({ ELECTRON_RENDERER_URL: 'not a url' }, DEV)).toThrow('ELECTRON_RENDERER_URL');
  });
});

describe('readEnv — 에이전트 설정 (spec 003)', () => {
  it('ANTHROPIC_API_KEY 를 anthropicApiKey 로 넘기고, 빈 문자열이면 실패한다', () => {
    expect(readEnv({ ANTHROPIC_API_KEY: 'sk-test-key' }, DEV).anthropicApiKey).toBe('sk-test-key');
    expect(() => readEnv({ ANTHROPIC_API_KEY: '' }, DEV)).toThrow('ANTHROPIC_API_KEY');
  });

  it('MYBROWSER_FAKE_SCENARIO 를 fakeScenario 로 넘기고, 소문자·숫자·하이픈 밖이면 실패한다', () => {
    expect(readEnv({ MYBROWSER_FAKE_SCENARIO: 'search-read' }, DEV).fakeScenario).toBe('search-read');
    expect(() => readEnv({ MYBROWSER_FAKE_SCENARIO: '../etc' }, DEV)).toThrow('MYBROWSER_FAKE_SCENARIO');
  });

  it('MYBROWSER_MODEL 이 없으면 claude-opus-5-5, 있으면 그 값이다', () => {
    expect(readEnv({}, DEV).model).toBe('claude-opus-5-5');
    expect(readEnv({ MYBROWSER_MODEL: 'claude-sonnet-5' }, DEV).model).toBe('claude-sonnet-5');
  });

  it('MYBROWSER_MODEL 에 날짜 접미사가 있으면 실패한다', () => {
    expect(() => readEnv({ MYBROWSER_MODEL: 'claude-opus-4-20250514' }, DEV)).toThrow('MYBROWSER_MODEL');
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
    loadDotEnv({ path: '/app/.env', source, exists: () => true, loadEnvFile });
    expect(loadEnvFile).toHaveBeenCalledWith('/app/.env');
    expect(source.ANTHROPIC_API_KEY).toBe('from-file');
  });

  it('파일이 없으면 loadEnvFile 을 부르지 않는다', () => {
    const loadEnvFile = vi.fn();
    loadDotEnv({ path: '/app/.env', source: {}, exists: () => false, loadEnvFile });
    expect(loadEnvFile).not.toHaveBeenCalled();
  });

  it('이미 설정된 값은 파일 값으로 덮어쓰지 않는다', () => {
    const source: NodeJS.ProcessEnv = { MYBROWSER_MODEL: 'from-shell' };
    const loadEnvFile = createFakeLoad(source, { MYBROWSER_MODEL: 'from-file', ANTHROPIC_API_KEY: 'k' });
    loadDotEnv({ path: '/app/.env', source, exists: () => true, loadEnvFile });
    expect(source).toEqual({ MYBROWSER_MODEL: 'from-shell', ANTHROPIC_API_KEY: 'k' });
  });

  it('NODE_ENV=test 이면 파일이 있어도 loadEnvFile 을 부르지 않는다', () => {
    const loadEnvFile = vi.fn();
    loadDotEnv({ path: '/app/.env', source: { NODE_ENV: 'test' }, exists: () => true, loadEnvFile });
    expect(loadEnvFile).not.toHaveBeenCalled();
  });

  it('MYBROWSER_FAKE_MODEL=1 이면 파일이 있어도 loadEnvFile 을 부르지 않는다', () => {
    const loadEnvFile = vi.fn();
    loadDotEnv({ path: '/app/.env', source: { MYBROWSER_FAKE_MODEL: '1' }, exists: () => true, loadEnvFile });
    expect(loadEnvFile).not.toHaveBeenCalled();
  });
});
