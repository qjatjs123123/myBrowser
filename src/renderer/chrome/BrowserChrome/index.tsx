import { useEffect, useRef, useState } from 'react';

import { fail, type TIpcResult } from '@shared/ipc/result';
import type { TTabRequest } from '@shared/ipc/tabs';

import { AddressBar } from '@/chrome/AddressBar';
import { NavButtons } from '@/chrome/NavButtons';
import { NewTabPage } from '@/chrome/NewTabPage';
import { TabBar } from '@/chrome/TabBar';
import { useContentBounds } from '@/hooks/useContentBounds';
import { useShortcut } from '@/hooks/useShortcut';
import { useTabs } from '@/hooks/useTabs';
import { toast } from '@/lib/toast';

const NO_ACTIVE_TAB_MESSAGE = '탭을 찾을 수 없습니다';

/**
 * 브라우저 크롬 조립 — 탭 줄 + 툴바(탐색 버튼·주소창) + 탭 콘텐츠 영역.
 * 콘텐츠 영역의 사각형을 main 에 알리고(탭 View 가 그 자리에 그려진다), 활성 탭이 새 탭이면 그 안에 시작 화면을 그린다.
 */
export function BrowserChrome() {
  const tabs = useTabs();
  const contentRef = useRef<HTMLDivElement>(null);
  const [addressFocusSignal, setAddressFocusSignal] = useState(0);
  const [newTabFocusSignal, setNewTabFocusSignal] = useState(0);
  useContentBounds(contentRef);
  useShortcut((action) => {
    if (action === 'focusAddressBar') setAddressFocusSignal((signal) => signal + 1);
    else setNewTabFocusSignal((signal) => signal + 1);
  });
  useEffect(() => {
    if (tabs.listError) toast.error(tabs.listError.message);
  }, [tabs.listError]);

  const { activeTab } = tabs;
  const runOnActiveTab = (action: (req: TTabRequest) => Promise<TIpcResult<null>>) => () =>
    activeTab ? action({ tabId: activeTab.id }) : Promise.resolve(fail<null>('NOT_FOUND', NO_ACTIVE_TAB_MESSAGE));
  const navigate = (url: string) =>
    activeTab
      ? tabs.navigate({ tabId: activeTab.id, url })
      : Promise.resolve(fail<null>('NOT_FOUND', NO_ACTIVE_TAB_MESSAGE));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="shrink-0">
        <TabBar
          tabList={tabs.tabList}
          activeTabId={activeTab?.id ?? null}
          onActivate={(tabId) => tabs.activate({ tabId })}
          onClose={(tabId) => tabs.close({ tabId })}
          onCreate={() => tabs.create({})}
        />
        <div className="flex min-h-10 items-start gap-1 border-b border-border bg-background px-2 py-1">
          <NavButtons
            canGoBack={activeTab?.canGoBack ?? false}
            canGoForward={activeTab?.canGoForward ?? false}
            hasTarget={activeTab !== null}
            isLoading={activeTab?.isLoading ?? false}
            onGoBack={runOnActiveTab(tabs.goBack)}
            onGoForward={runOnActiveTab(tabs.goForward)}
            onReload={runOnActiveTab(tabs.reload)}
            onStop={runOnActiveTab(tabs.stop)}
          />
          {/* 탭을 바꾸면 편집 중이던 글자를 버린다 */}
          <AddressBar
            key={activeTab?.id ?? 'none'}
            url={activeTab && !activeTab.isNewTab ? activeTab.url : ''}
            isLoading={activeTab?.isLoading ?? false}
            isNewTab={activeTab?.isNewTab ?? true}
            focusSignal={addressFocusSignal}
            onNavigate={navigate}
          />
        </div>
      </header>
      <div ref={contentRef} role="region" aria-label="탭 콘텐츠" className="min-h-0 flex-1">
        {activeTab?.isNewTab && <NewTabPage key={activeTab.id} focusSignal={newTabFocusSignal} onNavigate={navigate} />}
      </div>
    </div>
  );
}
