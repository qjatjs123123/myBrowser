import { type KeyboardEvent, type PointerEvent, useRef } from 'react';

/** ←/→ 한 번에 바뀌는 폭(px) */
const KEYBOARD_STEP = 16;

interface ISidebarResizerProps {
  /** 현재 패널 폭(px) — aria-valuenow */
  width: number;
  minWidth: number;
  maxWidth: number;
  /** 범위로 고정한 새 폭 */
  onResize: (width: number) => void;
}

interface IDragStart {
  pointerId: number;
  clientX: number;
  width: number;
}

/**
 * 사이드바 왼쪽 가장자리 폭 손잡이 (spec 012 FR-5) — 왼쪽으로 끌거나 ← 를 누르면 넓어진다.
 * 포인터는 손잡이에 capture 해, 드래그 중 탭 View(네이티브) 위로 지나가도 이 요소가 move·up 을 받는다.
 */
export function SidebarResizer({ width, minWidth, maxWidth, onResize }: ISidebarResizerProps) {
  const dragStartRef = useRef<IDragStart | null>(null);
  const resizeTo = (nextWidth: number) => onResize(clampWidth(nextWidth, minWidth, maxWidth));

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { pointerId: event.pointerId, clientX: event.clientX, width };
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const dragStart = dragStartRef.current;
    if (dragStart?.pointerId !== event.pointerId) return;
    resizeTo(dragStart.width + (dragStart.clientX - event.clientX));
  };
  const handleDragEnd = () => {
    dragStartRef.current = null;
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = getKeyDirection(event.key);
    if (direction === 0) return;
    event.preventDefault();
    resizeTo(width + direction * KEYBOARD_STEP);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="사이드바 폭 조절"
      aria-valuenow={width}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handleDragEnd}
      onLostPointerCapture={handleDragEnd}
      onKeyDown={handleKeyDown}
      className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize touch-none border-l-2 border-transparent outline-none hover:border-ring focus-visible:border-ring active:border-ring"
    />
  );
}

/** 폭을 범위 안 정수로 */
function clampWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.round(Math.min(maxWidth, Math.max(minWidth, width)));
}

/** 키 → 폭 방향 (← 넓어짐 +1, → 좁아짐 −1, 그 밖 0) — 손잡이가 패널 왼쪽 가장자리라 왼쪽이 넓어지는 쪽 */
function getKeyDirection(key: string): -1 | 0 | 1 {
  if (key === 'ArrowLeft') return 1;
  if (key === 'ArrowRight') return -1;
  return 0;
}
