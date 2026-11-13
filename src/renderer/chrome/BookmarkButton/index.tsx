import { Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface IBookmarkButtonProps {
  isBookmarked: boolean;
  /** 새 탭(시작 화면)이면 북마크할 페이지가 없다 */
  isDisabled: boolean;
  onToggle: () => void;
}

/** 주소창 오른쪽 북마크 별 (spec 021 FR-1) — 눌린 상태 = 이 페이지가 북마크에 있음 */
export function BookmarkButton({ isBookmarked, isDisabled, onToggle }: IBookmarkButtonProps) {
  const label = isBookmarked ? '북마크에서 빼기' : '북마크에 추가';
  return (
    <Button
      variant="ghost"
      aria-label="북마크"
      aria-pressed={isBookmarked}
      title={label}
      disabled={isDisabled}
      onClick={onToggle}
      className="size-8 shrink-0 rounded-full p-0 text-muted-foreground disabled:opacity-40"
    >
      <Star className={cn('size-[18px]', isBookmarked && 'fill-current text-foreground')} />
    </Button>
  );
}
