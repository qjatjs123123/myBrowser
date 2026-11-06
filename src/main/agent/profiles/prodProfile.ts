/**
 * [prod 프로필] Claude API 비즈니스 버전 — 구독 기기 토큰 + mybrowser 게이트웨이 (spec 005 FR-3, spec 007 FR-6).
 * 게이트웨이가 재시도·과금을 맡으므로 SDK 재시도는 0. 토큰은 run 시작 시점의 값을 읽는다 (연결·해제가 실행 중에 바뀐다).
 */
import { DEFAULT_MODEL_REQUEST } from '../loop';
import { createModelClient } from '../modelClient';
import type { IModelProfile } from './types';

export interface ICreateProdProfileInput {
  gatewayUrl: string;
  /** 저장된 기기 토큰 — 없으면 null (createClient 가 MissingCredentialError) */
  getDeviceToken: () => string | null;
  model: string;
}

/** prod 전략 — 요청 옵션·픽셀 도구 모두 기본 그대로 */
export function createProdProfile({ gatewayUrl, getDeviceToken, model }: ICreateProdProfileInput): IModelProfile {
  return {
    kind: 'prod',
    model,
    createClient: () =>
      createModelClient({ isFake: false, apiKey: getDeviceToken() ?? undefined, baseURL: gatewayUrl, maxRetries: 0 }),
    request: DEFAULT_MODEL_REQUEST,
    hasComputerToolset: true,
  };
}
