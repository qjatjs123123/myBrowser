import type { TAgentActivity, TFindUpdatedEvent, TTabState, TTabsSnapshot, TZoomDirection } from '@shared/ipc/tabs';

import type { ITabFindOptions, ITabHost, ITabRect, ITabView, TTabViewFactory } from './tabType';
import { isAllowedTabUrl } from './urlPolicy';
import { getNextZoomPercent } from './zoom';

const NEW_TAB_URL = 'about:blank';
const NEW_TAB_TITLE = '새 탭';
const HTTP_URL_PATTERN = /^https?:\/\//;

/** 에이전트가 일하는 탭 하나 — 표시용 (spec 021 SR-4) */
interface IAgentMark {
  tabId: string;
  activity: TAgentActivity;
}

/** 로드가 끝난 http(s) 페이지 — 방문 기록용 */
export interface ITabPageLoaded {
  tabId: string;
  url: string;
  title: string;
}

interface ITabEntry {
  id: string;
  view: ITabView;
}

export interface ITabManagerOptions {
  host: ITabHost;
  createView: TTabViewFactory;
  /** 생성·닫기·전환·View 상태 변경마다 전체 스냅샷으로 호출된다 */
  onChanged: (snapshot: TTabsSnapshot) => void;
  createId?: () => string;
  /** http(s) 메인 프레임 로드가 끝날 때마다 (spec 021 FR-4) */
  onPageLoaded?: (page: ITabPageLoaded) => void;
  /** 페이지 내 찾기 결과 */
  onFindUpdated?: (event: TFindUpdatedEvent) => void;
}

/**
 * [탭 관리자] WebContentsView 의 생성·전환·닫기·bounds 를 전담하고 탭 상태의 단일 출처가 된다.
 * 규칙: .claude/rules/electron/main.md 「탭」 — electron 은 ITabView·ITabHost 뒤에 숨긴다
 */
export class TabManager {
  private readonly entryList: ITabEntry[] = [];
  private activeTabId: string | null = null;
  private bounds: ITabRect | null = null;
  private cornerRadius = 0;
  private agentMark: IAgentMark | null = null;
  private readonly createId: () => string;

  constructor(private readonly options: ITabManagerOptions) {
    this.createId = options.createId ?? createCounterId();
  }

  /** 탭을 만들어 활성화한다 — url 이 없거나 허용되지 않으면 새 탭(about:blank) */
  createTab(url?: string): string {
    const id = this.createId();
    const view = this.options.createView();
    view.setBorderRadius(this.cornerRadius);
    view.onStateChanged(() => this.refresh());
    view.onOpenWindow((popupUrl) => this.handleOpenWindow(popupUrl));
    this.attachPageEvents(id, view);
    this.entryList.push({ id, view });
    this.options.host.addChildView(view.nativeView);
    this.activeTabId = id;
    view.load(url !== undefined && isAllowedTabUrl(url) ? url : NEW_TAB_URL);
    this.refresh();
    return id;
  }

  /** 탭을 닫는다 — 활성 탭이면 오른쪽→왼쪽 이웃을 활성, 마지막 탭이면 새 탭 1개를 연다 */
  closeTab(id: string): void {
    const index = this.entryList.findIndex((entry) => entry.id === id);
    const entry = this.entryList[index];
    if (!entry) return;
    this.entryList.splice(index, 1);
    this.options.host.removeChildView(entry.view.nativeView);
    entry.view.destroy();
    if (this.agentMark?.tabId === id) this.agentMark = null;
    if (this.activeTabId === id) {
      this.activeTabId = (this.entryList[index] ?? this.entryList[index - 1])?.id ?? null;
    }
    if (this.entryList.length === 0) this.createTab();
    else this.refresh();
  }

  /** 탭을 활성화한다 (없는 id 는 무시) */
  activateTab(id: string): void {
    if (!this.hasTab(id)) return;
    this.activeTabId = id;
    this.refresh();
  }

  /** 활성 탭에서 delta 만큼 떨어진 탭으로 순환 전환한다 (+1 다음, -1 이전) */
  cycleTab(delta: 1 | -1): void {
    const count = this.entryList.length;
    if (count === 0) return;
    const index = this.entryList.findIndex((entry) => entry.id === this.activeTabId);
    const next = this.entryList[(index + delta + count) % count];
    if (next) this.activateTab(next.id);
  }

  /** 탭을 url 로 이동한다 — 정책 밖 url 은 무시 (SR-2, 핸들러 검증의 이중 방어) */
  navigate(id: string, url: string): void {
    if (!isAllowedTabUrl(url)) return;
    this.findView(id)?.load(url);
  }

  goBack(id: string): void {
    this.findView(id)?.goBack();
  }

