import type { TTabState, TTabsSnapshot } from '@shared/ipc/tabs';

import type { ITabHost, ITabRect, ITabView, TTabViewFactory } from './tabType';
import { isAllowedTabUrl } from './urlPolicy';

const NEW_TAB_URL = 'about:blank';
const NEW_TAB_TITLE = '새 탭';

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
}

/**
 * [탭 관리자] WebContentsView 의 생성·전환·닫기·bounds 를 전담하고 탭 상태의 단일 출처가 된다.
 * 규칙: .claude/rules/electron/main.md 「탭」 — electron 은 ITabView·ITabHost 뒤에 숨긴다
 */
export class TabManager {
  private readonly entryList: ITabEntry[] = [];
  private activeTabId: string | null = null;
  private bounds: ITabRect | null = null;
  private readonly createId: () => string;

  constructor(private readonly options: ITabManagerOptions) {
    this.createId = options.createId ?? createCounterId();
  }

  /** 탭을 만들어 활성화한다 — url 이 없거나 허용되지 않으면 새 탭(about:blank) */
  createTab(url?: string): string {
    const id = this.createId();
    const view = this.options.createView();
    view.onStateChanged(() => this.refresh());
    view.onOpenWindow((popupUrl) => this.handleOpenWindow(popupUrl));
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

  /** 콘텐츠 영역 rect 를 기억하고 활성 View 에 적용한다 — 이후 전환에도 다시 적용된다 */
  setBounds(rect: ITabRect): void {
    this.bounds = rect;
    this.applyVisibility();
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
      tabList: this.entryList.map((entry) => toTabState(entry)),
      activeTabId: this.activeTabId,
    };
  }

  private findView(id: string): ITabView | undefined {
    return this.entryList.find((entry) => entry.id === id)?.view;
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

function toTabState({ id, view }: ITabEntry): TTabState {
  const state = view.getState();
  const isNewTab = isNewTabUrl(state.url);
  const title = isNewTab ? NEW_TAB_TITLE : state.title || state.url;
  return { id, ...state, title, isNewTab };
}
