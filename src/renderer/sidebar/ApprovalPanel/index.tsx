import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';

import type { TApprovalRequest } from '@shared/agent/run';

import type { TDecision } from '@/hooks/useAgentRun';

import { ApprovalDetail } from './ApprovalDetail';
import { GuardChoice } from './GuardChoice';
import { ModelChoice } from './ModelChoice';

interface IApprovalPanelProps {
  request: TApprovalRequest;
  /** 결정을 main 에 보낸다 — 실패 toast 는 호출부가. 창은 approval_resolved 이벤트로 닫힌다 */
  onDecide: (decision: TDecision) => Promise<void>;
}

/**
 * 사이드바 승인 창 — 실제 행동·대상·이유를 보여주고 사용자의 결정을 받는다 (FR-1·2·4).
 * 탭 View 가 renderer 위에 그려지므로 모달이 아니라 사이드바 안의 alertdialog 다. 열리면 [거부]에 포커스.
 * 요청이 바뀌면 호출부가 key={requestId} 로 다시 마운트해 단계(직접 누르기 안내)를 초기화한다.
 */
export function ApprovalPanel({ request, onDecide }: IApprovalPanelProps) {
  const [isSending, setIsSending] = useState(false);

  const handleDecide = async (decision: TDecision) => {
    setIsSending(true);
    await onDecide(decision);
    setIsSending(false);
  };

  return (
    <section
      role="alertdialog"
      aria-modal="false"
      aria-label="승인 필요"
      className="flex flex-col gap-3 rounded-xl border border-warning/60 bg-background p-3 text-sm shadow-sm"
    >
      <p className="flex items-center gap-1.5 font-semibold">
        <ShieldAlert aria-hidden className="size-4 text-warning" />
        승인 필요
      </p>
      <ApprovalDetail request={request} />
      {request.kind === 'guard' ? (
        <GuardChoice isSending={isSending} onDecide={(decision) => void handleDecide(decision)} />
      ) : (
        <ModelChoice isSending={isSending} onDecide={(decision) => void handleDecide(decision)} />
      )}
    </section>
  );
}
