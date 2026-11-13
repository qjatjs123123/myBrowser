import type { TAccountStatus } from '@shared/ipc/account';
import type { TAccountInfo, TActivationCreated, TActivationPoll } from '@shared/account/gateway';

/** fetch 의 최소 모양 — 테스트에서 가짜를 넣는다 */
export type TFetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * [게이트웨이 클라이언트] spec 005 「게이트웨이 HTTP 계약」의 활성화·계정 API 3개.
 * 실패는 모두 GatewayError(status, message) 로 throw — status 0 은 네트워크 오류·타임아웃.
 */
export interface IGatewayClient {
  /** 끝 슬래시를 뗀 게이트웨이 주소 — 구독 관리 기본 URL(`{gw}/account`)에 쓴다 */
  readonly baseUrl: string;
  createActivation: (deviceName: string) => Promise<TActivationCreated>;
  pollActivation: (activationId: string, pollSecret: string) => Promise<TActivationPoll>;
  getAccount: (deviceToken: string) => Promise<TAccountInfo>;
}

/** 계정 서비스가 IPC 핸들러에 돌려주는 결과 — 실패 문장은 서비스가 정한다 */
export type TAccountResult<T> = { ok: true; data: T } | { ok: false; code: 'BUSY' | 'AGENT_ERROR'; message: string };

/**
 * [계정 서비스] 구독 계정 상태의 단일 출처 (spec 005 「main 모듈 설계」).
 * 기기 토큰은 getDeviceToken 으로만 main 안에서 꺼내고, 상태·이벤트에는 싣지 않는다 (SR-1).
 */
export interface IAccountService {
  getStatus: () => TAccountStatus;
  startActivation: () => Promise<TAccountResult<TAccountStatus>>;
  cancelActivation: () => TAccountStatus;
  openManage: () => Promise<TAccountResult<null>>;
  signOut: () => TAccountStatus;
  getDeviceToken: () => string | null;
  refreshCredits: () => Promise<void>;
  handleAuthFailure: () => void;
  shutdown: () => void;
}
