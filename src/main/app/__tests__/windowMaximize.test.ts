import type { Rectangle } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import {
  createBoundsMaximizer,
  MAXIMIZE_MEASURE_LIMIT_MS,
  MAXIMIZE_POLL_MS,
  RESTORE_GUARD_MS,
  RESTORE_REAPPLY_LIMIT,
} from '../windowMaximize';

const NORMAL: Rectangle = { x: 320, y: 260, width: 1280, height: 800 };
/** 창 관리자가 정한 최대화 bounds — 모니터 작업 영역 (작업 표시줄 제외) */
const AREA: Rectangle = { x: 1920, y: 130, width: 1920, height: 1032 };
/** 디스플레이 workArea — 측정 실패 시 대체값 */
const WORK_AREA: Rectangle = { x: 1920, y: 130, width: 1920, height: 1080 };

/** 창·타이머 대역 — maximize 이벤트는 테스트가 보내고, 예약된 콜백은 runNext 로 하나씩 돌린다 */
function createFixture() {
  const state = { bounds: NORMAL, normalBounds: NORMAL, displayId: 1 };
  const listenerMap = new Map<string, () => void>();
  const window = {
    on: vi.fn((name: string, listener: () => void) => {
      listenerMap.set(name, listener);
      return window;
    }),
    getBounds: vi.fn(() => state.bounds),
    getNormalBounds: vi.fn(() => state.normalBounds),
    setBounds: vi.fn((bounds: Rectangle) => {
      state.bounds = bounds;
    }),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
  };
  const scheduledList: { callback: () => void; delayMs: number }[] = [];
  const onChange = vi.fn();
  const getWorkArea = vi.fn(() => WORK_AREA);
  const getDisplayId = vi.fn(() => state.displayId);
  const maximizer = createBoundsMaximizer(window as never, {
    onChange,
    getWorkArea,
    getDisplayId,
    schedule: (callback, delayMs) => void scheduledList.push({ callback, delayMs }),
  });
  /** 창 관리자가 최대화 이벤트를 보낸다 */
  const emitMaximize = () => listenerMap.get('maximize')?.();
  /** 창 관리자가 창을 bounds 로 옮기고 move 이벤트를 보낸다 (늦은 복원 흉내) */
  const moveByWindowManager = (bounds: Rectangle) => {
    state.bounds = bounds;
    listenerMap.get('move')?.();
  };
  /** 가장 먼저 예약된 콜백을 돌리고 그 지연을 돌려준다 */
  const runNext = () => {
    const next = scheduledList.shift();
    next?.callback();
    return next?.delayMs;
  };
  /** 창 관리자가 최대화를 끝낸 것처럼 bounds 를 바꾸고 이벤트 → 측정 → 지키는 시간 끝까지 돌린다 */
  const maximizeFully = () => {
    maximizer.toggle();
    state.bounds = AREA;
    emitMaximize();
    while (scheduledList.length > 0) runNext();
  };
  return {
    state,
    window,
    maximizer,
    onChange,
    getWorkArea,
    emitMaximize,
    moveByWindowManager,
    runNext,
    scheduledList,
    maximizeFully,
  };
}

