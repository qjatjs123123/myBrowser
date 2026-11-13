import { useEffect, useRef, useState } from 'react';

import type { TApprovalDecision } from '@shared/agent/run';

import { Button } from '@/components/ui/button';
import { ChoiceList, type IChoice } from '@/sidebar/ChoiceList';

const USER_DONE_GUIDE = '탭에서 직접 누른 뒤 [계속]을 누르세요';

/** 직접 누르기는 바로 보내지 않고 안내 단계로 — 그래서 결정 값과 따로 둔다 */
type TGuardChoiceValue = 'user_do' | Exclude<TApprovalDecision, 'user_done'>;

const GUARD_CHOICE_LIST: IChoice<TGuardChoiceValue>[] = [
  { value: 'user_do', label: '직접 누를게요' },
  { value: 'agent', label: '에이전트가 누르기' },
  { value: 'denied', label: '거부' },
];
/** 기본 강조·포커스 = 거부 — Enter 한 번으로 승인되지 않게 (spec 009 SR-1) */
const DENY_INDEX = GUARD_CHOICE_LIST.findIndex((choice) => choice.value === 'denied');

interface IGuardChoiceProps {
  isSending: boolean;
  onDecide: (decision: TApprovalDecision) => void;
}

/**
 * 가드 판정 승인의 세 선택 — 번호 선택 목록(기본 거부). [직접 누를게요]는 안내 + [계속](user_done)으로 바뀐다.
 */
export function GuardChoice({ isSending, onDecide }: IGuardChoiceProps) {
  const [isUserDoing, setIsUserDoing] = useState(false);

  const handleChoose = (value: TGuardChoiceValue) => {
    if (value === 'user_do') setIsUserDoing(true);
    else onDecide(value);
  };

  if (isUserDoing) return <UserDoneStep isSending={isSending} onContinue={() => onDecide('user_done')} />;
  return (
    <ChoiceList
      label="승인 선택"
      choiceList={GUARD_CHOICE_LIST}
      defaultIndex={DENY_INDEX}
      isDisabled={isSending}
      onChoose={handleChoose}
    />
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
      <p className="text-muted-foreground">{USER_DONE_GUIDE}</p>
      <div className="flex justify-end">
        <Button ref={continueRef} size="sm" disabled={isSending} onClick={onContinue}>
          계속
        </Button>
      </div>
    </div>
  );
}
