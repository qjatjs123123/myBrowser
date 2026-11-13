import type { TBookmark } from '@shared/ipc/bookmarks';

import { ShortcutTile } from './ShortcutTile';

/** 시작 화면에 보이는 북마크 타일 최대 개수 (spec 021 FR-3) */
export const BOOKMARK_TILE_MAX = 12;

interface IBookmarkSectionProps {
  bookmarkList: TBookmark[];
  onSelect: (url: string) => void;
}

/** 시작 화면 북마크 타일 — 최신 추가 순 12개, 없으면 그리지 않는다 */
export function BookmarkSection({ bookmarkList, onSelect }: IBookmarkSectionProps) {
  if (bookmarkList.length === 0) return null;
  return (
    <section aria-labelledby="new-tab-bookmark-heading" className="flex flex-col gap-2">
      <h2 id="new-tab-bookmark-heading" className="text-sm font-medium text-muted-foreground">
        북마크
      </h2>
      <nav aria-label="북마크" className="flex flex-wrap gap-2">
        {bookmarkList.slice(0, BOOKMARK_TILE_MAX).map((bookmark) => (
          <ShortcutTile
            key={bookmark.id}
            label={bookmark.title}
            initial={toInitial(bookmark.title)}
            onSelect={() => onSelect(bookmark.url)}
          />
        ))}
      </nav>
    </section>
  );
}

/** 제목 첫 글자 — 영문은 대문자 */
function toInitial(title: string): string {
  return (Array.from(title.trim())[0] ?? '?').toUpperCase();
}
