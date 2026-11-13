import { describe, expect, it, vi } from 'vitest';

import {
  createNativeFrame,
  createWindowControls,
  createWindowOptions,
  hasRoundedCorners,
  watchFullScreen,
  watchMaximizeEvents,
} from '../window';

/** 창 대역 — isMaximized 값만 정한다 */
function createFakeWindow(isMaximized: boolean) {
  return {
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    isMaximized: vi.fn(() => isMaximized),
    close: vi.fn(),
  };
}

describe('createWindowOptions', () => {
  it.each(['linux', 'win32', 'darwin'] as const)(
    '%s 에서도 보안 기본값 — contextIsolation·sandbox 켜짐, nodeIntegration 꺼짐',
    (platform) => {
      const { webPreferences } = createWindowOptions('/app/preload.js', platform);
      expect(webPreferences).toMatchObject({
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        preload: '/app/preload.js',
      });
    },
  );

  it('창은 준비될 때까지 숨겨 둔다', () => {
    expect(createWindowOptions('/p', 'linux').show).toBe(false);
  });

  it.each(['linux', 'win32'] as const)('%s 는 OS 프레임 없이 뜬다 (spec 010)', (platform) => {
    expect(createWindowOptions('/p', platform).frame).toBe(false);
  });

  it('linux 는 투명 창으로 뜬다 — renderer 가 둥근 모서리를 그린다 (spec 014)', () => {
    const options = createWindowOptions('/p', 'linux');
    expect(options.transparent).toBe(true);
    expect(options.backgroundColor).toBe('#00000000');
  });

  it.each(['win32', 'darwin'] as const)('%s 는 투명 창이 아니다 — OS 가 모서리를 그린다', (platform) => {
    const options = createWindowOptions('/p', platform);
    expect(options).not.toHaveProperty('transparent');
    expect(options).not.toHaveProperty('backgroundColor');
  });

  it('macOS 는 제목 표시줄만 숨기고 네이티브 신호등을 탭 줄에 맞춘다', () => {
    const options = createWindowOptions('/p', 'darwin');
    expect(options.titleBarStyle).toBe('hiddenInset');
    expect(options.trafficLightPosition).toEqual({ x: 14, y: 12 });
    expect(options).not.toHaveProperty('frame');
  });
});

describe('createWindowControls (spec 010)', () => {
  it('최대화 상태가 아니면 toggleMaximize 는 maximize 를 1회 부른다', () => {
    const window = createFakeWindow(false);
    createWindowControls(window).toggleMaximize();
    expect(window.maximize).toHaveBeenCalledOnce();
    expect(window.unmaximize).not.toHaveBeenCalled();
  });

  it('최대화 상태면 toggleMaximize 는 unmaximize 를 1회 부른다', () => {
    const window = createFakeWindow(true);
    createWindowControls(window).toggleMaximize();
    expect(window.unmaximize).toHaveBeenCalledOnce();
    expect(window.maximize).not.toHaveBeenCalled();
  });

  it('minimize·close 는 같은 이름의 창 메서드를 부른다', () => {
    const window = createFakeWindow(false);
    const controls = createWindowControls(window);
    controls.minimize();
    controls.close();
    expect(window.minimize).toHaveBeenCalledOnce();
    expect(window.close).toHaveBeenCalledOnce();
  });

  it('창 메서드는 부를 때 찾는다 — 나중에 바꾼 메서드가 불린다', () => {
    const window = createFakeWindow(false);
    const controls = createWindowControls(window);
    const replaced = vi.fn();
    window.minimize = replaced;
    controls.minimize();
    expect(replaced).toHaveBeenCalledOnce();
  });
});

describe('hasRoundedCorners (spec 014)', () => {
  it('linux 만 앱이 모서리를 그린다', () => {
    expect(hasRoundedCorners('linux')).toBe(true);
    expect(hasRoundedCorners('win32')).toBe(false);
    expect(hasRoundedCorners('darwin')).toBe(false);
  });
});

/** on 으로 붙은 리스너를 이벤트 이름으로 부를 수 있는 창 대역 */
function createWatchedWindow() {
  const listenerMap = new Map<string, () => void>();
  const window = {
    on: vi.fn((name: string, listener: () => void) => {
      listenerMap.set(name, listener);
      return window;
    }),
  };
  const emit = (name: string) => listenerMap.get(name)?.();
  return { window: window as never, emit, onChange: vi.fn() };
}

describe('watchMaximizeEvents (spec 014)', () => {
  it.each([
    ['maximize', true],
    ['unmaximize', false],
  ] as const)('%s 이면 isMaximized %s', (eventName, expected) => {
    const { window, emit, onChange } = createWatchedWindow();
    watchMaximizeEvents(window, onChange);
    emit(eventName);
    expect(onChange).toHaveBeenLastCalledWith({ isMaximized: expected });
  });
});

describe('watchFullScreen (spec 014·017)', () => {
  it('전체 화면이 되면 isMaximized true', () => {
    const { window, emit, onChange } = createWatchedWindow();
    watchFullScreen(window, onChange, () => false);
    emit('enter-full-screen');
    expect(onChange).toHaveBeenLastCalledWith({ isMaximized: true });
  });

  it.each([true, false])('전체 화면을 풀 때 isMaximized() 가 %s 면 그 값을 알린다', (isMaximized) => {
    const { window, emit, onChange } = createWatchedWindow();
    watchFullScreen(window, onChange, () => isMaximized);
    emit('leave-full-screen');
    expect(onChange).toHaveBeenLastCalledWith({ isMaximized });
  });
});

describe('createNativeFrame (spec 017)', () => {
  it('최대화 여부·직전 bounds 는 창에서 읽고, release 는 unmaximize 를 부른다', () => {
    const normal = { x: 1, y: 2, width: 3, height: 4 };
    const window = { isMaximized: vi.fn(() => true), getNormalBounds: vi.fn(() => normal), unmaximize: vi.fn() };
    const frame = createNativeFrame(window as never);
    expect(frame.isMaximized()).toBe(true);
    expect(frame.getNormalBounds()).toBe(normal);
    frame.release();
    expect(window.unmaximize).toHaveBeenCalledOnce();
  });
});
