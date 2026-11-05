/**
 * [모델 클라이언트] 실제 Anthropic SDK 클라이언트 또는 가짜 fetch 를 단 같은 SDK 클라이언트를 만든다.
 * 가짜도 SDK toolRunner·스트림 파서를 그대로 거친다 — HTTP 만 가짜 (spec 003 「가짜 모델」).
 * gateway 모드(spec 005)는 baseURL = 게이트웨이, apiKey = 기기 토큰 — SDK 가 x-api-key 로 보낸다.
 * API 키·기기 토큰은 여기서만 SDK 에 넘기고 로그·이벤트·DB 에 싣지 않는다 (SR-6, spec 005 SR-1).
 */
import Anthropic from '@anthropic-ai/sdk';

import type { TFakeScenario } from '@shared/agent/fakeScenario';

import { createFakeFetch } from './fake/fakeFetch';

/** 루프가 쓰는 SDK 표면 — 테스트는 가짜 fetch 를 단 실제 SDK 인스턴스를 넣는다 */
export interface IModelClient {
  beta: Anthropic['beta'];
}

/** 실제 모드인데 ANTHROPIC_API_KEY 가 없다 — 서비스가 FR-8 문장의 AGENT_ERROR 로 바꾼다 */
export class MissingApiKeyError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY 가 없습니다');
    this.name = 'MissingApiKeyError';
  }
}

/** gateway 모드인데 기기 토큰이 없다 — 서비스가 run 을 시작하지 않고 구독 안내 문장으로 바꾼다 (spec 005 FR-6) */
export class MissingCredentialError extends Error {
  constructor() {
    super('기기 토큰이 없습니다');
    this.name = 'MissingCredentialError';
  }
}

export interface ICreateModelClientOptions {
  isFake: boolean;
  /** direct 모드는 ANTHROPIC_API_KEY, gateway 모드는 기기 토큰 */
  apiKey?: string;
  /** gateway 모드의 게이트웨이 주소 — 주면 재시도 없이(maxRetries 0) 이 주소로 부른다 */
  baseURL?: string;
  /** 가짜 모드에서 재생할 시나리오 — 없으면 바로 끝나는 빈 시나리오 */
  scenario?: TFakeScenario;
  /** 키가 없을 때 던질 오류 — 기본은 baseURL 이 있으면 MissingCredentialError, 없으면 MissingApiKeyError */
  missingKeyError?: () => Error;
}

/** 모드에 맞는 클라이언트 — 실제 모드에서 키(토큰)가 없으면 throw */
export function createModelClient(options: ICreateModelClientOptions): IModelClient {
  const { isFake, apiKey, baseURL, scenario } = options;
  if (isFake) {
    const { fetch } = createFakeFetch(scenario ?? { turns: [] });
    return new Anthropic({ apiKey: 'fake', fetch, maxRetries: 0 });
  }
  if (!apiKey) throw toMissingKeyError(options);
  if (baseURL) return new Anthropic({ apiKey, baseURL, maxRetries: 0 });
  return new Anthropic({ apiKey });
}

function toMissingKeyError({ baseURL, missingKeyError }: ICreateModelClientOptions): Error {
  if (missingKeyError) return missingKeyError();
  return baseURL ? new MissingCredentialError() : new MissingApiKeyError();
}
