import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readEnv } from '../../env';
import { getCdpSwitches, removeStaleActivePort } from '../cdp';

const PACKAGED = { isPackaged: true, defaultGatewayUrl: 'https://gateway.example.test' };

describe('getCdpSwitches', () => {
  it('개발 모드 기본값은 127.0.0.1:9222 이다', () => {
    expect(getCdpSwitches({ port: 9222 })).toEqual([
      ['remote-debugging-address', '127.0.0.1'],
      ['remote-debugging-port', '9222'],
    ]);
  });

  it('지정한 포트와 0(임의 포트)을 그대로 쓴다', () => {
    expect(getCdpSwitches({ port: 9333 })).toContainEqual(['remote-debugging-port', '9333']);
    expect(getCdpSwitches({ port: 0 })).toContainEqual(['remote-debugging-port', '0']);
  });

  it('패키징된 앱이 포트를 지정하지 않으면 127.0.0.1 + port 0 으로 연다', () => {
    const env = readEnv({}, PACKAGED);
    expect(getCdpSwitches({ port: env.cdpPort })).toEqual([
      ['remote-debugging-address', '127.0.0.1'],
      ['remote-debugging-port', '0'],
    ]);
  });

  it('패키징된 앱도 명시한 포트는 그대로 127.0.0.1 로 연다', () => {
    const env = readEnv({ MYBROWSER_CDP_PORT: '9400' }, PACKAGED);
    expect(getCdpSwitches({ port: env.cdpPort })).toEqual([
      ['remote-debugging-address', '127.0.0.1'],
      ['remote-debugging-port', '9400'],
    ]);
  });
});

describe('removeStaleActivePort', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mybrowser-cdp-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('userData 의 DevToolsActivePort 를 지운다', () => {
    const path = join(dir, 'DevToolsActivePort');
    writeFileSync(path, '9555\n/devtools/browser/abc');
    removeStaleActivePort(dir);
    expect(existsSync(path)).toBe(false);
  });

  it('파일이 없으면 아무 일 없이 지나간다', () => {
    expect(() => removeStaleActivePort(dir)).not.toThrow();
  });

  it('삭제가 실패해도 throw 하지 않는다', () => {
    const rmSyncFake = vi.fn(() => {
      throw new Error('EACCES');
    });
    expect(() => removeStaleActivePort(dir, { rmSync: rmSyncFake })).not.toThrow();
    expect(rmSyncFake).toHaveBeenCalledWith(join(dir, 'DevToolsActivePort'), { force: true });
  });
});
