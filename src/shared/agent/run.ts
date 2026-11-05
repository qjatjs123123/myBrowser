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

/** [agent] step(도구 호출 1회) 상태 — waiting = 승인·질문 대기, denied = 사용자가 거부 (spec 004) */
export const StepStatusSchema = z.enum(['running', 'waiting', 'ok', 'error', 'blocked', 'denied']);

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

/** [agent] 대기 요청 id — run 안에서 `req-{n}` (main 의 대기 레지스트리가 발급) */
export const RequestIdSchema = z.string().regex(/^req-\d+$/);

/** [agent] 가드 판정(구조·픽셀) 승인 결정 — agent = 재확인 후 1회 실행, user_done = 사용자가 직접 처리 */
export const ApprovalDecisionSchema = z.enum(['agent', 'user_done', 'denied']);

/** [agent] 모델의 request_approval 결정 — 실행할 구체 행동이 없으므로 승인/거부 두 가지 */
export const ModelApprovalDecisionSchema = z.enum(['approved', 'denied']);

/**
 * [agent] 승인 창 한 건 — display 는 실제 요소 텍스트·URL(SR-3).
 * kind=model 이면 display 는 `{ action: '확인 요청', target: '' }` 이고 모델 문장은 modelNote(“에이전트 설명”)에만 둔다.
 */
export const ApprovalRequestSchema = z.strictObject({
  requestId: RequestIdSchema,
  stepN: z.number().int().min(1),
  kind: z.enum(['guard', 'model']),
  source: z.enum(['structure', 'pixel', 'model']),
  reason: z.string(),
  display: GuardDisplaySchema,
  modelNote: z.string().max(500).nullable(),
});

/** [agent] ask_user 질문 카드 한 건 — 선택지는 최대 6개 */
export const QuestionSchema = z.strictObject({
  requestId: RequestIdSchema,
  stepN: z.number().int().min(1),
  text: z.string().min(1).max(300),
  optionList: z.array(z.string().min(1).max(60)).max(6),
});

export type TRunId = z.infer<typeof RunIdSchema>;
export type TRunStatus = z.infer<typeof RunStatusSchema>;
export type TStepStatus = z.infer<typeof StepStatusSchema>;
export type TStep = z.infer<typeof StepSchema>;
export type TGuardDisplay = z.infer<typeof GuardDisplaySchema>;
export type TRequestId = z.infer<typeof RequestIdSchema>;
export type TApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
export type TModelApprovalDecision = z.infer<typeof ModelApprovalDecisionSchema>;
export type TApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export type TQuestion = z.infer<typeof QuestionSchema>;

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
