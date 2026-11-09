import type { BrowserWindow, Rectangle } from 'electron';

import type { TWindowPointerKind, TWindowPointerPoint, TWindowPointerStartRequest } from '@shared/ipc/window';

/** 창 크기 (DIP) */
export interface ISize {
  width: number;
  height: number;
}

/** 화면 점 (DIP) */
export interface IPoint {
  x: number;
  y: number;
}

/** 크기 조절 방향 — move 를 뺀 변·모서리 */
export type TWindowEdge = Exclude<TWindowPointerKind, 'move'>;

/** 창 이동·크기 조절에 쓰는 창 메서드 — 부를 때마다 창에서 찾는다(e2e 가 인스턴스에 대역을 심는다) */
export type TPointerWindow = Pick<
  BrowserWindow,
  'getBounds' | 'setBounds' | 'isMaximized' | 'unmaximize' | 'getNormalBounds' | 'once'
>;

/** window:pointer* 핸들러가 부르는 세션 */
export interface IWindowPointerSession {
  start: (request: TWindowPointerStartRequest) => void;
  move: (point: TWindowPointerPoint) => void;
  end: () => void;
}

/** [이동] 시작 크기는 그대로, 위치만 커서가 움직인 만큼 옮긴다 (spec 016 FR-1) */
export function computeMovedBounds(origin: Rectangle, start: IPoint, current: IPoint): Rectangle {
  return { ...origin, x: origin.x + current.x - start.x, y: origin.y + current.y - start.y };
}

/**
 * [크기 조절] 끄는 변·모서리 쪽으로 크기를 바꾼다 — 최소 크기로 자르고, 왼쪽(w)·위쪽(n) 을 줄일 때는 반대쪽 변을 고정한다 (spec 016 FR-4)
 */
export function computeResizedBounds(
  origin: Rectangle,
  edge: TWindowEdge,
  start: IPoint,
  current: IPoint,
  minSize: ISize,
): Rectangle {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const horizontal = resizeAxis(origin.x, origin.width, dx, minSize.width, edge.includes('w'), edge.includes('e'));
  const vertical = resizeAxis(origin.y, origin.height, dy, minSize.height, edge.includes('n'), edge.includes('s'));
  return { x: horizontal.start, y: vertical.start, width: horizontal.length, height: vertical.length };
}

/** 한 축의 시작 위치·길이 — isStartEdge 면 시작 변을, isEndEdge 면 끝 변을 delta 만큼 옮긴다 */
function resizeAxis(
  start: number,
  length: number,
  delta: number,
  minLength: number,
  isStartEdge: boolean,
  isEndEdge: boolean,
): { start: number; length: number } {
  if (isStartEdge) {
    const nextLength = Math.max(minLength, length - delta);
    return { start: start + length - nextLength, length: nextLength };
  }
  if (isEndEdge) return { start, length: Math.max(minLength, length + delta) };
  return { start, length };
}

/**
 * [최대화 중 끌기] 원래 크기로 돌아올 bounds — 커서의 가로 위치 비율과 위쪽에서의 세로 거리를 유지한다 (spec 016 FR-3)
 */
export function computeRestoredBounds(maximized: Rectangle, normal: Rectangle, cursor: IPoint): Rectangle {
  const ratio = maximized.width > 0 ? (cursor.x - maximized.x) / maximized.width : 0;
  return {
    x: Math.round(cursor.x - ratio * normal.width),
    y: maximized.y,
    width: normal.width,
    height: normal.height,
  };
}

interface IActivePointer {
  kind: TWindowPointerKind;
  origin: Rectangle;
  start: IPoint;
  /** 최대화에서 끌어 내린 이동인가 — 창 관리자의 늦은 복원 뒤 다시 적용한다 */
  isRestoredDrag: boolean;
}

/**
 * 최대화 해제는 창 관리자가 늦게(WSLg 실측: unmaximize 이벤트 ~80ms 뒤) 끝내며 창을 예전 위치로 되돌린다.
 * 최대화에서 끌어 내린 이동은 unmaximize 이벤트 뒤 이 시간이 지나면 마지막으로 옮긴 bounds 를 한 번 더 적용한다 (spec 016 FR-3).
 * 매 move 이벤트마다 되돌리면 setBounds 가 다시 move 를 낳아 창 관리자와 핑퐁한다 — 한 번만.
 */
export const RESTORE_SETTLE_MS = 200;

/** 테스트가 타이머를 주입한다 */
interface IPointerSessionOptions {
  schedule?: (callback: () => void, delayMs: number) => void;
}

/**
 * [창 포인터 세션] Linux 에서 renderer 포인터로 창을 옮기고 크기를 바꾼다 (spec 016).
 * 진행 중인 조작 없이 온 move·end 는 무시하고, start 가 다시 오면 이전 조작을 버린다.
 */
export function createWindowPointerSession(
  window: TPointerWindow,
  minSize: ISize,
  { schedule = (callback, delayMs) => void setTimeout(callback, delayMs) }: IPointerSessionOptions = {},
): IWindowPointerSession {
  let active: IActivePointer | null = null;
  /** 마지막으로 적용한 bounds — 늦은 복원 뒤 다시 적용한다 */
  let lastBounds: Rectangle | null = null;
  const reapplyAfterRestore = () =>
    window.once('unmaximize', () =>
      schedule(() => {
        if (lastBounds && !isSameBounds(window.getBounds(), lastBounds)) window.setBounds(lastBounds);
      }, RESTORE_SETTLE_MS),
    );
  return {
    start: (request) => {
      active = beginPointer(window, request);
      lastBounds = active?.origin ?? null;
      if (active?.isRestoredDrag) reapplyAfterRestore();
    },
    move: (point) => {
      if (!active) return;
      lastBounds = computePointerBounds(active, toPoint(point), minSize);
      window.setBounds(lastBounds);
    },
    end: () => {
      active = null;
    },
  };
}

/** 진행 중인 조작의 다음 bounds */
function computePointerBounds(active: IActivePointer, current: IPoint, minSize: ISize): Rectangle {
  if (active.kind === 'move') return computeMovedBounds(active.origin, active.start, current);
  return computeResizedBounds(active.origin, active.kind, active.start, current, minSize);
}

/** 조작 시작 — 최대화 중 이동이면 원래 크기로 돌려 놓고, 최대화 중 크기 조절은 하지 않는다 */
function beginPointer(window: TPointerWindow, request: TWindowPointerStartRequest): IActivePointer | null {
  const start = toPoint(request);
  if (!window.isMaximized()) return { kind: request.kind, origin: window.getBounds(), start, isRestoredDrag: false };
  if (request.kind !== 'move') return null;
  const restored = computeRestoredBounds(window.getBounds(), window.getNormalBounds(), start);
  window.unmaximize();
  window.setBounds(restored);
  return { kind: 'move', origin: restored, start, isRestoredDrag: true };
}

function isSameBounds(a: Rectangle, b: Rectangle): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function toPoint(point: TWindowPointerPoint): IPoint {
  return { x: point.screenX, y: point.screenY };
}
