import type { PointerEvent as ReactPointerEvent } from 'react';

import type { TIpcResult } from '@shared/ipc/result';
import type { TWindowPointerKind, TWindowPointerPoint } from '@shared/ipc/window';

import { getApi } from '@/lib/api';
import { callSafely } from '@/lib/callSafely';

const WINDOW_FAILED_MESSAGE = '창을 조작하지 못했습니다';
/** 이 거리(px)를 넘게 끌어야 창 이동을 시작한다 — 그 전에 놓으면 클릭·더블클릭으로 남는다 */
export const WINDOW_DRAG_THRESHOLD = 3;

interface IUseWindowPointerOptions {
  /** IPC 실패 메시지 — 같은 끌기에서 1회만. toast 는 부르는 쪽이 띄운다 */
  onError: (message: string) => void;
}

/**
 * [창 끌기] Linux 에서 탭 줄 끌기·가장자리 끌기를 window:pointer* 로 main 에 보낸다 (spec 016).
 * 이동은 3px 를 넘어야 시작하고, 크기 조절은 누르자마자 시작한다. 끄는 중 move 는 한 프레임에 1회.
 */
export function useWindowPointer({ onError }: IUseWindowPointerOptions) {
  return {
    handlePointerDown: (kind: TWindowPointerKind, event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      capturePointer(event);
      startPointerDrag(kind, toPoint(event), onError);
    },
  };
}

/** 창 밖으로 나가도 move·up 을 받도록 포인터를 잡는다 (jsdom 에는 없을 수 있다) */
function capturePointer(event: ReactPointerEvent<HTMLElement>): void {
  const target = event.currentTarget;
  if (typeof target.setPointerCapture === 'function') target.setPointerCapture(event.pointerId);
}

/** 한 번의 끌기 — 임계·rAF 묶기·끝내기를 window 리스너로 처리하고 놓으면 리스너를 지운다 */
function startPointerDrag(kind: TWindowPointerKind, origin: TWindowPointerPoint, onError: (message: string) => void) {
  const drag = createDragState(onError);
  if (kind !== 'move') drag.begin(kind, origin);
  const handleMove = (event: PointerEvent) => {
    const point = toPoint(event);
    if (!drag.isStarted && isBeyondThreshold(origin, point)) drag.begin(kind, origin);
    if (drag.isStarted) drag.queueMove(point);
  };
  const handleUp = () => {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
    window.removeEventListener('pointercancel', handleUp);
    drag.finish();
  };
  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp);
  window.addEventListener('pointercancel', handleUp);
}

/** 끌기 상태 — 시작 여부, 다음 프레임에 보낼 좌표, 실패 알림 1회 */
function createDragState(onError: (message: string) => void) {
  const report = createErrorReporter(onError);
  let pendingPoint: TWindowPointerPoint | null = null;
  let frameId: number | null = null;
  const flush = () => {
    frameId = null;
    if (pendingPoint) {
      const point = pendingPoint;
      report(() => getApi().window.pointerMove(point));
    }
    pendingPoint = null;
  };
  return {
    isStarted: false,
    begin(kind: TWindowPointerKind, point: TWindowPointerPoint) {
      this.isStarted = true;
      report(() => getApi().window.pointerStart({ kind, ...point }));
    },
    queueMove(point: TWindowPointerPoint) {
      pendingPoint = point;
      frameId ??= requestAnimationFrame(flush);
    },
    finish() {
      if (!this.isStarted) return;
      if (frameId !== null) cancelAnimationFrame(frameId);
      flush();
      report(() => getApi().window.pointerEnd());
    },
  };
}

/** IPC 호출을 callSafely 로 감싸 실패 봉투면 onError 를 1회만 부른다 */
function createErrorReporter(onError: (message: string) => void) {
  let hasReported = false;
  return (call: () => Promise<TIpcResult<null>>) => {
    void callSafely(call, WINDOW_FAILED_MESSAGE).then((result) => {
      if (result.ok || hasReported) return;
      hasReported = true;
      onError(result.error.message);
    });
  };
}

/** 이동 임계를 넘었는가 — 가로·세로 중 하나라도 */
function isBeyondThreshold(origin: TWindowPointerPoint, point: TWindowPointerPoint): boolean {
  return (
    Math.abs(point.screenX - origin.screenX) > WINDOW_DRAG_THRESHOLD ||
    Math.abs(point.screenY - origin.screenY) > WINDOW_DRAG_THRESHOLD
  );
}

/** 포인터 화면 좌표를 정수로 — 배율 화면에서는 소수가 온다 (계약은 정수) */
function toPoint(event: { screenX: number; screenY: number }): TWindowPointerPoint {
  return { screenX: Math.round(event.screenX), screenY: Math.round(event.screenY) };
}
