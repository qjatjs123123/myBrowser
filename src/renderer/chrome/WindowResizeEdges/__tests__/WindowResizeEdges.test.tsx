import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WindowResizeEdges } from '..';

const CURSOR_BY_EDGE = {
  n: 'cursor-ns-resize',
  s: 'cursor-ns-resize',
  e: 'cursor-ew-resize',
  w: 'cursor-ew-resize',
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
} as const;

describe('WindowResizeEdges (spec 016)', () => {
  it('8방향 손잡이를 방향에 맞는 커서로 그린다', () => {
    render(<WindowResizeEdges onPointerDown={vi.fn()} />);
    const edgeList = screen.getAllByTestId('window-resize-edge');
    expect(edgeList.map((edge) => edge.dataset.resizeEdge).sort()).toEqual(Object.keys(CURSOR_BY_EDGE).sort());
    for (const edge of edgeList) {
      expect(edge).toHaveClass(CURSOR_BY_EDGE[edge.dataset.resizeEdge as keyof typeof CURSOR_BY_EDGE]);
    }
  });

  it('손잡이를 누르면 그 방향으로 콜백을 부른다', () => {
    const onPointerDown = vi.fn();
    render(<WindowResizeEdges onPointerDown={onPointerDown} />);
    const southEast = screen.getAllByTestId('window-resize-edge').find((edge) => edge.dataset.resizeEdge === 'se');
    if (!southEast) throw new Error('se 손잡이가 없습니다');
    fireEvent.pointerDown(southEast);
    expect(onPointerDown).toHaveBeenCalledOnce();
    expect(onPointerDown.mock.calls[0]?.[0]).toBe('se');
  });
});
