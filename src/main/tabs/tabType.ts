/** [탭] View 가 위치할 창 기준 사각형 — renderer 콘텐츠 영역의 rect */
export interface ITabRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** [탭] View 가 보고하는 현재 페이지 상태 — TabManager 가 id·isNewTab·제목 규칙을 덧붙여 스냅샷을 만든다 */
export interface ITabViewState {
  url: string;
  title: string;
  faviconUrl: string | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** 확대/축소 배율(%) — 같은 호스트 탭끼리 공유된다 (spec 021) */
  zoomPercent: number;
}

/** [탭] 페이지 내 찾기 결과 — found-in-page 의 마지막 갱신 */
export interface ITabFindResult {
  activeMatch: number;
  matchCount: number;
}

/** [탭] 페이지 내 찾기 옵션 — isNext=false 면 새 검색 */
export interface ITabFindOptions {
  isForward: boolean;
  isNext: boolean;
}

/**
 * [탭 View] TabManager 가 electron 없이 테스트되도록 WebContentsView 를 감싼 인터페이스.
 * 실제 구현은 electronTabView.ts — 테스트는 가짜를 주입한다.
 */
export interface ITabView {
  load(url: string): void;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stop(): void;
  getState(): ITabViewState;
  /** 로딩·이동·제목·파비콘이 바뀔 때마다 호출된다 */
  onStateChanged(cb: () => void): void;
  /** 페이지가 팝업(target=_blank·window.open)을 열려고 할 때 대상 url 로 호출된다 */
  onOpenWindow(cb: (url: string) => void): void;
  /** 확대/축소 배율(%) 적용 */
  setZoomPercent(percent: number): void;
  findInPage(text: string, options: ITabFindOptions): void;
  /** 찾기 끝 — 강조를 지운다 */
  stopFindInPage(): void;
  onFindUpdated(cb: (result: ITabFindResult) => void): void;
  /** 메인 프레임 로드가 끝날 때마다 — 방문 기록용 (spec 021 FR-4) */
  onPageLoaded(cb: (page: { url: string; title: string }) => void): void;
  /** Ctrl+마우스 휠 — 위면 in, 아래면 out */
  onZoomWheel(cb: (direction: 'in' | 'out') => void): void;
  setBounds(rect: ITabRect): void;
  setVisible(isVisible: boolean): void;
  /** 모서리 반지름(px) — Linux 둥근 창의 모서리에 맞춘다 (spec 014). View 의 네 모서리가 같이 깎인다 */
  setBorderRadius(radius: number): void;
  focus(): void;
  destroy(): void;
  /** 이 탭의 CDP targetId — playwright 의 Page 를 찾는 열쇠 (spec 003 「탭 ↔ Page 매핑」). 탭당 캐시 */
  getCdpTargetId(): Promise<string>;
  /** host(창 contentView)에 붙일 실제 View 객체 */
  nativeView: unknown;
}

/** [탭 host] View 를 붙이고 떼는 대상 — 실제로는 메인 창의 contentView (메서드 문법: View 인자 타입과 호환) */
export interface ITabHost {
  addChildView(view: unknown): void;
  removeChildView(view: unknown): void;
}

/** [탭] 새 View 를 만드는 팩토리 */
export type TTabViewFactory = () => ITabView;
