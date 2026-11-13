import { ArrowUp, Square } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const PLACEHOLDER = '할 일을 입력하세요';
const KEY_HINT = 'Enter 실행 · Shift+Enter 줄바꿈';
/** 추천이 보일 때 안내 (spec 019 FR-5) */
const SUGGESTION_KEY_HINT = `Tab 추천 입력 · ${KEY_HINT}`;
/** 입력값과 흐린 이어쓰기 층이 같은 글꼴·여백·줄바꿈을 쓴다 — 겹쳐서 글자 위치가 맞게 */
const TEXT_BOX_CLASS = 'max-h-48 min-h-10 px-2 py-1.5 text-base md:text-sm [grid-area:1/1]';
/** IME 조합 중 keydown 의 keyCode — isComposing 이 없는 환경 대비 */
const IME_PROCESS_KEY_CODE = 229;

interface ITaskInputProps {
  task: string;
  /** 보일 추천 문구 전체 — 빈 입력이면 placeholder, 입력 중이면 나머지를 흐리게 잇고 Tab 으로 채운다 (spec 019). 없으면 null */
  suggestion: string | null;
  /** 실행 중(또는 시작 요청 중)이면 입력을 잠그고 [중지] 를 보인다 */
  isBusy: boolean;
  /** run id 를 받기 전(시작 요청 중)에는 중지할 대상이 없다 */
  canStop: boolean;
  onTaskChange: (task: string) => void;
  onStart: () => void;
  onStop: () => void;
}

/**
 * 하단 둥근 카드형 할 일 입력 + 원형 실행/중지 버튼 (spec 009 FR-6·7).
 * Enter = [작업 실행] 클릭, Shift+Enter 줄바꿈, IME 조합 중 Enter 는 무시(한글 마지막 글자 확정용).
 * 추천 문구는 흐리게 보이고 Tab 으로 입력값이 된다 — 실행은 하지 않는다 (spec 019 FR-2~5·7, SR-1).
 */
export function TaskInput({ task, suggestion, isBusy, canStop, onTaskChange, onStart, onStop }: ITaskInputProps) {
  const canStart = !isBusy && task.trim().length > 0;
  const shownSuggestion = isBusy ? null : suggestion;
  const ghostText = shownSuggestion && task.length > 0 ? shownSuggestion.slice(task.length) : '';

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (shownSuggestion && isAcceptSuggestionKey(event)) {
      event.preventDefault();
      onTaskChange(shownSuggestion);
      return;
    }
    if (!isSubmitKey(event)) return;
    event.preventDefault();
    if (canStart) onStart();
  };

  return (
    <div className="px-3 pt-2 pb-3">
      <div className="flex flex-col gap-1 rounded-2xl border border-border bg-background p-2 shadow-sm transition-colors focus-within:border-ring">
        <div className="grid">
          {ghostText && (
            <div
              aria-hidden
              data-testid="task-suggestion-ghost"
              className={cn(TEXT_BOX_CLASS, 'pointer-events-none overflow-hidden break-words whitespace-pre-wrap')}
            >
              <span className="invisible">{task}</span>
              <span className="text-muted-foreground">{ghostText}</span>
            </div>
          )}
          <Textarea
            aria-label="할 일"
            placeholder={shownSuggestion ?? PLACEHOLDER}
            value={task}
            disabled={isBusy}
            rows={1}
            onChange={(event) => onTaskChange(event.target.value)}
            onKeyDown={handleKeyDown}
            className={cn(
              TEXT_BOX_CLASS,
              'resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent',
            )}
          />
        </div>
        <div className="flex items-center justify-between gap-2 pl-2">
          <span className="text-xs text-muted-foreground">{shownSuggestion ? SUGGESTION_KEY_HINT : KEY_HINT}</span>
          {isBusy ? (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="작업 중지"
              title="중지"
              disabled={!canStop}
              onClick={onStop}
              className="rounded-full"
            >
              <Square className="fill-current" />
            </Button>
          ) : (
            <Button
              size="icon-sm"
              aria-label="작업 실행"
              title="실행 (Enter)"
              disabled={!canStart}
              onClick={onStart}
              className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 추천 입력 키인가 — 수식키 없는 Tab, IME 조합 중 제외 (spec 019 FR-4) */
function isAcceptSuggestionKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
  return !isComposingKey(event);
}

/** IME 조합 중인 키 입력인가 */
function isComposingKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return event.nativeEvent.isComposing || event.keyCode === IME_PROCESS_KEY_CODE;
}

/** 실행 키인가 — Enter(또는 Ctrl/Cmd+Enter), Shift+Enter·IME 조합 중 제외 */
function isSubmitKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  if (event.key !== 'Enter' || event.shiftKey) return false;
  return !isComposingKey(event);
}
