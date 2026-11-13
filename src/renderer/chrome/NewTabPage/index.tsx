import { Search } from 'lucide-react';
import { type FormEvent, type RefObject, useEffect, useRef, useState } from 'react';

import type { TIpcResult } from '@shared/ipc/result';
import { buildSearchUrl, SEARCH_ENGINE_LIST, type TSearchEngine } from '@shared/utils/addressInput';

import type { TBookmark } from '@shared/ipc/bookmarks';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/toast';

import { BookmarkSection } from './BookmarkSection';
import { HistorySection } from './HistorySection';
import { ShortcutTile } from './ShortcutTile';

/** 시작 화면 바로가기 — 외부 접속은 사용자가 누를 때만 일어난다 (FR-5) */
const SHORTCUT_LIST = [
  { label: '네이버', initial: 'N', url: 'https://www.naver.com/' },
  { label: '구글', initial: 'G', url: 'https://www.google.com/' },
] as const;

interface INewTabPageProps {
  /** 값이 바뀔 때마다 검색창에 포커스 (Ctrl+T) */
  focusSignal: number;
  /** 값이 바뀔 때마다 방문 기록 검색에 포커스 (Ctrl+H — spec 021 FR-6) */
  historyFocusSignal: number;
  /** 최신 추가 순 북마크 (spec 021 FR-3) */
  bookmarkList: TBookmark[];
  onNavigate: (url: string) => Promise<TIpcResult<null>>;
}

/**
 * 새 탭 시작 화면 — 검색창 + 엔진별 검색 버튼 + 바로가기, 그 아래 북마크·방문 기록 (spec 021).
 * 빈 입력은 무시하고 Enter 는 네이버 검색
 */
export function NewTabPage({ focusSignal, historyFocusSignal, bookmarkList, onNavigate }: INewTabPageProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useFocusSignal(inputRef, focusSignal);

  const navigate = (url: string) => void notifyFailure(onNavigate(url));
  const search = (engine: TSearchEngine) => {
    const trimmed = query.trim();
    if (trimmed !== '') navigate(buildSearchUrl(engine, trimmed));
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    search('naver');
  };

  return (
    <div className="flex h-full flex-col items-center overflow-auto bg-background px-6">
      <div aria-hidden className="shrink-0 basis-[22%]" />
      <h1 className="sr-only">새 탭</h1>
      <p aria-hidden className="mb-8 text-4xl font-semibold text-muted-foreground select-none">
        myBrowser
      </p>
      <form role="search" onSubmit={handleSubmit} className="relative w-full max-w-xl">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={inputRef}
          aria-label="새 탭 검색"
          placeholder="검색어 입력"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-11 rounded-full border-transparent bg-muted pr-4 pl-11 shadow-none focus-visible:border-transparent focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring dark:bg-muted"
        />
      </form>
      <div className="mt-4 flex gap-2">
        {SEARCH_ENGINE_LIST.map(({ engine, label }) => (
          <Button key={engine} type="button" variant="secondary" onClick={() => search(engine)}>
            {`${label}에서 검색`}
          </Button>
        ))}
      </div>
      <nav aria-label="바로가기" className="mt-10 flex gap-4">
        {SHORTCUT_LIST.map((shortcut) => (
          <ShortcutTile key={shortcut.url} {...shortcut} onSelect={() => navigate(shortcut.url)} />
        ))}
      </nav>
      <div className="mt-10 flex w-full max-w-xl flex-col gap-8 pb-10">
        <BookmarkSection bookmarkList={bookmarkList} onSelect={navigate} />
        <HistorySection focusSignal={historyFocusSignal} onSelect={navigate} />
      </div>
    </div>
  );
}

/**
 * focusSignal 이 바뀌면 검색창에 포커스한다. 새 탭이 생길 때 시작 화면이 신호보다 늦게 붙을 수 있어
 * 신호가 이미 한 번 이상 온 상태(> 0)로 붙으면 붙자마자 포커스한다.
 */
function useFocusSignal(inputRef: RefObject<HTMLInputElement | null>, focusSignal: number): void {
  useEffect(() => {
    if (focusSignal > 0) inputRef.current?.focus();
  }, [inputRef, focusSignal]);
}

/** IPC 결과가 실패면 main 의 메시지를 toast 로 보여준다 */
async function notifyFailure(task: Promise<TIpcResult<unknown>>): Promise<void> {
  const result = await task;
  if (!result.ok) toast.error(result.error.message);
}
