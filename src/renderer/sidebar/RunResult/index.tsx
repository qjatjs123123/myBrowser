import { CircleAlert, CircleCheck, CircleStop, type LucideIcon, TriangleAlert } from 'lucide-react';

import type { IRunResult } from '@/hooks/useAgentRun';
import { cn } from '@/lib/utils';

interface IResultView {
  title: string;
  Icon: LucideIcon;
  className: string;
}

/** 종료 종류별 톤 — 가드 정지는 --warning(사용자 확인 필요), 실패는 destructive 글자 */
const RESULT_VIEW: Record<IRunResult['kind'], IResultView> = {
  done: { title: '결과', Icon: CircleCheck, className: 'border-border bg-muted text-foreground' },
  failed: { title: '실패 이유', Icon: CircleAlert, className: 'border-destructive/40 text-destructive' },
  stopped: { title: '중지', Icon: CircleStop, className: 'border-border text-muted-foreground' },
  guard_stopped: {
    title: '직접 확인 필요',
    Icon: TriangleAlert,
    className: 'border-warning bg-warning/10 text-foreground',
  },
};

interface IRunResultProps {
  result: IRunResult;
}

/** run 종료 결과 — FR-5 문구를 종료 종류별 톤으로 보여준다 */
export function RunResult({ result }: IRunResultProps) {
  const { title, Icon, className } = RESULT_VIEW[result.kind];
  return (
    <section aria-label="실행 결과" className={cn('flex gap-2 rounded-md border p-3 text-sm', className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-semibold">{title}</p>
        <p className="break-words whitespace-pre-wrap">{result.text}</p>
      </div>
    </section>
  );
}
