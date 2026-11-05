import { describe, expect, it } from 'vitest';

import { getCdpSwitches } from '../cdp';

describe('getCdpSwitches', () => {
  it('개발 모드 기본값은 127.0.0.1:9222 이다', () => {
    expect(getCdpSwitches({ port: 9222, isPackaged: false, isPortExplicit: false })).toEqual([
      ['remote-debugging-address', '127.0.0.1'],
      ['remote-debugging-port', '9222'],
    ]);
  });

  it('지정한 포트와 0(임의 포트)을 그대로 쓴다', () => {
    expect(getCdpSwitches({ port: 9333, isPackaged: false, isPortExplicit: true })).toContainEqual([
      'remote-debugging-port',
      '9333',
    ]);
    expect(getCdpSwitches({ port: 0, isPackaged: false, isPortExplicit: true })).toContainEqual([
      'remote-debugging-port',
      '0',
    ]);
  });

  it('패키징된 앱은 포트를 명시하지 않으면 열지 않는다', () => {
    expect(getCdpSwitches({ port: 9222, isPackaged: true, isPortExplicit: false })).toEqual([]);
  });

  it('패키징된 앱도 포트를 명시하면 127.0.0.1 로만 연다', () => {
    expect(getCdpSwitches({ port: 9400, isPackaged: true, isPortExplicit: true })).toEqual([
      ['remote-debugging-address', '127.0.0.1'],
      ['remote-debugging-port', '9400'],
    ]);
  });
});
