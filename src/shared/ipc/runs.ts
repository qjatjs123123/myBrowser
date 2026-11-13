import { z } from 'zod';

import { RunIdSchema, RunStatusSchema, StepSchema } from '../agent/run';

/** [runs] 기록 목록 최대 개수 — 페이지 넘기기는 범위 밖 (spec 012) */
export const RUN_HISTORY_LIMIT = 50;

/** [runs:get] 없는 run 을 열려 할 때의 사용자 문장 (NOT_FOUND) */
export const RUN_NOT_FOUND_MESSAGE = '실행 기록을 찾을 수 없습니다';

/**
 * [runs] 지난 실행 한 건의 요약 — 사이드바 기록 목록·상세 머리에 쓴다.
 * 도구 입력값(input_json)·결과 원문(result_text)은 싣지 않는다 (spec 012 SR-2) — strict 로 여분 키를 거부한다.
 */
export const RunSummarySchema = z.strictObject({
  id: RunIdSchema,
  task: z.string(),
  status: RunStatusSchema,
  summary: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
  endedAt: z.string().nullable(),
});

/** [runs:list] 응답 — 최근 run 최대 50개, createdAt 내림차순 */
export const RunListResponseSchema = z.strictObject({
  runList: z.array(RunSummarySchema).max(RUN_HISTORY_LIMIT),
});

/** [runs:get] 요청 — 열어 볼 run id */
export const RunGetRequestSchema = z.strictObject({ runId: RunIdSchema });

/** [runs:get] 응답 — run 요약 + 단계(n·tool·summary·status 만, 입력값 없음) */
export const RunGetResponseSchema = z.strictObject({
  run: RunSummarySchema,
  stepList: z.array(StepSchema),
});

export type TRunSummary = z.infer<typeof RunSummarySchema>;
export type TRunListResponse = z.infer<typeof RunListResponseSchema>;
export type TRunGetRequest = z.infer<typeof RunGetRequestSchema>;
export type TRunGetResponse = z.infer<typeof RunGetResponseSchema>;

/** main 측 기록 조회 포트 — store repo 가 구현하고 runs 핸들러가 주입받는다. 조회만 한다 (SR-1) */
export interface IRunHistory {
  /** 최신순(createdAt 내림차순) 최대 limit 개 */
  listRecent(limit: number): TRunSummary[];
  /** run + 단계(n 오름차순). 없으면 null */
  getDetail(runId: string): TRunGetResponse | null;
}
