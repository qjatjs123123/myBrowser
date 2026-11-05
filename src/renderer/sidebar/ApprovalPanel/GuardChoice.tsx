import { useEffect, useRef, useState } from 'react';

import type { TApprovalDecision } from '@shared/agent/run';

import { Button } from '@/components/ui/button';

const USER_DONE_GUIDE = '탭에서 직접 누른 뒤 [계속]을 누르세요';

interface IGuardChoiceProps {
  isSending: boolean;
  onDecide: (decision: TApprovalDecision) => void;
}

/**
 * 가드 판정 승인의 세 선택 — [직접 누를게요]는 바로 보내지 않고 안내 + [계속](user_done)으로 바뀐다.
 * 처음에는 [거부]에 포커스(Enter 로 실수 실행 방지), 안내 단계에서는 [계속]에 포커스.
 */
export function GuardChoice({ isSending, onDecide }: IGuardChoiceProps) {
  const [isUserDoing, setIsUserDoing] = useState(false);

  if (isUserDoing) return <UserDoneStep isSending={isSending} onContinue={() => onDecide('user_done')} />;
  return (
    <ChoiceButtons
      isSending={isSending}
      onUserDo={() => setIsUserDoing(true)}
      onAgentDo={() => onDecide('agent')}
      onDeny={() => onDecide('denied')}
    />
  );
}

interface IChoiceButtonsProps {
  isSending: boolean;
  onUserDo: () => void;
  onAgentDo: () => void;
  onDeny: () => void;
}

/** 세 버튼 — 마운트 시 [거부]에 포커스 */
function ChoiceButtons({ isSending, onUserDo, onAgentDo, onDeny }: IChoiceButtonsProps) {
  const denyRef = useRef<HTMLButtonElement>(null);
  useEffect(() => denyRef.current?.focus(), []);
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={isSending} onClick={onUserDo}>
        직접 누를게요
      </Button>
      <Button size="sm" disabled={isSending} onClick={onAgentDo}>
        에이전트가 누르기
      </Button>
      <Button ref={denyRef} size="sm" variant="outline" disabled={isSending} onClick={onDeny}>
        거부
      </Button>
    </div>
  );
}

interface IUserDoneStepProps {
  isSending: boolean;
  onContinue: () => void;
}

/** 직접 누르기 안내 — 사용자가 탭에서 처리한 뒤 [계속] */
function UserDoneStep({ isSending, onContinue }: IUserDoneStepProps) {
  const continueRef = useRef<HTMLButtonElement>(null);
  useEffect(() => continueRef.current?.focus(), []);
  return (
    <div className="flex flex-col gap-2">
      <p>{USER_DONE_GUIDE}</p>
      <div className="flex">
        <Button ref={continueRef} size="sm" disabled={isSending} onClick={onContinue}>
          계속
        </Button>
      </div>
    </div>
  );
}
