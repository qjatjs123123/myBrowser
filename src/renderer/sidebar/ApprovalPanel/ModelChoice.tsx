import { useEffect, useRef } from 'react';

import type { TModelApprovalDecision } from '@shared/agent/run';

import { Button } from '@/components/ui/button';

interface IModelChoiceProps {
  isSending: boolean;
  onDecide: (decision: TModelApprovalDecision) => void;
}

/** 모델의 request_approval — 실행할 구체 행동이 없어 [승인]/[거부] 두 버튼만. 마운트 시 [거부]에 포커스 */
export function ModelChoice({ isSending, onDecide }: IModelChoiceProps) {
  const denyRef = useRef<HTMLButtonElement>(null);
  useEffect(() => denyRef.current?.focus(), []);
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={isSending} onClick={() => onDecide('approved')}>
        승인
      </Button>
      <Button ref={denyRef} size="sm" variant="outline" disabled={isSending} onClick={() => onDecide('denied')}>
        거부
      </Button>
    </div>
  );
}
