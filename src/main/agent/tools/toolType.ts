import type { z } from 'zod';

import type { IBrowserDriver, TActionResult, TToolName } from '@shared/tools';

/**
 * 도구 정의 1개 — 도구 1개 = 파일 1개 = 행동 1개 (rules/agent/tools.md).
 * 가드·step 기록·정지 확인은 index.ts 의 공통 래퍼가 하고, execute 는 행동만 한다.
 */
export interface IAgentTool<TInput> {
  name: TToolName;
  /** 모델이 읽는 문장 — 언제 쓰고/말지, ref 출처, 예시 입력 1개 */
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute(driver: IBrowserDriver, input: TInput): Promise<TActionResult>;
}
