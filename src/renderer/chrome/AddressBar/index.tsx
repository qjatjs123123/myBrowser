import { Globe, Loader2, Search } from 'lucide-react';
import { type RefObject, useEffect, useId, useRef } from 'react';

import type { TIpcResult } from '@shared/ipc/result';

import { Input } from '@/components/ui/input';
import { toast } from '@/lib/toast';

import { SearchOptionList } from './SearchOptionList';
import { useAddressInput } from './useAddressInput';

interface IAddressBarProps {
  /** 활성 탭 URL — 새 탭이면 빈 문자열 */
  url: string;
  isLoading: boolean;
  isNewTab: boolean;
  /** 값이 바뀔 때마다 주소창에 포커스 + 전체 선택 (Ctrl+L) */
  focusSignal: number;
  onNavigate: (url: string) => Promise<TIpcResult<null>>;
}

/** 주소창 — 활성 탭 URL 표시, URL 이면 Enter 로 이동, 검색어면 아래에 검색 선택 목록 (FR-2·FR-3) */
export function AddressBar({ url, isLoading, isNewTab, focusSignal, onNavigate }: IAddressBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isFocusSelectingRef = useRef(false);
  const listId = useId();
  const address = useAddressInput({
    url,
    onSubmit: (target) => {
      inputRef.current?.blur();
      void notifyFailure(onNavigate(target));
    },
  });
  const isListOpen = address.query !== null;
  const getOptionId = (index: number) => `${listId}-option-${index}`;
  useFocusSignal(inputRef, focusSignal);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="relative">
        <AddressIcon isLoading={isLoading} isNewTab={isNewTab} />
        <Input
          ref={inputRef}
          role="combobox"
          aria-label="주소창"
          aria-expanded={isListOpen}
          aria-controls={isListOpen ? listId : undefined}
          aria-activedescendant={isListOpen ? getOptionId(address.highlightIndex) : undefined}
          aria-autocomplete="list"
          placeholder="검색어 또는 주소 입력"
          spellCheck={false}
          value={address.value}
          onChange={(event) => address.change(event.target.value)}
          onKeyDown={address.handleKeyDown}
          onFocus={(event) => {
            isFocusSelectingRef.current = true;
            event.currentTarget.select();
          }}
          onMouseUp={(event) => {
            // 클릭으로 포커스될 때 mouseup 이 전체 선택을 풀지 않게 한다
            if (isFocusSelectingRef.current) event.preventDefault();
            isFocusSelectingRef.current = false;
          }}
          onBlur={address.revert}
          className="h-8 rounded-full border-transparent bg-muted pr-3 pl-9 text-sm shadow-none focus-visible:border-transparent focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring dark:bg-muted"
        />
      </div>
      {isListOpen && (
        <SearchOptionList
          listId={listId}
          query={address.query ?? ''}
          highlightIndex={address.highlightIndex}
          getOptionId={getOptionId}
          onSelect={address.selectEngine}
          onHighlight={address.highlight}
        />
      )}
    </div>
  );
}

/** 주소창 왼쪽 16px 아이콘 — 로딩 중 스피너, 새 탭 검색, 그 외 지구본 */
function AddressIcon({ isLoading, isNewTab }: { isLoading: boolean; isNewTab: boolean }) {
  const className = 'pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground';
  if (isLoading) return <Loader2 aria-hidden className={`${className} animate-spin`} />;
  if (isNewTab) return <Search aria-hidden className={className} />;
  return <Globe aria-hidden className={className} />;
}

/** focusSignal 이 처음 값에서 바뀔 때마다 입력에 포커스하고 전체 선택한다 */
function useFocusSignal(inputRef: RefObject<HTMLInputElement | null>, focusSignal: number): void {
  const lastSignalRef = useRef(focusSignal);
  useEffect(() => {
    if (lastSignalRef.current === focusSignal) return;
    lastSignalRef.current = focusSignal;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [inputRef, focusSignal]);
}

/** IPC 결과가 실패면 main 의 메시지를 toast 로 보여준다 */
async function notifyFailure(task: Promise<TIpcResult<unknown>>): Promise<void> {
  const result = await task;
  if (!result.ok) toast.error(result.error.message);
}
