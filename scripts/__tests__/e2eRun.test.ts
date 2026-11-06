import { describe, expect, it } from 'vitest';

import { buildE2eCommand } from '../e2eRun';

const BASE_ENV = { PATH: '/usr/bin', WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' };

describe('buildE2eCommand (spec 008 FR-1)', () => {
  it('Linux 에 xvfb-run 이 있으면 xvfb-run -a playwright test 로 감싼다', () => {
    const result = buildE2eCommand({ platform: 'linux', env: BASE_ENV, hasXvfb: true, argList: [] });
    expect([result.command, result.argList]).toEqual(['xvfb-run', ['-a', 'playwright', 'test']]);
  });

  it('가상 디스플레이로 돌릴 때는 WAYLAND_DISPLAY 를 지운다', () => {
    const result = buildE2eCommand({ platform: 'linux', env: BASE_ENV, hasXvfb: true, argList: [] });
    expect(result.env).not.toHaveProperty('WAYLAND_DISPLAY');
    expect(result.env['PATH']).toBe('/usr/bin');
  });

  it('E2E_HEADED=1 이면 화면에 띄우는 playwright test 그대로다', () => {
    const env = { ...BASE_ENV, E2E_HEADED: '1' };
    const result = buildE2eCommand({ platform: 'linux', env, hasXvfb: true, argList: [] });
    expect([result.command, result.argList, result.env]).toEqual(['playwright', ['test'], env]);
  });

  it('xvfb-run 이 없으면 playwright test 그대로다', () => {
    const result = buildE2eCommand({ platform: 'linux', env: BASE_ENV, hasXvfb: false, argList: [] });
    expect([result.command, result.argList]).toEqual(['playwright', ['test']]);
  });

  it.each(['darwin', 'win32'] as const)('%s 면 playwright test 그대로다', (platform) => {
    const result = buildE2eCommand({ platform, env: BASE_ENV, hasXvfb: true, argList: [] });
    expect(result.command).toBe('playwright');
  });

  it('인자는 순서대로 playwright test 뒤에 붙는다', () => {
    const argList = ['e2e/a.spec.ts', '-c', 'x.config.ts'];
    const result = buildE2eCommand({ platform: 'linux', env: BASE_ENV, hasXvfb: true, argList });
    expect(result.argList).toEqual(['-a', 'playwright', 'test', 'e2e/a.spec.ts', '-c', 'x.config.ts']);
  });
});
