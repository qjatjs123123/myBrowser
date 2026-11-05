import { z } from 'zod';

/** [agent] run id — main 의 AgentService 가 발급한다 */
export const RunIdSchema = z.string().min(1);

/** [agent] run 상태 — `waiting_user` 는 3단계(승인·질문)용으로 enum 에만 둔다 */
export const RunStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_user',
  'done',
  'failed',
  'stopped',
  'stopped_before_confirm',
]);

/** [agent] step(도구 호출 1회) 상태 */
export const StepStatusSchema = z.enum(['running', 'ok', 'error', 'blocked']);

/** [agent] 타임라인 한 줄 — summary 는 main 이 만든 사람 말 요약 (renderer 는 도구 JSON 을 해석하지 않는다) */
export const StepSchema = z.strictObject({
  n: z.number().int().min(1),
  tool: z.string().min(1),
  summary: z.string(),
  status: StepStatusSchema,
});

/** [agent] 가드 정지 표시 — 실제 요소 텍스트·URL 그대로 (모델이 만든 문장 금지, rules/agent/guard.md) */
export const GuardDisplaySchema = z.strictObject({
  action: z.string(),
  target: z.string(),
});

export type TRunId = z.infer<typeof RunIdSchema>;
export type TRunStatus = z.infer<typeof RunStatusSchema>;
export type TStepStatus = z.infer<typeof StepStatusSchema>;
export type TStep = z.infer<typeof StepSchema>;
export type TGuardDisplay = z.infer<typeof GuardDisplaySchema>;

/** 저장소에서 읽은 run 한 건 — 날짜는 ISO 문자열 */
export type TRunRecord = {
  id: string;
  task: string;
  status: TRunStatus;
  summary: string | null;
  reason: string | null;
  createdAt: string;
  endedAt: string | null;
};

/** 저장소에서 읽은 step 한 건 — inputJson 의 type_text 입력값은 이미 생략돼 있다 */
export type TStepRecord = TStep & {
  inputJson: string;
  resultText: string | null;
  createdAt: string;
};

/** run 생성 입력 */
export interface IRunCreate {
  id: string;
  task: string;
  status: TRunStatus;
  createdAt: string;
}

/** run 갱신 입력 — 준 필드만 바꾼다 */
export interface IRunPatch {
  status?: TRunStatus;
  summary?: string;
  reason?: string;
  endedAt?: string;
  usageJson?: string;
}

/** step 저장 입력 — 같은 (runId, n) 이면 갱신 */
export type TStepUpsert = TStep & {
  inputJson: string;
  resultText?: string;
  createdAt: string;
};

/**
 * run·step 저장소 — main-store 가 node:sqlite 로 구현하고 agent-loop 가 주입받아 쓴다.
 * 테스트는 메모리 가짜로 대체한다.
 */
export interface IRunStore {
  createRun(run: IRunCreate): void;
  updateRun(id: string, patch: IRunPatch): void;
  upsertStep(runId: string, step: TStepUpsert): void;
  getRun(id: string): TRunRecord | null;
  /** n 오름차순 */
  listSteps(runId: string): TStepRecord[];
}
