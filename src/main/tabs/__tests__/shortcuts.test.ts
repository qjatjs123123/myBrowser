import { describe, expect, it, vi } from 'vitest';

import {
  attachShortcuts,
  createShortcutInputHandler,
  createShortcutRunner,
  toShortcutAction,
  type IShortcutInput,
  type IShortcutTabTarget,
} from '../shortcuts';

function key(partial: Partial<IShortcutInput> & { key: string }): IShortcutInput {
  return { type: 'keyDown', control: false, meta: false, alt: false, shift: false, ...partial };
}

describe('toShortcutAction', () => {
  it.each([
    [key({ key: 't', control: true }), 'newTab'],
    [key({ key: 'w', control: true }), 'closeTab'],
    [key({ key: 'l', control: true }), 'focusAddressBar'],
    [key({ key: 'R', control: true }), 'reload'],
    [key({ key: 'ArrowLeft', alt: true }), 'goBack'],
    [key({ key: 'ArrowRight', alt: true }), 'goForward'],
    [key({ key: 'Tab', control: true }), 'nextTab'],
    [key({ key: 'Tab', control: true, shift: true }), 'prevTab'],
  ])('linux 에서 %o 는 %s 이다', (input, action) => {
    expect(toShortcutAction(input, 'linux')).toBe(action);
  });

  it('darwin 에서는 Cmd+T 가 newTab 이다', () => {
    expect(toShortcutAction(key({ key: 't', meta: true }), 'darwin')).toBe('newTab');
  });

  it('darwin 에서는 Ctrl+T 가 단축키가 아니다', () => {
    expect(toShortcutAction(key({ key: 't', control: true }), 'darwin')).toBeNull();
  });

  it('keyUp 은 무시한다', () => {
    expect(toShortcutAction(key({ key: 't', control: true, type: 'keyUp' }), 'linux')).toBeNull();
  });

  it('수식키 없는 일반 키는 null 이다', () => {
    expect(toShortcutAction(key({ key: 't' }), 'linux')).toBeNull();
  });

  it('Ctrl+Alt+T 처럼 추가 수식키가 섞이면 null 이다', () => {
    expect(toShortcutAction(key({ key: 't', control: true, alt: true }), 'linux')).toBeNull();
  });

  it('Ctrl+Shift+T 는 null 이다 (Shift 는 Tab 에만)', () => {
    expect(toShortcutAction(key({ key: 'T', control: true, shift: true }), 'linux')).toBeNull();
  });
});

function setupRunner(activeTabId: string | null = 'tab-1') {
  const tabManager: IShortcutTabTarget = {
    createTab: vi.fn(() => 'tab-2'),
    closeTab: vi.fn(),
    cycleTab: vi.fn(),
    reload: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    getActiveTabId: vi.fn(() => activeTabId),
  };
  const emitShortcut = vi.fn();
  const focusChrome = vi.fn();
  const runner = createShortcutRunner({ tabManager, emitShortcut, focusChrome });
  return { runner, tabManager, emitShortcut, focusChrome };
}

describe('createShortcutRunner', () => {
  it('newTab 은 새 탭을 만들고 크롬에 포커스한 뒤 focusNewTabSearch 를 보낸다', () => {
    const { runner, tabManager, emitShortcut, focusChrome } = setupRunner();
    runner('newTab');
    expect(tabManager.createTab).toHaveBeenCalledWith();
    expect(focusChrome).toHaveBeenCalledTimes(1);
    expect(emitShortcut).toHaveBeenCalledWith('focusNewTabSearch');
  });

  it('focusAddressBar 는 크롬에 포커스하고 focusAddressBar 를 보낸다', () => {
    const { runner, emitShortcut, focusChrome } = setupRunner();
    runner('focusAddressBar');
    expect(focusChrome).toHaveBeenCalledTimes(1);
    expect(emitShortcut).toHaveBeenCalledWith('focusAddressBar');
  });

  it.each([
    ['closeTab', 'closeTab'],
    ['reload', 'reload'],
    ['goBack', 'goBack'],
    ['goForward', 'goForward'],
  ] as const)('%s 는 활성 탭 id 로 %s 를 부른다', (action, method) => {
    const { runner, tabManager } = setupRunner();
    runner(action);
    expect(tabManager[method]).toHaveBeenCalledWith('tab-1');
  });

  it('nextTab·prevTab 은 cycleTab(+1/-1) 을 부른다', () => {
    const { runner, tabManager } = setupRunner();
    runner('nextTab');
    runner('prevTab');
    expect(vi.mocked(tabManager.cycleTab).mock.calls).toEqual([[1], [-1]]);
  });

  it('활성 탭이 없으면 탭 대상 동작은 아무 것도 하지 않는다', () => {
    const { runner, tabManager } = setupRunner(null);
    runner('closeTab');
    expect(tabManager.closeTab).not.toHaveBeenCalled();
  });
});

describe('createShortcutInputHandler', () => {
  it('단축키면 preventDefault 후 runner 를 부른다', () => {
    const runner = vi.fn();
    const event = { preventDefault: vi.fn() };
    createShortcutInputHandler(runner, 'linux')(event, key({ key: 'w', control: true }));
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith('closeTab');
  });

  it('단축키가 아니면 preventDefault 도 runner 도 부르지 않는다', () => {
    const runner = vi.fn();
    const event = { preventDefault: vi.fn() };
    createShortcutInputHandler(runner, 'linux')(event, key({ key: 'c', control: true }));
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
  });
});

describe('attachShortcuts', () => {
  it('before-input-event 에 단축키 핸들러를 붙인다', () => {
    const on = vi.fn();
    const runner = vi.fn();
    attachShortcuts({ on }, runner, 'linux');
    expect(on).toHaveBeenCalledWith('before-input-event', expect.any(Function));
    const listener = on.mock.calls[0]?.[1] as ReturnType<typeof createShortcutInputHandler>;
    listener({ preventDefault: vi.fn() }, key({ key: 'Tab', control: true }));
    expect(runner).toHaveBeenCalledWith('nextTab');
  });
});
