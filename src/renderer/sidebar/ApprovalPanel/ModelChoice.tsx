import type { TModelApprovalDecision } from '@shared/agent/run';

import { ChoiceList, type IChoice } from '@/sidebar/ChoiceList';

const MODEL_CHOICE_LIST: IChoice<TModelApprovalDecision>[] = [
  { value: 'approved', label: '승인' },
  { value: 'denied', label: '거부' },
];
/** 기본 강조·포커스 = 거부 — Enter 한 번으로 승인되지 않게 (spec 009 SR-1) */
const DENY_INDEX = MODEL_CHOICE_LIST.findIndex((choice) => choice.value === 'denied');

interface IModelChoiceProps {
  isSending: boolean;
  onDecide: (decision: TModelApprovalDecision) => void;
}

/** 모델의 request_approval — 실행할 구체 행동이 없어 [승인]/[거부] 두 줄만. 번호 선택 목록, 기본 거부 */
export function ModelChoice({ isSending, onDecide }: IModelChoiceProps) {
  return (
    <ChoiceList
      label="승인 선택"
      choiceList={MODEL_CHOICE_LIST}
      defaultIndex={DENY_INDEX}
      isDisabled={isSending}
      onChoose={onDecide}
    />
  );
}
