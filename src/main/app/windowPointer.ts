import type { BrowserWindow, Rectangle } from 'electron';

import type { TWindowPointerKind, TWindowPointerPoint, TWindowPointerStartRequest } from '@shared/ipc/window';

import type { IBoundsMaximizer } from './windowMaximize';

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
export type TPointerWindow = Pick<BrowserWindow, 'getBounds' | 'setBounds'>;

/** 최대화 상태 — Linux 는 앱 최대화기(spec 017), 그 외는 창 관리자 최대화(createNativeFrame) */
export type TPointerFrame = Pick<IBoundsMaximizer, 'isMaximized' | 'getNormalBounds' | 'release'>;

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
}

/**
 * [창 포인터 세션] Linux 에서 renderer 포인터로 창을 옮기고 크기를 바꾼다 (spec 016).
 * 진행 중인 조작 없이 온 move·end 는 무시하고, start 가 다시 오면 이전 조작을 버린다.
 */
export function createWindowPointerSession(
  window: TPointerWindow,
  frame: TPointerFrame,
  minSize: ISize,
): IWindowPointerSession {
  let active: IActivePointer | null = null;
  return {
    start: (request) => {
      active = beginPointer(window, frame, request);
    },
    move: (point) => {
      if (!active) return;
      window.setBounds(computePointerBounds(active, toPoint(point), minSize));
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

/** 조작 시작 — 최대화 중 이동이면 원래 크기로 돌려 놓고(spec 016 FR-3), 최대화 중 크기 조절은 하지 않는다 */
function beginPointer(
  window: TPointerWindow,
  frame: TPointerFrame,
  request: TWindowPointerStartRequest,
): IActivePointer | null {
  const start = toPoint(request);
  if (!frame.isMaximized()) return { kind: request.kind, origin: window.getBounds(), start };
  if (request.kind !== 'move') return null;
  const restored = computeRestoredBounds(window.getBounds(), frame.getNormalBounds(), start);
  frame.release();
  window.setBounds(restored);
  return { kind: 'move', origin: restored, start };
}

function toPoint(point: TWindowPointerPoint): IPoint {
  return { x: point.screenX, y: point.screenY };
}
