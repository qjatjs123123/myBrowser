import { describe, expect, it } from 'vitest';

import { readEnv } from '../env';

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
