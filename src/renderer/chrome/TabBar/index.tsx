import { Plus } from 'lucide-react';

import type { TIpcResult } from '@shared/ipc/result';
import type { TTabState } from '@shared/ipc/tabs';

import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';

import { TabItem } from './TabItem';

interface ITabBarProps {
  tabList: TTabState[];
  activeTabId: string | null;
  onActivate: (tabId: string) => Promise<TIpcResult<null>>;
  onClose: (tabId: string) => Promise<TIpcResult<null>>;
  onCreate: () => Promise<TIpcResult<unknown>>;
}

/** 탭 줄 — 탭 목록(전환·닫기)과 바로 오른쪽의 ＋ 버튼. 조작 실패는 main 의 메시지로 toast */
export function TabBar({ tabList, activeTabId, onActivate, onClose, onCreate }: ITabBarProps) {
  return (
    <div className="flex h-9 shrink-0 items-end bg-muted pl-2">
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
        className="mb-0.5 ml-1 size-7 shrink-0 rounded-full p-0 text-muted-foreground"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
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
