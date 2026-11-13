import type { Rectangle } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import {
  createBoundsMaximizer,
  MAXIMIZE_MEASURE_LIMIT_MS,
  MAXIMIZE_POLL_MS,
  RESTORE_SETTLE_MS,
} from '../windowMaximize';

const NORMAL: Rectangle = { x: 320, y: 260, width: 1280, height: 800 };
/** 창 관리자가 정한 최대화 bounds — 모니터 작업 영역 (작업 표시줄 제외) */
const AREA: Rectangle = { x: 1920, y: 130, width: 1920, height: 1032 };
/** 디스플레이 workArea — 측정 실패 시 대체값 */
const WORK_AREA: Rectangle = { x: 1920, y: 130, width: 1920, height: 1080 };

/** 창·타이머 대역 — maximize 이벤트는 테스트가 보내고, 예약된 콜백은 runNext 로 하나씩 돌린다 */
function createFixture() {
  const state = { bounds: NORMAL, normalBounds: NORMAL };
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
  const maximizer = createBoundsMaximizer(window as never, {
    onChange,
    getWorkArea,
    schedule: (callback, delayMs) => void scheduledList.push({ callback, delayMs }),
  });
  /** 창 관리자가 최대화 이벤트를 보낸다 */
  const emitMaximize = () => listenerMap.get('maximize')?.();
  /** 가장 먼저 예약된 콜백을 돌리고 그 지연을 돌려준다 */
  const runNext = () => {
    const next = scheduledList.shift();
    next?.callback();
    return next?.delayMs;
  };
  /** 창 관리자가 최대화를 끝낸 것처럼 bounds 를 바꾸고 이벤트 → 측정 → 늦은 복원 확인까지 돌린다 */
  const maximizeFully = () => {
    maximizer.toggle();
    state.bounds = AREA;
    emitMaximize();
    while (scheduledList.length > 0) runNext();
  };
  return { state, window, maximizer, onChange, getWorkArea, emitMaximize, runNext, scheduledList, maximizeFully };
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
    expect(scheduledList.map(({ delayMs }) => delayMs)).toEqual([RESTORE_SETTLE_MS]);
  });

  it('늦은 복원 확인 때 창이 예전 위치로 돌아가 있으면 작업 영역을 1회 다시 적용한다', () => {
    const { state, window, maximizer, emitMaximize, runNext } = createFixture();
    maximizer.toggle();
    state.bounds = AREA;
    emitMaximize();
    state.bounds = NORMAL;
    expect(runNext()).toBe(RESTORE_SETTLE_MS);
    expect(window.setBounds).toHaveBeenCalledTimes(2);
    expect(window.setBounds).toHaveBeenLastCalledWith(AREA);
  });

  it('늦은 복원 확인 때 창이 이미 작업 영역이면 다시 적용하지 않는다', () => {
    const { state, window, maximizer, emitMaximize, runNext } = createFixture();
    maximizer.toggle();
    state.bounds = AREA;
    emitMaximize();
    runNext();
    expect(window.setBounds).toHaveBeenCalledOnce();
  });

  it('최대화 상태 알림과 isMaximized 는 늦은 복원 확인이 끝난 뒤에야 바뀐다', () => {
    const { state, maximizer, onChange, emitMaximize, runNext } = createFixture();
    maximizer.toggle();
    state.bounds = AREA;
    emitMaximize();
    expect(onChange).not.toHaveBeenCalled();
    expect(maximizer.isMaximized()).toBe(false);
    runNext();
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ isMaximized: true });
    expect(maximizer.isMaximized()).toBe(true);
  });

  it('변환 중에 온 maximize 이벤트·toggle 은 무시한다', () => {
    const { state, window, maximizer, emitMaximize } = createFixture();
    maximizer.toggle();
    state.bounds = AREA;
    emitMaximize();
    emitMaximize();
    maximizer.toggle();
    expect(window.unmaximize).toHaveBeenCalledOnce();
    expect(window.maximize).toHaveBeenCalledOnce();
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
});
