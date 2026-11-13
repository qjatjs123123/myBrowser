import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MoreMenuButton, toMenuPoint } from '..';

describe('MoreMenuButton (spec 023)', () => {
  it('누르면 버튼 왼쪽 아래 좌표를 정수로 넘긴다', () => {
    const onOpen = vi.fn();
    render(<MoreMenuButton onOpen={onOpen} />);
    const button = screen.getByRole('button', { name: '메뉴' });
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ left: 10.4, bottom: 39.6 } as DOMRect);
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith({ x: 10, y: 40 });
  });

  it('메뉴를 연다는 표시(aria-haspopup=menu)를 가진다', () => {
    render(<MoreMenuButton onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: '메뉴' })).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('음수 좌표는 0 으로 맞춘다', () => {
    expect(toMenuPoint({ left: -3.2, bottom: 0.4 })).toEqual({ x: 0, y: 0 });
  });
});
