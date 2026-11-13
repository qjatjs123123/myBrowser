import type { PointerEvent } from 'react';

import type { TWindowPointerKind } from '@shared/ipc/window';

import { cn } from '@/lib/utils';

type TResizeEdge = Exclude<TWindowPointerKind, 'move'>;

/** 변(두께 4px)·모서리(10px) 손잡이 위치와 커서 — 모서리가 변 위에 오도록 뒤에 둔다 */
const EDGE_LIST: { edge: TResizeEdge; className: string }[] = [
  { edge: 'n', className: 'inset-x-2.5 top-0 h-1 cursor-ns-resize' },
  { edge: 's', className: 'inset-x-2.5 bottom-0 h-1 cursor-ns-resize' },
  { edge: 'w', className: 'inset-y-2.5 left-0 w-1 cursor-ew-resize' },
  { edge: 'e', className: 'inset-y-2.5 right-0 w-1 cursor-ew-resize' },
  { edge: 'nw', className: 'top-0 left-0 size-2.5 cursor-nwse-resize' },
  { edge: 'se', className: 'right-0 bottom-0 size-2.5 cursor-nwse-resize' },
  { edge: 'ne', className: 'top-0 right-0 size-2.5 cursor-nesw-resize' },
  { edge: 'sw', className: 'bottom-0 left-0 size-2.5 cursor-nesw-resize' },
];

interface IWindowResizeEdgesProps {
  /** 손잡이를 누르면 그 방향으로 크기 조절을 시작한다 */
  onPointerDown: (edge: TResizeEdge, event: PointerEvent<HTMLElement>) => void;
}

/**
 * 창 가장자리 크기 조절 손잡이 8개 (spec 016 FR-4) — Linux 에서 최대화가 아닐 때만 App 이 그린다.
 * OS 테두리처럼 마우스 전용이라 접근성 트리에서 숨긴다.
 */
export function WindowResizeEdges({ onPointerDown }: IWindowResizeEdgesProps) {
  return (
    <>
      {EDGE_LIST.map(({ edge, className }) => (
        <div
          key={edge}
          aria-hidden
          data-testid="window-resize-edge"
          data-resize-edge={edge}
          className={cn('absolute z-50', className)}
          onPointerDown={(event) => onPointerDown(edge, event)}
        />
      ))}
    </>
  );
}
