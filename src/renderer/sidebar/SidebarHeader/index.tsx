import { Plus } from 'lucide-react';

import type { TRunStatus } from '@shared/agent/run';

import { Button } from '@/components/ui/button';

import { StatusBadge } from './StatusBadge';

interface ISidebarHeaderProps {
  status: TRunStatus | null;
  /** 실행·대기 중이 아니고 비울 대화가 있을 때만 */
  canReset: boolean;
  onReset: () => void;
}

/** 사이드바 맨 위 줄 — 제목 + 현재 상태 배지 + [새 대화] (spec 009 FR-4·5). 탭 줄과 같은 36px·bg-muted 드래그 줄 (spec 010) */
export function SidebarHeader({ status, canReset, onReset }: ISidebarHeaderProps) {
  return (
    <header className="flex h-9 shrink-0 items-center gap-2 bg-muted px-3 [-webkit-app-region:drag]">
      <h2 className="text-sm font-semibold">에이전트</h2>
      <span className="flex [-webkit-app-region:no-drag]">
        <StatusBadge status={status} />
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="새 대화"
        title="새 대화"
        disabled={!canReset}
        onClick={onReset}
        className="ml-auto size-7 text-muted-foreground [-webkit-app-region:no-drag]"
      >
        <Plus />
      </Button>
    </header>
  );
}
