import { Search, X } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';

import type { THistoryEntry } from '@shared/ipc/history';
import type { TIpcResult } from '@shared/ipc/result';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHistory } from '@/hooks/useHistory';
import { toast } from '@/lib/toast';

/** [모두 지우기] 확인 상태가 풀리는 시간 (spec 021 FR-5) */
export const CLEAR_CONFIRM_MS = 3000;

const CLEAR_LABEL = '방문 기록 모두 지우기';
const CLEAR_CONFIRM_LABEL = '정말 모두 지울까요?';

interface IHistorySectionProps {
  /** 값이 바뀔 때마다 검색 입력에 포커스 (Ctrl+H) */
  focusSignal: number;
  onSelect: (url: string) => void;
}

/** 방문 기록 페이지 본문 — 검색 + 전체 지우기 + 최근 순 목록 + 항목별 지우기 (spec 021 FR-5, spec 023) */
export function HistorySection({ focusSignal, onSelect }: IHistorySectionProps) {
  const [query, setQuery] = useState('');
  const history = useHistory(query);
  const inputRef = useRef<HTMLInputElement>(null);
  useFocusSignal(inputRef, focusSignal);
  useEffect(() => {
    if (history.loadError) toast.error(history.loadError);
  }, [history.loadError]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            aria-label="방문 기록 검색"
            placeholder="제목·주소로 찾기"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 rounded-full border-transparent bg-muted pl-9 text-sm shadow-none focus-visible:border-transparent focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring dark:bg-muted"
          />
        </div>
        <ClearAllButton isDisabled={history.entryList.length === 0} onClear={() => void notifyFailure(history.clear())} />
      </div>
      <HistoryList
        entryList={history.entryList}
        isSearching={query.trim() !== ''}
        onSelect={onSelect}
        onRemove={(id) => void notifyFailure(history.remove(id))}
      />
    </div>
  );
}

interface IHistoryListProps {
  entryList: THistoryEntry[];
  isSearching: boolean;
  onSelect: (url: string) => void;
  onRemove: (id: string) => void;
}

/** 기록 목록 — 비었으면 상황에 맞는 빈 문구 */
function HistoryList({ entryList, isSearching, onSelect, onRemove }: IHistoryListProps) {
  if (entryList.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        {isSearching ? '찾는 기록이 없습니다' : '방문 기록이 없습니다'}
      </p>
    );
  }
  return (
    <ul aria-label="방문 기록 목록" className="flex flex-col">
      {entryList.map((entry) => (
        <HistoryRow key={entry.id} entry={entry} onSelect={onSelect} onRemove={onRemove} />
      ))}
    </ul>
  );
}

interface IHistoryRowProps {
  entry: THistoryEntry;
  onSelect: (url: string) => void;
  onRemove: (id: string) => void;
}

/** 기록 한 줄 — 제목·호스트·시각 버튼(접근 이름 = 제목) + hover 때 보이는 지우기 */
function HistoryRow({ entry, onSelect, onRemove }: IHistoryRowProps) {
  const host = toHost(entry.url);
  const time = formatVisitTime(entry.visitedAt, new Date());
  return (
    <li className="group flex items-center gap-1 rounded-lg hover:bg-muted">
      <button
        type="button"
        aria-label={entry.title}
        aria-description={`${host} · ${time}`}
        title={entry.url}
        onClick={() => onSelect(entry.url)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1 truncate">{entry.title}</span>
        <span className="max-w-40 shrink-0 truncate text-xs text-muted-foreground">{host}</span>
        <time dateTime={entry.visitedAt} className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          {time}
        </time>
      </button>
      <Button
        variant="ghost"
        aria-label={`${entry.title} 기록에서 지우기`}
        title="기록에서 지우기"
        onClick={() => onRemove(entry.id)}
        className="size-8 shrink-0 rounded-full p-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <X className="size-4" />
      </Button>
    </li>
  );
}

interface IClearAllButtonProps {
  isDisabled: boolean;
  onClear: () => void;
}

/** 두 번 눌러야 지운다 — 첫 클릭 뒤 3초 안에 다시 누르지 않으면 원래 문구로 */
function ClearAllButton({ isDisabled, onClear }: IClearAllButtonProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  useEffect(() => {
    if (!isConfirming) return;
    const timer = setTimeout(() => setIsConfirming(false), CLEAR_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [isConfirming]);

  const handleClick = () => {
    if (!isConfirming) {
      setIsConfirming(true);
      return;
    }
    setIsConfirming(false);
    onClear();
  };
  return (
    <Button variant="ghost" size="sm" disabled={isDisabled} onClick={handleClick} className="text-xs text-muted-foreground">
      {isConfirming ? CLEAR_CONFIRM_LABEL : CLEAR_LABEL}
    </Button>
  );
}

/** focusSignal 이 0 보다 크면 바뀔 때마다 입력에 포커스 — 시작 화면이 신호보다 늦게 붙어도 붙자마자 포커스 */
function useFocusSignal(inputRef: RefObject<HTMLInputElement | null>, focusSignal: number): void {
  useEffect(() => {
    if (focusSignal > 0) inputRef.current?.focus();
  }, [inputRef, focusSignal]);
}

/** url 의 호스트 — 읽을 수 없으면 url 그대로 */
function toHost(url: string): string {
  return URL.canParse(url) ? new URL(url).host : url;
}

/** 오늘이면 `HH:mm`, 아니면 `M월 D일` */
export function formatVisitTime(visitedAt: string, now: Date): string {
  const date = new Date(visitedAt);
  if (date.toDateString() === now.toDateString()) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  return `${String(date.getMonth() + 1)}월 ${String(date.getDate())}일`;
}

/** IPC 결과가 실패면 main 의 메시지를 toast 로 보여준다 */
async function notifyFailure(task: Promise<TIpcResult<unknown>>): Promise<void> {
  const result = await task;
  if (!result.ok) toast.error(result.error.message);
}
