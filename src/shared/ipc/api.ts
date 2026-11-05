import type { TAccountStatus } from './account';
import type {
  TAgentEvent,
  TAnswerAgentRequest,
  TApproveAgentRequest,
  TStartAgentRequest,
  TStartAgentResponse,
  TStopAgentRequest,
} from './agent';
import type { TAppInfo } from './app';
import type { TIpcResult } from './result';
import type { TShortcutPressedEvent } from './shortcut';
import type {
  TCreateTabRequest,
  TCreateTabResponse,
  TListTabsResponse,
  TNavigateRequest,
  TSetBoundsRequest,
  TTabRequest,
  TTabsChangedEvent,
} from './tabs';

/** 이벤트 구독 해제 함수 — renderer 훅이 cleanup 에서 부른다 */
export type TUnsubscribe = () => void;

/**
 * [window.api] preload 가 노출하고 renderer 가 쓰는 API 의 타입 — 양쪽이 이 타입 하나를 공유한다.
 * 규칙: .claude/rules/electron/preload.md
 */
export interface IApi {
  app: {
    getInfo: () => Promise<TIpcResult<TAppInfo>>;
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
}
