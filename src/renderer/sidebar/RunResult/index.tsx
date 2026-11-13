import type { IRunResult } from '@/hooks/useAgentRun';
import { cn } from '@/lib/utils';

/** 종료 종류별 글자 톤 — 실패만 destructive (상태 문구는 턴 아래 줄이 보여준다) */
const RESULT_TEXT_CLASS: Record<IRunResult['kind'], string> = {
  done: 'text-foreground',
  failed: 'text-destructive',
  stopped: 'text-muted-foreground',
};

interface IRunResultProps {
  result: IRunResult;
}

/** run 종료 결과 — 대화 본문처럼 ● 점 + 문단 (spec 009 FR-2) */
export function RunResult({ result }: IRunResultProps) {
  return (
    <section aria-label="실행 결과" className="flex gap-2.5 text-sm leading-relaxed">
      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
      <p className={cn('min-w-0 break-words whitespace-pre-wrap', RESULT_TEXT_CLASS[result.kind])}>{result.text}</p>
    </section>
  );
}
