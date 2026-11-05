import { describe, expect, it } from 'vitest';

import { IPC } from '@shared/ipc/channels';

import { createAppHandlers } from '../handlers/app';

describe('app 핸들러', () => {
  it('app:getInfo 는 이름·버전·모드를 성공 봉투로 돌려준다', () => {
    const handlers = createAppHandlers({ getName: () => 'myBrowser', getVersion: () => '0.1.0', mode: 'test' });
    expect(handlers[IPC.app.getInfo]()).toEqual({
      ok: true,
      data: { name: 'myBrowser', version: '0.1.0', mode: 'test' },
    });
  });

  it('버전이 계약과 다르면 보내기 전에 실패한다 (우리 버그 조기 발견)', () => {
    const handlers = createAppHandlers({ getName: () => 'myBrowser', getVersion: () => 'dev', mode: 'test' });
    expect(() => handlers[IPC.app.getInfo]()).toThrow();
  });
});