describe('createBoundsMaximizer (spec 017)', () => {
  it('최대화가 아니면 toggle 은 창 관리자 maximize 를 1회 부른다', () => {
    const { window, maximizer } = createFixture();
    maximizer.toggle();
    expect(window.maximize).toHaveBeenCalledOnce();
  });

  it('maximize 이벤트 뒤 bounds 가 바뀌면 그 bounds 로 unmaximize → setBounds 한다', () => {
    const { state, window, maximizer, emitMaximize } = createFixture();
    maximizer.toggle();
    state.bounds = AREA;
    emitMaximize();
    expect(window.unmaximize).toHaveBeenCalledOnce();
    expect(window.setBounds).toHaveBeenLastCalledWith(AREA);
    expect(window.unmaximize.mock.invocationCallOrder[0]).toBeLessThan(
      window.setBounds.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('bounds 가 늦게 바뀌면 정한 간격으로 다시 읽어 바뀐 bounds 를 쓴다', () => {
    const { state, window, maximizer, emitMaximize, runNext } = createFixture();
    maximizer.toggle();
    emitMaximize();
    expect(window.setBounds).not.toHaveBeenCalled();
    state.bounds = AREA;
    expect(runNext()).toBe(MAXIMIZE_POLL_MS);
    expect(window.setBounds).toHaveBeenLastCalledWith(AREA);
  });

  it('측정 한도 동안 bounds 가 안 바뀌면 직전 bounds 가 걸친 디스플레이 workArea 를 쓴다', () => {
    const { window, maximizer, getWorkArea, emitMaximize, runNext, scheduledList } = createFixture();
    maximizer.toggle();
    emitMaximize();
    for (let elapsedMs = 0; elapsedMs < MAXIMIZE_MEASURE_LIMIT_MS; elapsedMs += MAXIMIZE_POLL_MS) runNext();
    expect(getWorkArea).toHaveBeenCalledWith(NORMAL);
    expect(window.setBounds).toHaveBeenLastCalledWith(WORK_AREA);
    expect(scheduledList.map(({ delayMs }) => delayMs)).toEqual([RESTORE_GUARD_MS]);
  });

  it('지키는 시간 안에 창 관리자가 예전 위치로 되돌리면 작업 영역을 다시 적용한다 (spec 018)', () => {
    const { state, window, maximizer, emitMaximize, moveByWindowManager } = createFixture();
    maximizer.toggle();
    state.bounds = AREA;
    emitMaximize();
    moveByWindowManager(NORMAL);
    expect(window.setBounds).toHaveBeenCalledTimes(2);
    expect(window.setBounds).toHaveBeenLastCalledWith(AREA);
  });

  it('창이 작업 영역 그대로인 move 에는 다시 적용하지 않는다', () => {
    const { state, window, maximizer, emitMaximize, moveByWindowManager } = createFixture();
    maximizer.toggle();
    state.bounds = AREA;
    emitMaximize();
    moveByWindowManager(AREA);
    expect(window.setBounds).toHaveBeenCalledOnce();
  });

  it('지키는 동안 다시 적용은 정한 횟수까지만 한다 — 창 관리자와 끝없이 핑퐁하지 않는다', () => {
    const { state, window, maximizer, emitMaximize, moveByWindowManager } = createFixture();
    maximizer.toggle();
    state.bounds = AREA;
    emitMaximize();
    for (let count = 0; count < RESTORE_REAPPLY_LIMIT + 2; count += 1) moveByWindowManager(NORMAL);
    expect(window.setBounds).toHaveBeenCalledTimes(1 + RESTORE_REAPPLY_LIMIT);
  });

  it('지키는 시간이 끝난 뒤의 move 에는 다시 적용하지 않는다', () => {
    const { state, window, maximizer, emitMaximize, moveByWindowManager, runNext } = createFixture();
    maximizer.toggle();
    state.bounds = AREA;
    emitMaximize();
    expect(runNext()).toBe(RESTORE_GUARD_MS);
    moveByWindowManager(NORMAL);
    expect(window.setBounds).toHaveBeenCalledOnce();
  });

  it('최대화를 풀면 지키던 작업 영역도 놓는다', () => {
    const { state, window, maximizer, emitMaximize, moveByWindowManager } = createFixture();
    maximizer.toggle();
    state.bounds = AREA;
    emitMaximize();
    maximizer.toggle();
    moveByWindowManager({ x: 0, y: 0, width: 900, height: 600 });
    expect(window.setBounds).toHaveBeenLastCalledWith(NORMAL);
  });

  it('최대화 상태 알림과 isMaximized 는 배치하자마자 바뀐다', () => {
    const { state, maximizer, onChange, emitMaximize } = createFixture();
    maximizer.toggle();
    state.bounds = AREA;
    emitMaximize();
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ isMaximized: true });
    expect(maximizer.isMaximized()).toBe(true);
  });

  it('측정 중에 온 maximize 이벤트·toggle 은 무시한다', () => {
    const { window, maximizer, emitMaximize } = createFixture();
    maximizer.toggle();
    emitMaximize();
    emitMaximize();
    maximizer.toggle();
    expect(window.maximize).toHaveBeenCalledOnce();
    expect(window.unmaximize).not.toHaveBeenCalled();
    expect(window.setBounds).not.toHaveBeenCalled();
  });

  it('최대화 상태에서 toggle 하면 직전 bounds 로 setBounds 하고 최대화를 푼다', () => {
    const { window, maximizer, onChange, maximizeFully } = createFixture();
    maximizeFully();
    maximizer.toggle();
    expect(window.setBounds).toHaveBeenLastCalledWith(NORMAL);
    expect(onChange).toHaveBeenLastCalledWith({ isMaximized: false });
    expect(maximizer.isMaximized()).toBe(false);
    expect(window.maximize).toHaveBeenCalledOnce();
  });

  it('toggle 없이 온 maximize 이벤트(OS 단축키)는 직전 bounds 를 getNormalBounds() 로 정한다', () => {
    const { state, window, maximizer, emitMaximize, runNext } = createFixture();
    state.normalBounds = { x: 10, y: 20, width: 1000, height: 700 };
    state.bounds = AREA;
    emitMaximize();
    runNext();
    maximizer.toggle();
    expect(window.setBounds).toHaveBeenLastCalledWith({ x: 10, y: 20, width: 1000, height: 700 });
  });

  it('최대화 중 maximize 이벤트가 다시 오면 다시 배치하고, 이어서 toggle 하면 처음 직전 bounds 로 돌아간다', () => {
    const { state, window, maximizer, emitMaximize, runNext, maximizeFully } = createFixture();
    maximizeFully();
    state.normalBounds = AREA;
    emitMaximize();
    expect(window.unmaximize).toHaveBeenCalledTimes(2);
    expect(window.setBounds).toHaveBeenLastCalledWith(AREA);
    runNext();
    maximizer.toggle();
    expect(window.setBounds).toHaveBeenLastCalledWith(NORMAL);
  });

  it('toggle 이 기억한 bounds 는 변환 시작에 비워져 다음 외부 maximize 는 getNormalBounds() 를 쓴다', () => {
    const { state, window, maximizer, emitMaximize, runNext, maximizeFully } = createFixture();
    maximizeFully();
    maximizer.toggle();
    state.normalBounds = { x: 5, y: 5, width: 900, height: 600 };
    state.bounds = AREA;
    emitMaximize();
    runNext();
    maximizer.toggle();
    expect(window.setBounds).toHaveBeenLastCalledWith({ x: 5, y: 5, width: 900, height: 600 });
  });

  it('release 는 setBounds 없이 최대화 상태만 풀고 알린다', () => {
    const { window, maximizer, onChange, maximizeFully } = createFixture();
    maximizeFully();
    const callCount = window.setBounds.mock.calls.length;
    maximizer.release();
    expect(window.setBounds).toHaveBeenCalledTimes(callCount);
    expect(onChange).toHaveBeenLastCalledWith({ isMaximized: false });
    expect(maximizer.isMaximized()).toBe(false);
  });

  it('getNormalBounds 는 최대화 중이면 직전 bounds, 아니면 지금 bounds 다', () => {
    const { maximizer, maximizeFully } = createFixture();
    expect(maximizer.getNormalBounds()).toEqual(NORMAL);
    maximizeFully();
    expect(maximizer.getNormalBounds()).toEqual(NORMAL);
    maximizer.toggle();
    expect(maximizer.getNormalBounds()).toEqual(NORMAL);
  });

  describe('모니터별 최대화 bounds 기억 (spec 018)', () => {
    it('측정으로 최대화했던 모니터에서 다시 toggle 하면 maximize 없이 바로 그 bounds 로 배치하고 최대화를 알린다', () => {
      const { window, maximizer, onChange, maximizeFully, scheduledList } = createFixture();
      maximizeFully();
      maximizer.toggle();
      onChange.mockClear();
      maximizer.toggle();
      expect(window.maximize).toHaveBeenCalledOnce();
      expect(window.setBounds).toHaveBeenLastCalledWith(AREA);
      expect(onChange).toHaveBeenCalledExactlyOnceWith({ isMaximized: true });
      expect(maximizer.isMaximized()).toBe(true);
      expect(scheduledList).toEqual([]);
    });

    it('기억값으로 최대화한 뒤 toggle 하면 직전 bounds 로 돌아간다', () => {
      const { window, maximizer, maximizeFully } = createFixture();
      maximizeFully();
      maximizer.toggle();
      maximizer.toggle();
      maximizer.toggle();
      expect(window.setBounds).toHaveBeenLastCalledWith(NORMAL);
      expect(maximizer.isMaximized()).toBe(false);
    });

    it('다른 모니터에 있으면 기억값을 쓰지 않고 다시 maximize 한다', () => {
      const { state, window, maximizer, maximizeFully } = createFixture();
      maximizeFully();
      maximizer.toggle();
      state.displayId = 2;
      maximizer.toggle();
      expect(window.maximize).toHaveBeenCalledTimes(2);
    });

    it('workArea 대체값은 기억하지 않아 다음 toggle 도 maximize 한다', () => {
      const { window, maximizer, emitMaximize, runNext, scheduledList } = createFixture();
      maximizer.toggle();
      emitMaximize();
      while (scheduledList.length > 0) runNext();
      maximizer.toggle();
      maximizer.toggle();
      expect(window.maximize).toHaveBeenCalledTimes(2);
    });

    it('외부 maximize 로 다시 재면 기억값이 새 측정값으로 바뀐다', () => {
      const { state, window, maximizer, emitMaximize, runNext, maximizeFully } = createFixture();
      maximizeFully();
      maximizer.toggle();
      const newArea = { x: 1920, y: 130, width: 1920, height: 1040 };
      state.bounds = newArea;
      emitMaximize();
      runNext();
      maximizer.toggle();
      maximizer.toggle();
      expect(window.setBounds).toHaveBeenLastCalledWith(newArea);
    });

    it('forgetAreas 뒤 toggle 은 다시 maximize 한다', () => {
      const { window, maximizer, maximizeFully } = createFixture();
      maximizeFully();
      maximizer.toggle();
      maximizer.forgetAreas();
      maximizer.toggle();
      expect(window.maximize).toHaveBeenCalledTimes(2);
    });
  });
});
