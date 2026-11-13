import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TBookmark } from '@shared/ipc/bookmarks';

import { BOOKMARK_TILE_MAX, BookmarkSection } from '../BookmarkSection';

function createBookmark(n: number): TBookmark {
  return { id: `b${String(n)}`, url: `https://site${String(n)}.com/`, title: `사이트 ${String(n)}`, createdAt: '' };
}

describe('BookmarkSection', () => {
  it('북마크가 없으면 영역을 그리지 않는다', () => {
    render(<BookmarkSection bookmarkList={[]} onSelect={vi.fn()} />);
    expect(screen.queryByRole('navigation', { name: '북마크' })).not.toBeInTheDocument();
  });

  it('타일을 누르면 그 url 로 이동한다', () => {
    const onSelect = vi.fn();
    render(<BookmarkSection bookmarkList={[createBookmark(1)]} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: '사이트 1' }));
    expect(onSelect).toHaveBeenCalledWith('https://site1.com/');
  });

  it('최대 12개까지만 그린다', () => {
    const bookmarkList = Array.from({ length: 15 }, (_, index) => createBookmark(index + 1));
    render(<BookmarkSection bookmarkList={bookmarkList} onSelect={vi.fn()} />);
    const nav = screen.getByRole('navigation', { name: '북마크' });
    expect(within(nav).getAllByRole('button')).toHaveLength(BOOKMARK_TILE_MAX);
  });
});
