import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Switch } from '../switch';

describe('Switch', () => {
  it('접근 이름을 가진 switch 역할로 그려진다', () => {
    render(<Switch aria-label="기본 인원 사용" />);
    expect(screen.getByRole('switch', { name: '기본 인원 사용' })).toHaveAttribute('aria-checked', 'false');
  });

  it('클릭하면 aria-checked 가 바뀌고 onCheckedChange 가 새 값으로 불린다', () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="기본 인원 사용" onCheckedChange={onCheckedChange} />);
    const toggle = screen.getByRole('switch', { name: '기본 인원 사용' });

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