  goForward(id: string): void {
    this.findView(id)?.goForward();
  }

  reload(id: string): void {
    this.findView(id)?.reload();
  }

  stop(id: string): void {
    this.findView(id)?.stop();
  }

  /** 배율을 한 단계 움직인다 — 같은 호스트 탭도 바뀌므로 전체 스냅샷을 다시 보낸다 (spec 021 FR-10) */
  zoom(id: string, direction: TZoomDirection): void {
    const view = this.findView(id);
    if (!view) return;
    view.setZoomPercent(getNextZoomPercent(view.getState().zoomPercent, direction));
    this.refresh();
  }

  /** 페이지 내 찾기 — 결과는 onFindUpdated 로 (FR-8) */
  find(id: string, text: string, options: ITabFindOptions): void {
    this.findView(id)?.findInPage(text, options);
  }

  stopFind(id: string): void {
    this.findView(id)?.stopFindInPage();
  }

  /** 에이전트 표시 — 한 번에 한 탭만, null 이면 지운다 (FR-12). 없는 탭이면 지운다 */
  setAgentActivity(id: string | null, activity: TAgentActivity | null): void {
    const next = id !== null && activity !== null && this.hasTab(id) ? { tabId: id, activity } : null;
    if (next?.tabId === this.agentMark?.tabId && next?.activity === this.agentMark?.activity) return;
    this.agentMark = next;
    this.refresh();
  }

  /** 콘텐츠 영역 rect 를 기억하고 활성 View 에 적용한다 — 이후 전환에도 다시 적용된다 */
  setBounds(rect: ITabRect): void {
    this.bounds = rect;
    this.applyVisibility();
  }

  /** 모든 탭 View 의 모서리 반지름 — 이후 만드는 탭에도 적용한다 (spec 014: Linux 둥근 창, 최대화 시 0) */
  setCornerRadius(radius: number): void {
    this.cornerRadius = radius;
    for (const entry of this.entryList) entry.view.setBorderRadius(radius);
  }

  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  /** 탭의 CDP targetId — 없는 탭이면 null (에이전트의 탭 ↔ Page 매핑용) */
  async getCdpTargetId(id: string): Promise<string | null> {
    const view = this.findView(id);
    return view ? view.getCdpTargetId() : null;
  }

  hasTab(id: string): boolean {
    return this.entryList.some((entry) => entry.id === id);
  }

  /** renderer 로 보낼 전체 탭 목록 — isNewTab·'새 탭' 제목을 여기서 계산한다 */
  getSnapshot(): TTabsSnapshot {
    return {
      tabList: this.entryList.map((entry) => toTabState(entry, this.agentMark)),
      activeTabId: this.activeTabId,
    };
  }

  private findView(id: string): ITabView | undefined {
    return this.entryList.find((entry) => entry.id === id)?.view;
  }

  /** 찾기 결과·로드 완료(http(s) 만 — SR-3)·Ctrl+휠을 이 탭 id 로 옮긴다 */
  private attachPageEvents(id: string, view: ITabView): void {
    view.onFindUpdated((result) => this.options.onFindUpdated?.({ tabId: id, ...result }));
    view.onPageLoaded((page) => {
      if (HTTP_URL_PATTERN.test(page.url)) this.options.onPageLoaded?.({ tabId: id, ...page });
    });
    view.onZoomWheel((direction) => this.zoom(id, direction));
  }

  private handleOpenWindow(url: string): void {
    if (isAllowedTabUrl(url) && url !== NEW_TAB_URL) this.createTab(url);
  }

  private refresh(): void {
    this.applyVisibility();
    this.options.onChanged(this.getSnapshot());
  }

  /** 활성이면서 새 탭이 아닌 View 만 보이고 bounds 를 받는다 — 새 탭은 renderer 의 시작 화면이 대신 그린다 */
  private applyVisibility(): void {
    for (const { id, view } of this.entryList) {
      const isVisible = id === this.activeTabId && !isNewTabUrl(view.getState().url);
      if (isVisible && this.bounds) view.setBounds(this.bounds);
      view.setVisible(isVisible);
    }
  }
}

function createCounterId(): () => string {
  let count = 0;
  return () => `tab-${++count}`;
}

function isNewTabUrl(url: string): boolean {
  return url === '' || url === NEW_TAB_URL;
}

function toTabState({ id, view }: ITabEntry, agentMark: IAgentMark | null): TTabState {
  const state = view.getState();
  const isNewTab = isNewTabUrl(state.url);
  const title = isNewTab ? NEW_TAB_TITLE : state.title || state.url;
  const agentActivity = agentMark?.tabId === id ? agentMark.activity : null;
  return { id, ...state, title, isNewTab, agentActivity };
}
