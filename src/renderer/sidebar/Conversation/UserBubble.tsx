import { CopyButton } from './CopyButton';

interface IUserBubbleProps {
  task: string;
}

/** 사용자가 준 할 일 — 오른쪽 말풍선 + 아래 복사 버튼 (spec 009 FR-1·3) */
export function UserBubble({ task }: IUserBubbleProps) {
  return (
    <div role="group" aria-label="내 할 일" className="group flex flex-col items-end gap-0.5">
      <p className="max-w-[85%] rounded-2xl bg-muted px-3.5 py-2 text-sm break-words whitespace-pre-wrap">{task}</p>
      <CopyButton
        text={task}
        label="할 일 복사"
        className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
      />
    </div>
  );
}
