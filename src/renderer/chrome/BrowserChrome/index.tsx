import { type ReactNode, useEffect, useRef, useState } from 'react';

import { fail, type TIpcResult } from '@shared/ipc/result';
import type { TTabRequest } from '@shared/ipc/tabs';

import { AddressBar } from '@/chrome/AddressBar';
import { BookmarkButton } from '@/chrome/BookmarkButton';
import { FindBar } from '@/chrome/FindBar';
import { NavButtons } from '@/chrome/NavButtons';
import { NewTabPage } from '@/chrome/NewTabPage';
import { type ITabBarWindowDrag, TabBar } from '@/chrome/TabBar';
import { WindowControls } from '@/chrome/WindowControls';
import { ZoomBadge } from '@/chrome/ZoomBadge';
import { useBookmarks } from '@/hooks/useBookmarks';
import { useContentBounds } from '@/hooks/useContentBounds';
import { useFindInPage } from '@/hooks/useFindInPage';
import { useShortcut } from '@/hooks/useShortcut';
import { useTabs } from '@/hooks/useTabs';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { isMacPlatform } from '@/utils/platform';

const NO_ACTIVE_TAB_MESSAGE = '탭을 찾을 수 없습니다';
const IS_MAC = isMacPlatform(navigator.userAgent);

/** 새 탭 화면에서 어느 입력에 포커스할지 — 마지막 요청만 (Ctrl+T = 검색, Ctrl+H = 방문 기록) */
interface INewTabFocus {
  target: 'search' | 'history';
  signal: number;
}

interface IBrowserChromeProps {
  /** 툴바 오른쪽 끝 — [에이전트] 버튼 (spec 011) */
  toolbarEnd?: ReactNode;
  /** 탭 콘텐츠 오른쪽 패널 — 에이전트 사이드바 (탭 줄·툴바는 그 위로 창 전체 폭) */
  sidePanel?: ReactNode;
  /** Linux — 탭 줄 빈 곳 끌기·더블클릭을 앱이 처리한다 (spec 016) */
  windowDrag?: ITabBarWindowDrag;
  /** Linux 이고 최대화가 아님 — 탭 View 를 창 가장자리에서 4px 안쪽에 둬 크기 조절 손잡이가 마우스를 받게 한다 (spec 016 FR-5) */
  hasEdgeInset?: boolean;
}

/**
 * 브라우저 크롬 조립 — 탭 줄 + 툴바(탐색 버튼·주소창·끝 slot) + [탭 콘텐츠 영역 | 옆 패널].
 * 콘텐츠 영역의 사각형을 main 에 알리고(탭 View 가 그 자리에 그려진다), 활성 탭이 새 탭이면 그 안에 시작 화면을 그린다.
 * 주소창 옆 배율·북마크 버튼, 툴바 아래 찾기 줄(콘텐츠 영역 밖 — 탭 View 가 DOM 위에 그려진다) (spec 021).
 */
export function BrowserChrome({ toolbarEnd, sidePanel, windowDrag, hasEdgeInset = false }: IBrowserChromeProps) {
  const tabs = useTabs();
  const contentRef = useRef<HTMLDivElement>(null);
  const [addressFocusSignal, setAddressFocusSignal] = useState(0);
  const [newTabFocus, setNewTabFocus] = useState<INewTabFocus>({ target: 'search', signal: 0 });
  const { activeTab } = tabs;
  const pageTab = activeTab && !activeTab.isNewTab ? activeTab : null;
  const bookmarks = useBookmarks();
  const find = useFindInPage(pageTab);
  useContentBounds(contentRef);
  const toggleBookmark = () => {
    if (pageTab) void notifyFailure(bookmarks.toggle({ url: pageTab.url, title: pageTab.title }));
  };
  const focusNewTab = (target: INewTabFocus['target']) =>
    setNewTabFocus((focus) => ({ target, signal: focus.signal + 1 }));
  useShortcut((action) => {
    // 크롬은 포커스·찾기·북마크만 다룬다 — toggleSidebar 등 다른 동작은 App 이 받는다
    if (action === 'focusAddressBar') setAddressFocusSignal((signal) => signal + 1);
    if (action === 'focusNewTabSearch') focusNewTab('search');
    if (action === 'focusHistorySearch') focusNewTab('history');
    if (action === 'openFindBar') find.open();
    if (action === 'toggleBookmark') toggleBookmark();
  });
  useEffect(() => {
    if (tabs.listError) toast.error(tabs.listError.message);
  }, [tabs.listError]);
  useEffect(() => {
    if (bookmarks.loadError) toast.error(bookmarks.loadError);
  }, [bookmarks.loadError]);

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
          leading={<WindowControls isMac={IS_MAC} />}
          windowDrag={windowDrag}
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
          <div className="flex h-8 shrink-0 items-center gap-0.5">
            {pageTab && (
              <ZoomBadge
                zoomPercent={pageTab.zoomPercent}
                onReset={() => void notifyFailure(tabs.zoom({ tabId: pageTab.id, direction: 'reset' }))}
              />
            )}
            <BookmarkButton
              isBookmarked={pageTab !== null && bookmarks.isBookmarked(pageTab.url)}
              isDisabled={pageTab === null}
              onToggle={toggleBookmark}
            />
          </div>
          {toolbarEnd && <div className="flex h-8 shrink-0 items-center">{toolbarEnd}</div>}
        </div>
        {find.isOpen && (
          <FindBar
            text={find.text}
            count={find.count}
            focusSignal={find.focusSignal}
            onSearch={find.search}
            onNext={find.next}
            onPrev={find.prev}
            onClose={find.close}
          />
        )}
      </header>
      {/* 사이드바가 닫혀 있으면 오른쪽 가장자리도 탭 View 가 닿으므로 오른쪽 여백까지 */}
      <div
        data-testid="tab-content-row"
        className={cn('flex min-h-0 flex-1', hasEdgeInset && 'pb-1 pl-1 has-[>aside[hidden]]:pr-1')}
      >
        <div ref={contentRef} role="region" aria-label="탭 콘텐츠" className="min-h-0 min-w-0 flex-1">
          {activeTab?.isNewTab && (
            <NewTabPage
              key={activeTab.id}
              focusSignal={newTabFocus.target === 'search' ? newTabFocus.signal : 0}
              historyFocusSignal={newTabFocus.target === 'history' ? newTabFocus.signal : 0}
              bookmarkList={bookmarks.bookmarkList}
              onNavigate={navigate}
            />
          )}
        </div>
        {sidePanel}
      </div>
    </div>
  );
}

/** IPC 결과가 실패면 main 의 메시지를 toast 로 보여준다 */
async function notifyFailure(task: Promise<TIpcResult<unknown>>): Promise<void> {
  const result = await task;
  if (!result.ok) toast.error(result.error.message);
}
