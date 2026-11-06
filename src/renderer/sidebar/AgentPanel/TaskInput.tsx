import { ArrowUp, Square } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const PLACEHOLDER = '할 일을 입력하세요';
const KEY_HINT = 'Enter 실행 · Shift+Enter 줄바꿈';
/** IME 조합 중 keydown 의 keyCode — isComposing 이 없는 환경 대비 */
const IME_PROCESS_KEY_CODE = 229;

interface ITaskInputProps {
  task: string;
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
 */
export function TaskInput({ task, isBusy, canStop, onTaskChange, onStart, onStop }: ITaskInputProps) {
  const canStart = !isBusy && task.trim().length > 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isSubmitKey(event)) return;
    event.preventDefault();
    if (canStart) onStart();
  };

  return (
    <div className="px-3 pt-2 pb-3">
      <div className="flex flex-col gap-1 rounded-2xl border border-border bg-background p-2 shadow-sm transition-colors focus-within:border-ring">
        <Textarea
          aria-label="할 일"
          placeholder={PLACEHOLDER}
          value={task}
          disabled={isBusy}
          rows={1}
          onChange={(event) => onTaskChange(event.target.value)}
          onKeyDown={handleKeyDown}
          className="max-h-48 min-h-10 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <div className="flex items-center justify-between gap-2 pl-2">
          <span className="text-xs text-muted-foreground">{KEY_HINT}</span>
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

/** 실행 키인가 — Enter(또는 Ctrl/Cmd+Enter), Shift+Enter·IME 조합 중 제외 */
function isSubmitKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  if (event.key !== 'Enter' || event.shiftKey) return false;
  const isComposing = event.nativeEvent.isComposing || event.keyCode === IME_PROCESS_KEY_CODE;
  return !isComposing;
}
