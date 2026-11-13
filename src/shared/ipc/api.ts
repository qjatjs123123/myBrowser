import type { TAccountStatus } from './account';
import type {
  TAgentEvent,
  TAnswerAgentRequest,
  TApproveAgentRequest,
  TStartAgentRequest,
  TStartAgentResponse,
  TStopAgentRequest,
} from './agent';
import type { TAppInfo, TShowMenuRequest } from './app';
import type { TBookmarkAddRequest, TBookmarkListResponse, TBookmarkRemoveRequest } from './bookmarks';
import type { THistoryListRequest, THistoryListResponse, THistoryRemoveRequest } from './history';
import type { TIpcResult } from './result';
import type { TRunGetRequest, TRunGetResponse, TRunListResponse } from './runs';
import type { TShortcutPressedEvent } from './shortcut';
import type {
  TSkillCreateRequest,
  TSkillDeleteRequest,
  TSkillListResponse,
  TSkillUpdateRequest,
} from './skills';
import type {
  TCreateTabRequest,
  TCreateTabResponse,
  TFindInPageRequest,
  TFindUpdatedEvent,
  TListTabsResponse,
  TNavigateRequest,
  TSetBoundsRequest,
  TTabRequest,
  TTabsChangedEvent,
  TZoomTabRequest,
} from './tabs';
import type { TWindowPointerMoveRequest, TWindowPointerStartRequest, TWindowState } from './window';

/** 이벤트 구독 해제 함수 — renderer 훅이 cleanup 에서 부른다 */
export type TUnsubscribe = () => void;

/**
 * [window.api] preload 가 노출하고 renderer 가 쓰는 API 의 타입 — 양쪽이 이 타입 하나를 공유한다.
 * 규칙: .claude/rules/electron/preload.md
 */
export interface IApi {
  app: {
    getInfo: () => Promise<TIpcResult<TAppInfo>>;
    /** 툴바 [메뉴] 네이티브 팝업 (spec 023) */
    showMenu: (req: TShowMenuRequest) => Promise<TIpcResult<null>>;
  };
  tabs: {
    list: () => Promise<TIpcResult<TListTabsResponse>>;
    create: (req: TCreateTabRequest) => Promise<TIpcResult<TCreateTabResponse>>;
    close: (req: TTabRequest) => Promise<TIpcResult<null>>;
    activate: (req: TTabRequest) => Promise<TIpcResult<null>>;
    navigate: (req: TNavigateRequest) => Promise<TIpcResult<null>>;
    goBack: (req: TTabRequest) => Promise<TIpcResult<null>>;
    goForward: (req: TTabRequest) => Promise<TIpcResult<null>>;
    reload: (req: TTabRequest) => Promise<TIpcResult<null>>;
    stop: (req: TTabRequest) => Promise<TIpcResult<null>>;
    setBounds: (req: TSetBoundsRequest) => Promise<TIpcResult<null>>;
    onChanged: (cb: (e: TTabsChangedEvent) => void) => TUnsubscribe;
    /** 확대/축소 (spec 021) — 결과 배율은 tabs:changed 의 zoomPercent 로 온다 */
    zoom: (req: TZoomTabRequest) => Promise<TIpcResult<null>>;
    /** 페이지 내 찾기 — 결과 개수는 onFindUpdated 로 온다 */
    find: (req: TFindInPageRequest) => Promise<TIpcResult<null>>;
    stopFind: (req: TTabRequest) => Promise<TIpcResult<null>>;
    onFindUpdated: (cb: (e: TFindUpdatedEvent) => void) => TUnsubscribe;
  };
  shortcut: {
    onPressed: (cb: (e: TShortcutPressedEvent) => void) => TUnsubscribe;
  };
  agent: {
    start: (req: TStartAgentRequest) => Promise<TIpcResult<TStartAgentResponse>>;
    stop: (req: TStopAgentRequest) => Promise<TIpcResult<null>>;
    approve: (req: TApproveAgentRequest) => Promise<TIpcResult<null>>;
    answer: (req: TAnswerAgentRequest) => Promise<TIpcResult<null>>;
    onEvent: (cb: (e: TAgentEvent) => void) => TUnsubscribe;
  };
  /** 구독 계정 (spec 005) — 요청 인자 없음. 기기 토큰은 싣지 않는다 */
  account: {
    getStatus: () => Promise<TIpcResult<TAccountStatus>>;
    startActivation: () => Promise<TIpcResult<TAccountStatus>>;
    cancelActivation: () => Promise<TIpcResult<TAccountStatus>>;
    openManage: () => Promise<TIpcResult<null>>;
    signOut: () => Promise<TIpcResult<TAccountStatus>>;
    onChanged: (cb: (e: TAccountStatus) => void) => TUnsubscribe;
  };
  /** 창 제어 (spec 010) — 요청 인자 없음 */
  window: {
    minimize: () => Promise<TIpcResult<null>>;
    toggleMaximize: () => Promise<TIpcResult<null>>;
    close: () => Promise<TIpcResult<null>>;
    /** Linux 창 끌기 시작 — 이동 또는 변·모서리 크기 조절 (spec 016) */
    pointerStart: (req: TWindowPointerStartRequest) => Promise<TIpcResult<null>>;
    /** 끄는 중 커서 위치 — 진행 중인 조작이 없으면 무시 */
    pointerMove: (req: TWindowPointerMoveRequest) => Promise<TIpcResult<null>>;
    /** 끌기 끝 — 진행 중인 조작이 없으면 무시 */
    pointerEnd: () => Promise<TIpcResult<null>>;
    /** 최대화·전체 화면 상태 (spec 014) — 렌더러가 늦게 붙어도 main 이 첫 로드 때 1회 보낸다 */
    onStateChanged: (cb: (state: TWindowState) => void) => TUnsubscribe;
  };
  /** 지난 실행 기록 (spec 012) — 읽기 전용, 도구 입력값·결과 원문 없음 */
  runs: {
    list: () => Promise<TIpcResult<TRunListResponse>>;
    get: (req: TRunGetRequest) => Promise<TIpcResult<TRunGetResponse>>;
  };
  /** 에이전트 스킬 (spec 013) — 모든 응답은 만든 순서의 최신 목록 */
  skills: {
    list: () => Promise<TIpcResult<TSkillListResponse>>;
    create: (req: TSkillCreateRequest) => Promise<TIpcResult<TSkillListResponse>>;
    update: (req: TSkillUpdateRequest) => Promise<TIpcResult<TSkillListResponse>>;
    delete: (req: TSkillDeleteRequest) => Promise<TIpcResult<TSkillListResponse>>;
  };
  /** 북마크 (spec 021) — 모든 응답은 최신 추가 순 전체 목록 */
  bookmarks: {
    list: () => Promise<TIpcResult<TBookmarkListResponse>>;
    add: (req: TBookmarkAddRequest) => Promise<TIpcResult<TBookmarkListResponse>>;
    remove: (req: TBookmarkRemoveRequest) => Promise<TIpcResult<TBookmarkListResponse>>;
  };
  /** 방문 기록 (spec 021) — 기록은 main 이 남기고 renderer 는 조회·지우기만 */
  history: {
    list: (req?: THistoryListRequest) => Promise<TIpcResult<THistoryListResponse>>;
    remove: (req: THistoryRemoveRequest) => Promise<TIpcResult<null>>;
    clear: () => Promise<TIpcResult<null>>;
  };
}
