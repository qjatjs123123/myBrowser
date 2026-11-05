import { useEffect, useState } from 'react';

import type { IApi, TUnsubscribe } from '@shared/ipc/api';
import type { IIpcError } from '@shared/ipc/result';
import type { TTabsSnapshot, TTabState } from '@shared/ipc/tabs';

import { getApi } from '@/lib/api';

/** 탭 목록을 처음 불러오지 못한 이유 — 화면에 보일 message 포함 */
export type TTabsListError = Pick<IIpcError, 'code' | 'message'>;

type TTabActions = Omit<IApi['tabs'], 'list' | 'setBounds' | 'onChanged'>;

const EMPTY_SNAPSHOT: TTabsSnapshot = { tabList: [], activeTabId: null };
const LIST_FAILED_ERROR: TTabsListError = { code: 'INTERNAL', message: '탭 목록을 불러오지 못했습니다' };

/** 탭 조작 — window.api.tabs 의 결과 봉투를 그대로 돌려준다 (toast 는 호출한 컴포넌트가) */
const TAB_ACTIONS: TTabActions = {
  create: (req) => getApi().tabs.create(req),
  close: (req) => getApi().tabs.close(req),
  activate: (req) => getApi().tabs.activate(req),
  navigate: (req) => getApi().tabs.navigate(req),
  goBack: (req) => getApi().tabs.goBack(req),
  goForward: (req) => getApi().tabs.goForward(req),
  reload: (req) => getApi().tabs.reload(req),
  stop: (req) => getApi().tabs.stop(req),
};

/**
 * [탭 목록] main 이 단일 출처 — 마운트 시 tabs:list 로 받고 tabs:changed 로 갱신한다.
 * list 실패는 throw 하지 않고 listError 로 돌려준다 (BrowserChrome 이 toast).
 */
export function useTabs() {
  const [snapshot, setSnapshot] = useState<TTabsSnapshot>(EMPTY_SNAPSHOT);
  const [listError, setListError] = useState<TTabsListError | null>(null);

  useEffect(() => subscribeTabs({ onSnapshot: setSnapshot, onListError: setListError }), []);

  const activeTab = findActiveTab(snapshot);
  return { tabList: snapshot.tabList, activeTab, listError, ...TAB_ACTIONS };
}

/** tabs:changed 를 구독하고 첫 목록을 불러온다 — 목록보다 이벤트가 먼저 오면 이벤트가 더 새 상태라 늦은 목록은 버린다 */
function subscribeTabs(handlers: {
  onSnapshot: (snapshot: TTabsSnapshot) => void;
  onListError: (error: TTabsListError) => void;
}): TUnsubscribe {
  let isListStale = false;
  const unsubscribe = getApi().tabs.onChanged((event) => {
    isListStale = true;
    handlers.onSnapshot(event);
  });
  getApi()
    .tabs.list()
    .then((result) => {
      if (isListStale) return;
      if (result.ok) handlers.onSnapshot(result.data);
      else handlers.onListError({ code: result.error.code, message: result.error.message });
    })
    .catch(() => {
      if (!isListStale) handlers.onListError(LIST_FAILED_ERROR);
    });
  return () => {
    isListStale = true;
    unsubscribe();
  };
}

/** 활성 탭 id 에 해당하는 탭 — 없으면 null */
function findActiveTab(snapshot: TTabsSnapshot): TTabState | null {
  return snapshot.tabList.find((tab) => tab.id === snapshot.activeTabId) ?? null;
}
