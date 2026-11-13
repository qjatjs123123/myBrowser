/**
 * [fake 프로필] e2e·평가 세트의 가짜 모델 — 실제 SDK + 가짜 fetch 로 시나리오를 재생한다 (spec 003 「가짜 모델」).
 * 요청 옵션·도구는 prod 와 같게 둔다 — e2e 가 배포 경로의 요청 모양을 그대로 검증한다 (spec 007 FR-7).
 */
import type { TFakeScenario } from '@shared/agent/fakeScenario';

import { DEFAULT_MODEL_REQUEST } from '../loop';
import { createModelClient } from '../modelClient';
import type { IModelProfile } from './types';

export interface ICreateFakeProfileInput {
  model: string;
  /** run 시작마다 읽는다 — 없으면 바로 끝나는 빈 시나리오 */
  readScenario: () => TFakeScenario | undefined;
}

/** fake 전략 */
export function createFakeProfile({ model, readScenario }: ICreateFakeProfileInput): IModelProfile {
  return {
    kind: 'fake',
    model,
    createClient: () => createModelClient({ isFake: true, scenario: readScenario() }),
    request: DEFAULT_MODEL_REQUEST,
    hasComputerToolset: true,
  };
}
