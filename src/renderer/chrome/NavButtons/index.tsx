import { ArrowLeft, ArrowRight, RotateCw, X } from 'lucide-react';
import type { ReactNode } from 'react';

import type { TIpcResult } from '@shared/ipc/result';

import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';

type TNavAction = () => Promise<TIpcResult<null>>;

interface INavButtonsProps {
  canGoBack: boolean;
  canGoForward: boolean;
  /** 대상 탭이 없으면 false — 새로고침/중지도 막는다 */
  hasTarget: boolean;
  isLoading: boolean;
  onGoBack: TNavAction;
  onGoForward: TNavAction;
  onReload: TNavAction;
  onStop: TNavAction;
}

/** 뒤로·앞으로·새로고침(로딩 중엔 중지) 버튼 — 갈 곳이 없으면 비활성, 실패는 main 의 메시지로 toast */
export function NavButtons(props: INavButtonsProps) {
  const { canGoBack, canGoForward, hasTarget, isLoading } = props;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <NavButton label="뒤로" isDisabled={!canGoBack} onClick={props.onGoBack}>
        <ArrowLeft />
      </NavButton>
      <NavButton label="앞으로" isDisabled={!canGoForward} onClick={props.onGoForward}>
        <ArrowRight />
      </NavButton>
      {isLoading ? (
        <NavButton label="중지" isDisabled={!hasTarget} onClick={props.onStop}>
          <X />
        </NavButton>
      ) : (
        <NavButton label="새로고침" isDisabled={!hasTarget} onClick={props.onReload}>
          <RotateCw />
        </NavButton>
      )}
    </div>
  );
}

interface INavButtonProps {
  label: string;
  isDisabled: boolean;
  onClick: TNavAction;
  children: ReactNode;
}

/** 32px 원형 고스트 아이콘 버튼 */
function NavButton({ label, isDisabled, onClick, children }: INavButtonProps) {
  return (
    <Button
      variant="ghost"
      aria-label={label}
      title={label}
      disabled={isDisabled}
      onClick={() => void notifyFailure(onClick())}
      className="size-8 rounded-full p-0 text-muted-foreground disabled:opacity-40 [&_svg:not([class*='size-'])]:size-[18px]"
    >
      {children}
    </Button>
  );
}

/** IPC 결과가 실패면 main 의 메시지를 toast 로 보여준다 */
async function notifyFailure(task: Promise<TIpcResult<unknown>>): Promise<void> {
  const result = await task;
  if (!result.ok) toast.error(result.error.message);
}
