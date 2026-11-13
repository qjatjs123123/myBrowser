import type { Rectangle } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import {
  computeMovedBounds,
  computeResizedBounds,
  computeRestoredBounds,
  createWindowPointerSession,
  type TWindowEdge,
} from '../windowPointer';

const MIN_SIZE = { width: 900, height: 600 };
const ORIGIN: Rectangle = { x: 100, y: 50, width: 1280, height: 800 };
const START = { x: 500, y: 60 };

describe('computeMovedBounds (spec 016 FR-1)', () => {
  it('크기는 그대로, 위치만 커서가 움직인 만큼 옮긴다', () => {
    expect(computeMovedBounds(ORIGIN, START, { x: 530, y: 40 })).toEqual({ x: 130, y: 30, width: 1280, height: 800 });
  });
});

describe('computeResizedBounds (spec 016 FR-4)', () => {
  const current = { x: START.x + 20, y: START.y + 10 };

  it.each<[TWindowEdge, Rectangle]>([
    ['e', { x: 100, y: 50, width: 1300, height: 800 }],
    ['w', { x: 120, y: 50, width: 1260, height: 800 }],
    ['s', { x: 100, y: 50, width: 1280, height: 810 }],
    ['n', { x: 100, y: 60, width: 1280, height: 790 }],
    ['se', { x: 100, y: 50, width: 1300, height: 810 }],
    ['sw', { x: 120, y: 50, width: 1260, height: 810 }],
    ['ne', { x: 100, y: 60, width: 1300, height: 790 }],
    ['nw', { x: 120, y: 60, width: 1260, height: 790 }],
  ])('%s 방향으로 끌면 그 변·모서리만 움직인다', (edge, expected) => {
    expect(computeResizedBounds(ORIGIN, edge, START, current, MIN_SIZE)).toEqual(expected);
  });

  it('e·s 는 최소 크기에서 멈춘다', () => {
    const far = { x: START.x - 2000, y: START.y - 2000 };
    expect(computeResizedBounds(ORIGIN, 'se', START, far, MIN_SIZE)).toEqual({
      x: 100,
      y: 50,
      width: 900,
      height: 600,
    });
  });

  it('w·n 은 최소 크기에서 오른쪽·아래 변을 고정한다', () => {
    const far = { x: START.x + 2000, y: START.y + 2000 };
    expect(computeResizedBounds(ORIGIN, 'nw', START, far, MIN_SIZE)).toEqual({
      x: 100 + 1280 - 900,
      y: 50 + 800 - 600,
      width: 900,
      height: 600,
    });
  });
});

describe('computeRestoredBounds (spec 016 FR-3)', () => {
  it('커서의 가로 비율과 위쪽에서의 세로 거리를 유지한 원래 크기 bounds', () => {
    const maximized = { x: 0, y: 0, width: 1920, height: 1080 };
    const normal = { x: 200, y: 200, width: 1280, height: 800 };
    expect(computeRestoredBounds(maximized, normal, { x: 960, y: 10 })).toEqual({
      x: 320,
      y: 0,
      width: 1280,
      height: 800,
    });
  });
});

/** 창·최대화 상태 대역 — 현재 bounds 를 들고 setBounds 를 기록한다. 최대화 중이면 직전 bounds 는 ORIGIN */
function createFakeWindow({ isMaximized = false } = {}) {
  const state = { isMaximized, bounds: isMaximized ? { x: 0, y: 0, width: 1920, height: 1080 } : ORIGIN };
  const window = {
    getBounds: vi.fn(() => state.bounds),
    setBounds: vi.fn((bounds: Rectangle) => {
      state.bounds = bounds;
    }),
  };
  const frame = {
    isMaximized: vi.fn(() => state.isMaximized),
    getNormalBounds: vi.fn(() => ORIGIN),
    release: vi.fn(() => {
      state.isMaximized = false;
    }),
  };
  /** 세션을 바로 만든다 */
  const createSession = () => createWindowPointerSession(window, frame, MIN_SIZE);
  return { window, frame, createSession };
}

describe('createWindowPointerSession', () => {
  it('시작 없이 온 move·end 는 아무것도 하지 않는다', () => {
    const { window, createSession } = createFakeWindow();
    const session = createSession();
    session.move({ screenX: 10, screenY: 10 });
    session.end();
    expect(window.setBounds).not.toHaveBeenCalled();
  });

  it('move 로 시작하면 끄는 만큼 창을 옮기고, end 뒤 move 는 무시한다', () => {
    const { window, createSession } = createFakeWindow();
    const session = createSession();
    session.start({ kind: 'move', screenX: 500, screenY: 60 });
    session.move({ screenX: 510, screenY: 70 });
    session.end();
    session.move({ screenX: 900, screenY: 900 });
    expect(window.setBounds).toHaveBeenCalledOnce();
    expect(window.setBounds).toHaveBeenCalledWith({ x: 110, y: 60, width: 1280, height: 800 });
  });

  it('변으로 시작하면 크기를 바꾼다', () => {
    const { window, createSession } = createFakeWindow();
    const session = createSession();
    session.start({ kind: 'se', screenX: 0, screenY: 0 });
    session.move({ screenX: 40, screenY: 30 });
    expect(window.setBounds).toHaveBeenCalledWith({ x: 100, y: 50, width: 1320, height: 830 });
  });

  it('최대화 중 move 로 시작하면 최대화 상태를 1회 풀고 복원 bounds 에서 이어 옮긴다 (spec 017 FR-5)', () => {
    const { window, frame, createSession } = createFakeWindow({ isMaximized: true });
    const session = createSession();
    session.start({ kind: 'move', screenX: 960, screenY: 10 });
    expect(frame.release).toHaveBeenCalledOnce();
    expect(window.setBounds).toHaveBeenLastCalledWith({ x: 320, y: 0, width: 1280, height: 800 });
    session.move({ screenX: 970, screenY: 20 });
    expect(window.setBounds).toHaveBeenLastCalledWith({ x: 330, y: 10, width: 1280, height: 800 });
  });

  it('최대화 중 변으로 시작하면 무시한다', () => {
    const { window, frame, createSession } = createFakeWindow({ isMaximized: true });
    const session = createSession();
    session.start({ kind: 'e', screenX: 0, screenY: 0 });
    session.move({ screenX: 50, screenY: 0 });
    expect(frame.release).not.toHaveBeenCalled();
    expect(window.setBounds).not.toHaveBeenCalled();
  });

  it('다시 start 하면 새 시작 bounds·지점에서 계산한다', () => {
    const { window, createSession } = createFakeWindow();
    const session = createSession();
    session.start({ kind: 'move', screenX: 0, screenY: 0 });
    session.start({ kind: 'e', screenX: 100, screenY: 100 });
    session.move({ screenX: 110, screenY: 100 });
    expect(window.setBounds).toHaveBeenCalledWith({ x: 100, y: 50, width: 1290, height: 800 });
  });
});
