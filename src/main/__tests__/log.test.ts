import { afterEach, describe, expect, it, vi } from 'vitest';

import { log } from '../log';

describe('log', () => {
  afterEach(() => vi.restoreAllMocks());

  it('error 는 [main.error] 접두사로 stderr 에 쓴다', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    log.error('ipc', '처리 실패', new Error('boom'));
    const line = String(stderr.mock.calls[0]?.[0]);
    expect(line.startsWith('[main.error] [ipc] 처리 실패 ')).toBe(true);
    expect(line).toContain('boom');
  });

  it('info 는 stdout 에, meta 는 JSON 으로 쓴다', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    log.info('app', '시작', { port: 0 });
    expect(stdout).toHaveBeenCalledWith('[main.info] [app] 시작 {"port":0}\n');
  });
});
