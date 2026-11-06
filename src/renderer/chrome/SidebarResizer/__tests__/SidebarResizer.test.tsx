import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SidebarResizer } from '..';

const MIN = 300;
const MAX = 640;

/** 손잡이를 그리고 onResize mock 을 돌려준다 */
function renderResizer(width = 360) {
  const onResize = vi.fn();
  render(<SidebarResizer width={width} minWidth={MIN} maxWidth={MAX} onResize={onResize} />);
  return { onResize, handle: screen.getByRole('separator', { name: '사이드바 폭 조절' }) };
}

const setPointerCapture = vi.fn();

describe('SidebarResizer (spec 012)', () => {
  beforeEach(() => {
    // jsdom 에는 포인터 capture 가 없다
    setPointerCapture.mockClear();
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: setPointerCapture });
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
  });

  it('세로 separator 로 현재 폭과 범위를 알린다', () => {
    const { handle } = renderResizer(400);
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle).toHaveAttribute('aria-valuenow', '400');
    expect(handle).toHaveAttribute('aria-valuemin', '300');
    expect(handle).toHaveAttribute('aria-valuemax', '640');
    expect(handle).toHaveAttribute('tabindex', '0');
  });

  it('누르면 포인터를 손잡이에 capture 한다', () => {
    const { handle } = renderResizer();
    fireEvent.pointerDown(handle, { pointerId: 7, clientX: 1000 });
    expect(setPointerCapture).toHaveBeenCalledWith(7);
  });

  it('왼쪽으로 끌면 끈 만큼 넓어지고 오른쪽으로 끌면 좁아진다', () => {
    const { handle, onResize } = renderResizer();
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 1000 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 900 });
    expect(onResize).toHaveBeenLastCalledWith(460);
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 1040 });
    expect(onResize).toHaveBeenLastCalledWith(320);
  });

  it('끌어서 범위를 넘으면 300~640 으로 고정한다', () => {
    const { handle, onResize } = renderResizer();
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 1000 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 100 });
    expect(onResize).toHaveBeenLastCalledWith(640);
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 1500 });
    expect(onResize).toHaveBeenLastCalledWith(300);
  });

  it('누르지 않았거나 놓은 뒤의 포인터 이동은 무시한다', () => {
    const { handle, onResize } = renderResizer();
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 900 });
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 1000 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 1000 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 900 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('← 는 16px 넓히고 → 는 16px 좁힌다', () => {
    const { handle, onResize } = renderResizer(400);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenLastCalledWith(416);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenLastCalledWith(384);
  });

  it('키보드 조절도 범위로 고정한다', () => {
    const { handle, onResize } = renderResizer(636);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenLastCalledWith(640);
  });

  it('화살표가 아닌 키는 폭을 바꾸지 않는다', () => {
    const { handle, onResize } = renderResizer();
    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(onResize).not.toHaveBeenCalled();
  });
});
