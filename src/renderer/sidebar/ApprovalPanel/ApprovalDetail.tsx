import type { TApprovalRequest } from '@shared/agent/run';

interface IApprovalDetailProps {
  request: TApprovalRequest;
}

/**
 * 승인 창 본문 — display 는 이벤트에 온 실제 값 그대로(SR-3), 모델 문장(modelNote)은 “에이전트 설명” 칸에만.
 * kind=model 의 빈 target 은 칸째 숨긴다.
 */
export function ApprovalDetail({ request }: IApprovalDetailProps) {
  const { display, reason, modelNote } = request;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <DetailRow label="행동" value={display.action} />
      {display.target !== '' && <DetailRow label="대상" value={display.target} />}
      <DetailRow label="이유" value={reason} />
      {modelNote !== null && <DetailRow label="에이전트 설명" value={modelNote} />}
    </dl>
  );
}

interface IDetailRowProps {
  label: string;
  value: string;
}

/** 라벨·값 한 줄 — 값은 줄바꿈·긴 URL 을 그대로 보이게 감싼다 */
function DetailRow({ label, value }: IDetailRowProps) {
  return (
    <>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words whitespace-pre-wrap">{value}</dd>
    </>
  );
}
