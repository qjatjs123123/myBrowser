import { X } from 'lucide-react';

import type { TAgentActivity, TTabState } from '@shared/ipc/tabs';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { TabIcon } from './TabIcon';

interface ITabItemProps {
  tab: TTabState;
  isActive: boolean;
  /** 왼쪽 구분선 표시 여부 — 자신과 왼쪽 탭이 모두 비활성일 때만 */
  hasSeparator: boolean;
  onSelect: () => void;
  onClose: () => void;
}

/**
 * 탭 하나 — 이름이 제목뿐인 `role="tab"` 과 그 형제인 닫기 버튼 (상호작용 요소를 중첩하지 않는다).
 * hover 하면 자신과 오른쪽 탭의 구분선을 숨긴다.
 */
export function TabItem({ tab, isActive, hasSeparator, onSelect, onClose }: ITabItemProps) {
  return (
    <div
      className={cn(
        'group relative flex h-8 max-w-60 min-w-18 flex-[1_1_240px] items-center gap-1 rounded-t-lg pr-1.5 pl-3 text-xs [-webkit-app-region:no-drag]',
        'transition-colors [&:hover+*_[data-tab-separator]]:opacity-0',
        isActive ? 'bg-background text-foreground' : 'text-muted-foreground hover:bg-background/60',
      )}
    >
      <span
        data-tab-separator
        aria-hidden
        className={cn(
          'absolute top-1/2 left-0 h-4 w-px -translate-y-1/2 bg-border group-hover:opacity-0',
          !hasSeparator && 'opacity-0',
        )}
      />
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        aria-label={tab.title}
        title={tab.title}
        onClick={onSelect}
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <TabIcon faviconUrl={tab.faviconUrl} isLoading={tab.isLoading} />
        <span className="truncate">{tab.title}</span>
      </button>
      {tab.agentActivity && <AgentActivityDot activity={tab.agentActivity} />}
      <Button
        variant="ghost"
        aria-label={`${tab.title} 탭 닫기`}
        onClick={onClose}
        className={cn(
          'size-5 shrink-0 rounded-full p-0 text-muted-foreground hover:text-foreground',
          isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

/** 표시 이름 — 탭 이름(제목)과 별개인 형제 요소라 탭 접근 이름은 그대로다 (spec 021 FR-12) */
const AGENT_ACTIVITY_LABEL: Record<TAgentActivity, string> = {
  working: '에이전트 작업 중',
  waiting: '에이전트 응답 대기',
};

/** 에이전트가 이 탭에서 일하는 중(깜빡이는 점)·사용자 응답 대기(주황 점) */
function AgentActivityDot({ activity }: { activity: TAgentActivity }) {
  const label = AGENT_ACTIVITY_LABEL[activity];
  return (
    <span role="img" aria-label={label} title={label} className="flex size-4 shrink-0 items-center justify-center">
      <span
        className={cn(
          'size-2 rounded-full',
          activity === 'working' ? 'animate-pulse bg-muted-foreground' : 'bg-warning',
        )}
      />
    </span>
  );
}
