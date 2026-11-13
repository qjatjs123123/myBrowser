import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { resolveCdpEndpoint } from '../endpoint';

const USER_DATA = '/tmp/mybrowser-user-data';

describe('resolveCdpEndpoint', () => {
  it('포트가 0 이 아니면 그 포트의 127.0.0.1 URL 을 돌려주고 파일을 읽지 않는다', async () => {
    const readFile = vi.fn();
    await expect(resolveCdpEndpoint({ port: 9333, userDataDir: USER_DATA, readFile })).resolves.toBe(
      'http://127.0.0.1:9333',
    );
    expect(readFile).not.toHaveBeenCalled();
  });

  it('포트가 0 이면 DevToolsActivePort 첫 줄의 포트를 쓴다', async () => {
    const readFile = vi.fn(async () => '41234\n/devtools/browser/abc\n');
    await expect(resolveCdpEndpoint({ port: 0, userDataDir: USER_DATA, readFile })).resolves.toBe(
      'http://127.0.0.1:41234',
    );
    expect(readFile).toHaveBeenCalledWith(join(USER_DATA, 'DevToolsActivePort'));
  });

  it('파일이 늦게 생기면 기다렸다가 읽는다', async () => {
    const readFile = vi
      .fn<(path: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockResolvedValueOnce('')
      .mockResolvedValue('5555\n/devtools/browser/x');
    const sleep = vi.fn(async () => undefined);
    await expect(resolveCdpEndpoint({ port: 0, userDataDir: USER_DATA, readFile, sleep })).resolves.toBe(
      'http://127.0.0.1:5555',
    );
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('파일이 끝내 없으면 5s 동안 재시도한 뒤 throw 한다', async () => {
    const readFile = vi.fn(async () => {
      throw new Error('ENOENT');
    });
    const sleep = vi.fn(async (_ms: number) => undefined);
    await expect(resolveCdpEndpoint({ port: 0, userDataDir: USER_DATA, readFile, sleep })).rejects.toThrow(
      'CDP 포트를 찾지 못했습니다',
    );
    const waitedMs = sleep.mock.calls.reduce((sum, [ms]) => sum + ms, 0);
    expect(waitedMs).toBeGreaterThanOrEqual(5000);
  });
});
