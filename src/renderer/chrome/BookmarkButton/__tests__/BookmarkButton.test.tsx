import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BookmarkButton } from '..';

describe('BookmarkButton', () => {
  it('북마크에 있으면 눌린 상태다', () => {
    render(<BookmarkButton isBookmarked isDisabled={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: '북마크' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('북마크에 없으면 눌리지 않은 상태다', () => {
    render(<BookmarkButton isBookmarked={false} isDisabled={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: '북마크' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('누르면 onToggle 을 부른다', () => {
    const onToggle = vi.fn();
    render(<BookmarkButton isBookmarked={false} isDisabled={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: '북마크' }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('새 탭이면 비활성이다', () => {
    render(<BookmarkButton isBookmarked={false} isDisabled onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: '북마크' })).toBeDisabled();
  });
});
