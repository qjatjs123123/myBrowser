import { Plus } from 'lucide-react';
import type { PointerEvent, ReactNode } from 'react';

import type { TIpcResult } from '@shared/ipc/result';
import type { TTabState } from '@shared/ipc/tabs';

import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

import { TabItem } from './TabItem';

interface ITabBarProps {
  tabList: TTabState[];
  activeTabId: string | null;
  onActivate: (tabId: string) => Promise<TIpcResult<null>>;
  onClose: (tabId: string) => Promise<TIpcResult<null>>;
  onCreate: () => Promise<TIpcResult<unknown>>;
  /** 탭들 왼쪽 자리 — 창 신호등 (spec 010) */
  leading?: ReactNode;
  /** Linux — 빈 곳 끌기·더블클릭을 앱이 처리한다 (spec 016). 없으면 CSS 드래그 영역(OS 처리) */
  windowDrag?: ITabBarWindowDrag;
}

/** 탭 줄 빈 곳의 창 끌기·더블클릭 처리 (spec 016) */
export interface ITabBarWindowDrag {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
}

/** 여기서 시작한 누름은 클릭이다 — 창 끌기·더블클릭으로 쓰지 않는다 */
const INTERACTIVE_SELECTOR = '[role="tab"], button';

/**
 * 탭 줄 = 창 맨 윗줄 — [신호등] 탭 목록(전환·닫기) ＋ 버튼. 빈 곳을 끌면 창이 움직이고 탭·버튼은 클릭이다 —
 * macOS·Windows 는 CSS drag/no-drag(spec 010), Linux 는 windowDrag 로 앱이 처리하고 더블클릭은 최대화 토글(spec 016).
 * 조작 실패는 main 의 메시지로 toast
 */
export function TabBar({ tabList, activeTabId, onActivate, onClose, onCreate, leading, windowDrag }: ITabBarProps) {
  return (
    <div
      data-testid="window-top-bar"
      className={cn('flex h-9 shrink-0 items-end bg-muted pl-1', !windowDrag && '[-webkit-app-region:drag]')}
      onPointerDown={(event) => {
        if (windowDrag && !isInteractiveTarget(event.target)) windowDrag.onPointerDown(event);
      }}
      onDoubleClick={(event) => {
        if (windowDrag && !isInteractiveTarget(event.target)) windowDrag.onDoubleClick();
      }}
    >
      {leading && <div className="flex h-full items-center">{leading}</div>}
      <div role="tablist" aria-label="탭" className="flex min-w-0 items-end">
        {tabList.map((tab, index) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            hasSeparator={hasSeparatorBefore(tabList, index, activeTabId)}
            onSelect={() => void notifyFailure(onActivate(tab.id))}
            onClose={() => void notifyFailure(onClose(tab.id))}
          />
        ))}
      </div>
      <Button
        variant="ghost"
        aria-label="새 탭 열기"
        onClick={() => void notifyFailure(onCreate())}
        className="mb-0.5 ml-1 size-7 shrink-0 rounded-full p-0 text-muted-foreground [-webkit-app-region:no-drag]"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

/** 누른 곳이 탭·버튼 안인가 */
function isInteractiveTarget(target: EventTarget): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;
}

/** index 번째 탭 왼쪽에 구분선을 그릴지 — 첫 탭이 아니고 자신·왼쪽 탭이 모두 비활성일 때 */
function hasSeparatorBefore(tabList: TTabState[], index: number, activeTabId: string | null): boolean {
  if (index === 0) return false;
  return tabList[index]?.id !== activeTabId && tabList[index - 1]?.id !== activeTabId;
}

/** IPC 결과가 실패면 main 의 메시지를 toast 로 보여준다 */
async function notifyFailure(task: Promise<TIpcResult<unknown>>): Promise<void> {
  const result = await task;
  if (!result.ok) toast.error(result.error.message);
}
