import { describe, expect, it, vi } from 'vitest';

import { IPC } from '@shared/ipc/channels';

import { createAppHandlers } from '../handlers/app';

function setup(getVersion = () => '0.1.0') {
  const showMenu = vi.fn();
  const handlers = createAppHandlers({ getName: () => 'myBrowser', getVersion, mode: 'test', showMenu });
  return { handlers, showMenu };
}

describe('app 핸들러', () => {
  it('app:getInfo 는 이름·버전·모드를 성공 봉투로 돌려준다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.app.getInfo]()).toEqual({
      ok: true,
      data: { name: 'myBrowser', version: '0.1.0', mode: 'test' },
    });
  });

  it('버전이 계약과 다르면 보내기 전에 실패한다 (우리 버그 조기 발견)', () => {
    const { handlers } = setup(() => 'dev');
    expect(() => handlers[IPC.app.getInfo]()).toThrow();
  });
});

describe('app:showMenu (spec 023)', () => {
  it('정수 좌표면 showMenu 를 부르고 ok(null) 이다', () => {
    const { handlers, showMenu } = setup();
    expect(handlers[IPC.app.showMenu]({ x: 10, y: 40 })).toEqual({ ok: true, data: null });
    expect(showMenu).toHaveBeenCalledWith({ x: 10, y: 40 });
  });

  it.each([{ x: -1, y: 40 }, { x: 10.5, y: 40 }, { x: 10, y: 40, item: 'quit' }, undefined])(
    '잘못된 좌표 %o 면 INVALID_INPUT 이고 showMenu 를 부르지 않는다',
    (raw) => {
      const { handlers, showMenu } = setup();
      const result = handlers[IPC.app.showMenu](raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INVALID_INPUT');
      expect(showMenu).not.toHaveBeenCalled();
    },
  );
});
