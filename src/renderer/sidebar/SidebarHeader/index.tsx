import { History, Plus, X } from 'lucide-react';

import type { TRunStatus } from '@shared/agent/run';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { StatusBadge } from './StatusBadge';

interface ISidebarHeaderProps {
  status: TRunStatus | null;
  /** 실행·대기 중이 아니고 비울 대화가 있을 때만 */
  canReset: boolean;
  onReset: () => void;
  /** 대화 자리에 실행 기록이 보이는 중인가 (spec 012 FR-1) */
  isHistoryOpen: boolean;
  /** [실행 기록] — 대화 ↔ 기록 전환 */
  onToggleHistory: () => void;
  /** 패널 닫기 (spec 011 FR-3) */
  onClose: () => void;
}

/** 패널 맨 위 줄 — 제목 + 현재 상태 배지 + [실행 기록] + [새 대화] + [사이드바 닫기] (spec 009 FR-4·5, spec 011 FR-3·8, spec 012 FR-1) */
export function SidebarHeader({
  status,
  canReset,
  onReset,
  isHistoryOpen,
  onToggleHistory,
  onClose,
}: ISidebarHeaderProps) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
      <h2 className="text-sm font-semibold">에이전트</h2>
      <StatusBadge status={status} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="실행 기록"
        aria-pressed={isHistoryOpen}
        title="실행 기록"
        onClick={onToggleHistory}
        className={cn('ml-auto text-muted-foreground', isHistoryOpen && 'bg-muted text-foreground')}
      >
        <History />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="새 대화"
        title="새 대화"
        disabled={!canReset}
        onClick={onReset}
        className="text-muted-foreground"
      >
        <Plus />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="사이드바 닫기"
        title="닫기"
        onClick={onClose}
        className="text-muted-foreground"
      >
        <X />
      </Button>
    </header>
  );
}
