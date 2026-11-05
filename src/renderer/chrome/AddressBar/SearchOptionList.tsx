import { Search } from 'lucide-react';

import { SEARCH_ENGINE_LIST, type TSearchEngine } from '@shared/utils/addressInput';

import { cn } from '@/lib/utils';

interface ISearchOptionListProps {
  listId: string;
  query: string;
  highlightIndex: number;
  getOptionId: (index: number) => string;
  onSelect: (engine: TSearchEngine) => void;
  onHighlight: (index: number) => void;
}

/**
 * 주소창 아래 검색 선택 목록 — 문서 흐름 안에 펼친다 (네이티브 탭 View 가 위에 그려져 겹치는 드롭다운은 가려진다).
 * 줄을 누르는 동안 주소창 포커스를 빼앗지 않도록 mousedown 기본 동작을 막는다.
 */
export function SearchOptionList({
  listId,
  query,
  highlightIndex,
  getOptionId,
  onSelect,
  onHighlight,
}: ISearchOptionListProps) {
  return (
    <ul
      id={listId}
      role="listbox"
      aria-label="검색 선택"
      className="mt-1 mb-1 rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-sm"
    >
      {SEARCH_ENGINE_LIST.map(({ engine, label }, index) => (
        <li
          key={engine}
          id={getOptionId(index)}
          role="option"
          aria-selected={index === highlightIndex}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onHighlight(index)}
          onClick={() => onSelect(engine)}
          className={cn(
            'flex h-8 cursor-default items-center gap-2 px-3 text-sm',
            index === highlightIndex && 'bg-accent text-accent-foreground',
          )}
        >
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{`'${query}' — ${label}에서 검색`}</span>
        </li>
      ))}
    </ul>
  );
}
