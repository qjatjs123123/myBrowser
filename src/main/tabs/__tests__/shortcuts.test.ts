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
    [key({ key: 'f', control: true }), 'openFindBar'],
    [key({ key: 'd', control: true }), 'toggleBookmark'],
    [key({ key: 'h', control: true }), 'openHistory'],
    [key({ key: '=', control: true }), 'zoomIn'],
    [key({ key: '+', control: true, shift: true }), 'zoomIn'],
    [key({ key: '-', control: true }), 'zoomOut'],
    [key({ key: '0', control: true }), 'zoomReset'],
  ])('linux 에서 %o 는 %s 이다', (input, action) => {
    expect(toShortcutAction(input, 'linux')).toBe(action);
  });

  it('darwin 에서는 Cmd+T 가 newTab 이다', () => {
    expect(toShortcutAction(key({ key: 't', meta: true }), 'darwin')).toBe('newTab');
  });

  it('darwin 에서는 Ctrl+T 가 단축키가 아니다', () => {
    expect(toShortcutAction(key({ key: 't', control: true }), 'darwin')).toBeNull();
  });

  it('darwin 에서 Cmd+H 는 단축키가 아니다 (OS 숨기기)', () => {
    expect(toShortcutAction(key({ key: 'h', meta: true }), 'darwin')).toBeNull();
  });

  it('darwin 에서 Cmd+Shift+H 는 openHistory 다', () => {
    expect(toShortcutAction(key({ key: 'H', meta: true, shift: true }), 'darwin')).toBe('openHistory');
  });

  it('darwin 에서 Cmd+F 는 openFindBar 다', () => {
    expect(toShortcutAction(key({ key: 'f', meta: true }), 'darwin')).toBe('openFindBar');
  });

  it('linux 에서 Ctrl+Shift+H 는 단축키가 아니다', () => {
    expect(toShortcutAction(key({ key: 'H', control: true, shift: true }), 'linux')).toBeNull();
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

  it('Ctrl+Shift+A 는 toggleSidebar 이다', () => {
    expect(toShortcutAction(key({ key: 'A', control: true, shift: true }), 'linux')).toBe('toggleSidebar');
  });

  it('darwin 에서는 Cmd+Shift+A 가 toggleSidebar 이다', () => {
    expect(toShortcutAction(key({ key: 'a', meta: true, shift: true }), 'darwin')).toBe('toggleSidebar');
  });

  it('Shift 없는 Ctrl+A 는 단축키가 아니다 (페이지 전체 선택 유지)', () => {
    expect(toShortcutAction(key({ key: 'a', control: true }), 'linux')).toBeNull();
  });

  it.each(['t', 'l', 'w', 'r', 'b'])('Ctrl+Shift+%s 처럼 다른 키는 null 이다', (k) => {
    expect(toShortcutAction(key({ key: k, control: true, shift: true }), 'linux')).toBeNull();
  });
});

function setupRunner(activeTabId: string | null = 'tab-1') {
  const tabManager: IShortcutTabTarget = {
    createTab: vi.fn(() => 'tab-2'),
    openHistoryPage: vi.fn(() => 'tab-3'),
    closeTab: vi.fn(),
    cycleTab: vi.fn(),
    reload: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    zoom: vi.fn(),
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

  it('toggleSidebar 는 toggleSidebar 만 보내고 탭·크롬 포커스는 건드리지 않는다', () => {
    const { runner, tabManager, emitShortcut, focusChrome } = setupRunner();
    runner('toggleSidebar');
    expect(emitShortcut.mock.calls).toEqual([['toggleSidebar']]);
    expect(focusChrome).not.toHaveBeenCalled();
    expect(Object.values(tabManager).filter((fn) => vi.mocked(fn).mock.calls.length > 0)).toEqual([]);
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

describe('createShortcutRunner 찾기·북마크·기록·확대 (spec 021)', () => {
  it('openFindBar 는 크롬에 포커스하고 openFindBar 를 보낸다', () => {
    const { runner, emitShortcut, focusChrome } = setupRunner();
    runner('openFindBar');
    expect(focusChrome).toHaveBeenCalled();
    expect(emitShortcut).toHaveBeenCalledWith('openFindBar');
  });

  it('toggleBookmark 는 포커스를 옮기지 않고 toggleBookmark 를 보낸다', () => {
    const { runner, emitShortcut, focusChrome } = setupRunner();
    runner('toggleBookmark');
    expect(focusChrome).not.toHaveBeenCalled();
    expect(emitShortcut).toHaveBeenCalledWith('toggleBookmark');
  });

  it('openHistory 는 방문 기록 페이지 탭을 열고 기록 검색 포커스를 보낸다 (spec 023)', () => {
    const { runner, tabManager, emitShortcut, focusChrome } = setupRunner();
    runner('openHistory');
    expect(tabManager.openHistoryPage).toHaveBeenCalledWith();
    expect(tabManager.createTab).not.toHaveBeenCalled();
    expect(focusChrome).toHaveBeenCalled();
    expect(emitShortcut).toHaveBeenCalledWith('focusHistorySearch');
  });

  it.each([
    ['zoomIn', 'in'],
    ['zoomOut', 'out'],
    ['zoomReset', 'reset'],
  ] as const)('%s 는 활성 탭을 %s 방향으로 확대/축소한다', (action, direction) => {
    const { runner, tabManager } = setupRunner();
    runner(action);
    expect(tabManager.zoom).toHaveBeenCalledWith('tab-1', direction);
  });

  it('활성 탭이 없으면 zoomIn 은 아무것도 하지 않는다', () => {
    const { runner, tabManager } = setupRunner(null);
    runner('zoomIn');
    expect(tabManager.zoom).not.toHaveBeenCalled();
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
