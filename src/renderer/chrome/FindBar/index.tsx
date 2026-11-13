import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TFindCount } from '@/hooks/useFindInPage';

interface IFindBarProps {
  text: string;
  count: TFindCount | null;
  /** 값이 바뀔 때마다 입력에 포커스 (Ctrl+F) */
  focusSignal: number;
  onSearch: (text: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

/**
 * 페이지에서 찾기 줄 (spec 021 FR-7~9) — 입력 + `현재/전체` + 이전·다음·닫기.
 * Enter = 다음, Shift+Enter = 이전, Esc = 닫기. 탭 콘텐츠 영역 밖(툴바 아래)에 그린다.
 */
export function FindBar({ text, count, focusSignal, onSearch, onNext, onPrev, onClose }: IFindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSignal]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') onClose();
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (event.shiftKey) onPrev();
    else onNext();
  };

  return (
    <div
      role="search"
      aria-label="페이지에서 찾기"
      className="flex h-10 shrink-0 items-center justify-end gap-1 border-b border-border bg-background px-2"
    >
      <Input
        ref={inputRef}
        aria-label="찾을 내용"
        placeholder="페이지에서 찾기"
        value={text}
        onChange={(event) => onSearch(event.target.value)}
        onKeyDown={handleKeyDown}
        className="h-8 w-64 rounded-full border-transparent bg-muted px-3 text-sm shadow-none focus-visible:border-transparent focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring dark:bg-muted"
      />
      <span aria-live="polite" aria-label="찾은 결과" className="w-14 text-center text-xs text-muted-foreground tabular-nums">
        {formatCount(text, count)}
      </span>
      <FindButton label="이전 결과" isDisabled={text === ''} onClick={onPrev}>
        <ChevronUp />
      </FindButton>
      <FindButton label="다음 결과" isDisabled={text === ''} onClick={onNext}>
        <ChevronDown />
      </FindButton>
      <FindButton label="찾기 닫기" isDisabled={false} onClick={onClose}>
        <X />
      </FindButton>
    </div>
  );
}

interface IFindButtonProps {
  label: string;
  isDisabled: boolean;
  onClick: () => void;
  children: ReactNode;
}

/** 32px 원형 고스트 아이콘 버튼 */
function FindButton({ label, isDisabled, onClick, children }: IFindButtonProps) {
  return (
    <Button
      variant="ghost"
      aria-label={label}
      title={label}
      disabled={isDisabled}
      onClick={onClick}
      className="size-8 rounded-full p-0 text-muted-foreground disabled:opacity-40 [&_svg:not([class*='size-'])]:size-[18px]"
    >
      {children}
    </Button>
  );
}

/** 검색어가 없으면 빈칸, 결과 전이면 빈칸, 아니면 `현재/전체` (없으면 0/0) */
function formatCount(text: string, count: TFindCount | null): string {
  if (text === '' || count === null) return '';
  return `${String(count.activeMatch)}/${String(count.matchCount)}`;
}
