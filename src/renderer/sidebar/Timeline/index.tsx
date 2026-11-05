import type { TStep } from '@shared/agent/run';

import { StepRow } from './StepRow';

interface ITimelineProps {
  stepList: TStep[];
}

/** 진행 단계 목록 — 도구 호출 1회 = 한 줄 (요약은 main 이 만든 문장 그대로) */
export function Timeline({ stepList }: ITimelineProps) {
  return (
    <ol role="list" aria-label="진행 단계" className="flex flex-col gap-1">
      {stepList.map((step) => (
        <StepRow key={step.n} step={step} />
      ))}
    </ol>
  );
}
