/**
 * [모델 프로필] 모델 호출 경로 하나 = 전략 하나 (spec 007).
 * 클라이언트·모델 id·요청 옵션·도구 구성을 한 묶음으로 갈아끼운다 — 서비스는 kind 로 분기하지 않고 이 값만 쓴다.
 * 키·기기 토큰은 createClient() 안에서만 SDK 에 넘긴다 — 다른 필드·로그에 싣지 않는다 (SR-2).
 */
import type { IModelRequestOptions } from '../loop';
import type { IModelClient } from '../modelClient';

/** fake: e2e 가짜 모델 / dev: 사내 GenAI 프록시 / prod: Claude API 비즈니스(게이트웨이 + 구독) */
export type TProfileKind = 'fake' | 'dev' | 'prod';

export interface IModelProfile {
  kind: TProfileKind;
  /** 요청 model id — 날짜 접미사 없음 */
  model: string;
  /** run 시작마다 부른다 — 키(토큰)가 없으면 MissingApiKeyError / MissingCredentialError */
  createClient(): IModelClient;
  request: IModelRequestOptions;
  /** 픽셀 computer toolset 을 도구 목록에 넣을지 */
  hasComputerToolset: boolean;
}
