import { CircleCheck, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { TIpcResult } from '@shared/ipc/result';

import { Button } from '@/components/ui/button';
import { useAccount } from '@/hooks/useAccount';
import { toast } from '@/lib/toast';

const INACTIVE_TEXT = '구독을 시작하면 에이전트를 쓸 수 있습니다';
const ACTIVATING_TEXT = '구매 페이지에서 결제를 마치면 자동으로 연결됩니다';
const READY_TEXT = '준비됨';
const CREDITS_LOADING_TEXT = '크레딧 확인 중';

type TAction = () => Promise<TIpcResult<unknown>>;

/**
 * 사이드바 계정 카드 — gateway 모드에서 구독 연결(활성화)·크레딧·관리를 보여준다.
 * direct·fake 모드(not_required)와 첫 조회 전에는 아무것도 그리지 않는다. 동작 실패는 main 의 메시지로 toast.
 */
export function AccountCard() {
  const { status, loadErrorMessage, startActivation, cancelActivation, openManage, signOut } = useAccount();
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (loadErrorMessage) toast.error(loadErrorMessage);
  }, [loadErrorMessage]);

  const runAction = async (action: TAction) => {
    setIsPending(true);
    const result = await action();
    setIsPending(false);
    if (!result.ok) toast.error(result.error.message);
  };

  if (!status || status.state === 'not_required') return null;

  return (
    <section aria-label="계정" className="flex flex-col gap-2 border-b border-border px-4 py-3 text-sm">
      {status.state === 'inactive' && (
        <>
          <p className="text-muted-foreground">{INACTIVE_TEXT}</p>
          {status.message && <p className="text-xs text-destructive">{status.message}</p>}
          <Button size="sm" disabled={isPending} onClick={() => void runAction(startActivation)}>
            구독하고 시작하기
          </Button>
        </>
      )}
      {status.state === 'activating' && (
        <>
          <p className="flex items-center gap-2 text-muted-foreground">
            <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" />
            {ACTIVATING_TEXT}
          </p>
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => void runAction(cancelActivation)}>
            취소
          </Button>
        </>
      )}
      {status.state === 'active' && (
        <>
          <p className="flex items-center gap-2">
            <CircleCheck aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">{READY_TEXT}</span>
            <span className="text-muted-foreground">
              {status.credits === null ? CREDITS_LOADING_TEXT : `크레딧 ${status.credits}`}
            </span>
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => void runAction(openManage)}>
              구독 관리
            </Button>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => void runAction(signOut)}>
              연결 해제
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
