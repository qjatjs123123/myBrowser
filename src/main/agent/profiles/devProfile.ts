/**
 * [dev 프로필] 사내 GenAI(LiteLLM) 프록시 — `.env` 의 ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL (spec 007 FR-3~5).
 * 프록시가 Bedrock 으로 넘기며 toolset 항목에 name 을 붙여 400 이 나므로 computer toolset 을 뺀다.
 * fallbacks 는 LiteLLM 이 자기 fallback 옵션으로 읽고, server-side-fallback 베타도 프록시 뒤에서는 의미가 없어 보내지 않는다.
 */
import type { IModelRequestOptions } from '../loop';
import { createModelClient, MissingApiKeyError } from '../modelClient';
import type { IModelProfile } from './types';

/** dev 기본 모델 — 프록시의 모델 이름은 공급자 접두사가 붙는다 (GET {BASE}/v1/models) */
export const DEV_DEFAULT_MODEL = 'bedrock.anthropic.claude-opus-5-5';

export const DEV_MODEL_REQUEST: IModelRequestOptions = {
  betaList: ['context-management-2025-06-27'],
  hasFallbacks: false,
};

export interface ICreateDevProfileInput {
  apiKey?: string;
  baseUrl: string;
  model: string;
}

/** dev 전략 — 재시도는 SDK 기본(2) */
export function createDevProfile({ apiKey, baseUrl, model }: ICreateDevProfileInput): IModelProfile {
  return {
    kind: 'dev',
    model,
    createClient: () =>
      createModelClient({ isFake: false, apiKey, baseURL: baseUrl, missingKeyError: () => new MissingApiKeyError() }),
    request: DEV_MODEL_REQUEST,
    hasComputerToolset: false,
  };
}
