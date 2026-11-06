import {
  Ban,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleStop,
  Hourglass,
  type LucideIcon,
  Sparkle,
} from 'lucide-react';
import { useState } from 'react';

import type { TRunStatus } from '@shared/agent/run';

import { isRunActive, type ITurn } from '@/hooks/useAgentRun';
import { cn } from '@/lib/utils';
import { RunResult } from '@/sidebar/RunResult';
import { Timeline } from '@/sidebar/Timeline';

import { CopyButton } from './CopyButton';

interface IAgentTurnProps {
  turn: ITurn;
  /** 처음 펼침 여부 — 현재 턴은 펼침, 지난 턴은 접힘 (호출부가 key 로 다시 마운트해 초기화) */
  isDefaultOpen: boolean;
}

/**
 * 에이전트 응답 한 턴 — `✻ N단계 ˅` 접기 헤더(타임라인) → 결과 문단 → 상태 문구·복사 줄 (spec 009 FR-2).
 */
export function AgentTurn({ turn, isDefaultOpen }: IAgentTurnProps) {
  const [isOpen, setIsOpen] = useState(isDefaultOpen);
  const isActive = isRunActive(turn.status);
  const hasStep = turn.stepList.length > 0;

  return (
    <article aria-label="에이전트 응답" className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={isOpen}
        disabled={!hasStep}
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground"
      >
        <Sparkle aria-hidden className={cn('size-3.5 text-brand', isActive && 'animate-pulse')} />
        {toHeaderText(turn.stepList.length, isActive)}
        {hasStep && (
          <ChevronDown
            aria-hidden
            className={cn('size-3.5 transition-transform duration-150', isOpen && 'rotate-180')}
          />
        )}
      </button>
      {isOpen && hasStep && (
        <div className="ml-2 border-l border-border pl-1">
          <Timeline stepList={turn.stepList} />
        </div>
      )}
      {turn.result && <RunResult result={turn.result} />}
      <TurnFooter status={turn.status} resultText={turn.result?.text ?? null} />
    </article>
  );
}

/** 접기 헤더 문구 — 단계 수, 아직 없으면 실행 중/없음 */
function toHeaderText(stepCount: number, isActive: boolean): string {
  if (stepCount > 0) return `${stepCount}단계`;
  return isActive ? '생각 중…' : '단계 없음';
}

interface IStatusView {
  label: string;
  Icon: LucideIcon;
  className: string;
}

/** 턴 아래 줄의 상태 문구 — 실행 중(queued·running)은 헤더 애니메이션으로 충분해 표시하지 않는다 */
const STATUS_VIEW: Partial<Record<TRunStatus, IStatusView>> = {
  waiting_user: { label: '확인 대기', Icon: Hourglass, className: 'text-warning' },
  done: { label: '완료', Icon: CircleCheck, className: 'text-muted-foreground' },
  failed: { label: '실패', Icon: CircleAlert, className: 'text-destructive' },
  stopped: { label: '중지됨', Icon: Ban, className: 'text-muted-foreground' },
  stopped_before_confirm: { label: '확정 직전 정지', Icon: CircleStop, className: 'text-warning' },
};

interface ITurnFooterProps {
  status: TRunStatus | null;
  resultText: string | null;
}

/** 상태 문구 + 결과 복사 */
function TurnFooter({ status, resultText }: ITurnFooterProps) {
  const view = status ? STATUS_VIEW[status] : undefined;
  if (!view && resultText === null) return null;
  return (
    <div className="flex items-center gap-1 text-xs">
      {view && (
        <span className={cn('flex items-center gap-1', view.className)}>
          <view.Icon aria-hidden className="size-3.5" />
          {view.label}
        </span>
      )}
      {resultText !== null && <CopyButton text={resultText} label="결과 복사" />}
    </div>
  );
}
