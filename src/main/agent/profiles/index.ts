/**
 * [모델 프로필 팩토리] kind 로 전략을 고르는 유일한 곳 (spec 007). 진입점(index.ts)이 env 로 1번 만들어 서비스에 넘긴다.
 */
import { createDevProfile, type ICreateDevProfileInput } from './devProfile';
import { createFakeProfile, type ICreateFakeProfileInput } from './fakeProfile';
import { createProdProfile, type ICreateProdProfileInput } from './prodProfile';
import type { IModelProfile } from './types';

export { DEV_DEFAULT_MODEL, DEV_MODEL_REQUEST } from './devProfile';
export type { IModelProfile, TProfileKind } from './types';

export type TCreateModelProfileInput =
  | ({ kind: 'dev' } & ICreateDevProfileInput)
  | ({ kind: 'prod' } & ICreateProdProfileInput)
  | ({ kind: 'fake' } & ICreateFakeProfileInput);

/** kind 에 맞는 전략 */
export function createModelProfile(input: TCreateModelProfileInput): IModelProfile {
  if (input.kind === 'dev') return createDevProfile(input);
  if (input.kind === 'prod') return createProdProfile(input);
  return createFakeProfile(input);
}
