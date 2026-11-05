import { Play, Square } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const PLACEHOLDER = '예: 네이버에서 강남역 맛집 찾아 전화번호 알려줘';

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

/** 하단 할 일 입력 + 실행/중지 버튼 — Ctrl/Cmd+Enter 로도 실행 */
export function TaskInput({ task, isBusy, canStop, onTaskChange, onStart, onStop }: ITaskInputProps) {
  const canStart = !isBusy && task.trim().length > 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isSubmitShortcut = event.key === 'Enter' && (event.ctrlKey || event.metaKey);
    if (!isSubmitShortcut) return;
    event.preventDefault();
    if (canStart) onStart();
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border p-3">
      <Textarea
        aria-label="할 일"
        placeholder={PLACEHOLDER}
        value={task}
        disabled={isBusy}
        rows={3}
        onChange={(event) => onTaskChange(event.target.value)}
        onKeyDown={handleKeyDown}
        className="max-h-40 resize-none"
      />
      <div className="flex justify-end">
        {isBusy ? (
          <Button variant="outline" size="sm" aria-label="작업 중지" disabled={!canStop} onClick={onStop}>
            <Square />
            중지
          </Button>
        ) : (
          <Button size="sm" aria-label="작업 실행" disabled={!canStart} onClick={onStart}>
            <Play />
            실행
          </Button>
        )}
      </div>
    </div>
  );
}
