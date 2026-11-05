/**
 * [모델 클라이언트] 실제 Anthropic SDK 클라이언트 또는 가짜 fetch 를 단 같은 SDK 클라이언트를 만든다.
 * 가짜도 SDK toolRunner·스트림 파서를 그대로 거친다 — HTTP 만 가짜 (spec 003 「가짜 모델」).
 * API 키는 여기서만 SDK 에 넘기고 로그·이벤트·DB 에 싣지 않는다 (SR-6).
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

export interface ICreateModelClientOptions {
  isFake: boolean;
  apiKey?: string;
  /** 가짜 모드에서 재생할 시나리오 — 없으면 바로 끝나는 빈 시나리오 */
  scenario?: TFakeScenario;
}

/** 모드에 맞는 클라이언트 — 실제 모드에서 키가 없으면 MissingApiKeyError */
export function createModelClient({ isFake, apiKey, scenario }: ICreateModelClientOptions): IModelClient {
  if (isFake) {
    const { fetch } = createFakeFetch(scenario ?? { turns: [] });
    return new Anthropic({ apiKey: 'fake', fetch, maxRetries: 0 });
  }
  if (!apiKey) throw new MissingApiKeyError();
  return new Anthropic({ apiKey });
}
