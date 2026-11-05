import { Ban, Check, CircleAlert, LoaderCircle, type LucideIcon } from 'lucide-react';

import type { TStep, TStepStatus } from '@shared/agent/run';

import { cn } from '@/lib/utils';

interface IStepStatusView {
  label: string;
  Icon: LucideIcon;
  className: string;
}

const STEP_STATUS_VIEW: Record<TStepStatus, IStepStatusView> = {
  running: { label: '진행 중', Icon: LoaderCircle, className: 'animate-spin text-muted-foreground' },
  ok: { label: '완료', Icon: Check, className: 'text-primary' },
  error: { label: '오류', Icon: CircleAlert, className: 'text-destructive' },
  blocked: { label: '차단됨', Icon: Ban, className: 'text-destructive' },
};

interface IStepRowProps {
  step: TStep;
}

/** 타임라인 한 줄 — 상태 아이콘(접근 이름 = 상태) + 요약 */
export function StepRow({ step }: IStepRowProps) {
  const { label, Icon, className } = STEP_STATUS_VIEW[step.status];
  return (
    <li className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm">
      <span role="img" aria-label={label} title={label} className="mt-0.5 flex shrink-0">
        <Icon aria-hidden className={cn('size-4', className)} />
      </span>
      <span className="min-w-0 break-words">{step.summary}</span>
    </li>
  );
}
