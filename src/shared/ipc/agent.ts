import { z } from 'zod';

import {
  ApprovalDecisionSchema,
  ApprovalRequestSchema,
  GuardDisplaySchema,
  ModelApprovalDecisionSchema,
  QuestionSchema,
  RequestIdSchema,
  RunIdSchema,
  RunStatusSchema,
  StepSchema,
} from '../agent/run';

/** [agent:start] 요청 — 사용자가 사이드바에 쓴 할 일 */
export const StartAgentRequestSchema = z.strictObject({
  task: z.string().trim().min(1).max(2000),
});

/** [agent:start] 응답 — 새 run id */
export const StartAgentResponseSchema = z.strictObject({ runId: RunIdSchema });

/** [agent:stop] 요청 — 응답은 EmptyResponseSchema(tabs.ts) */
export const StopAgentRequestSchema = z.strictObject({ runId: RunIdSchema });

/**
 * [agent:approve] 요청 — 응답은 EmptyResponseSchema(tabs.ts).
 * kind 와 맞지 않는 decision(guard 에 approved, model 에 agent/user_done)은 main 이 INVALID_INPUT 으로 거부한다.
 */
export const ApproveAgentRequestSchema = z.strictObject({
  runId: RunIdSchema,
  requestId: RequestIdSchema,
  decision: z.union([ApprovalDecisionSchema, ModelApprovalDecisionSchema]),
});

/** [agent:answer] 요청 — ask_user 질문의 답. 응답은 EmptyResponseSchema(tabs.ts) */
export const AnswerAgentRequestSchema = z.strictObject({
  runId: RunIdSchema,
  requestId: RequestIdSchema,
  answer: z.string().trim().min(1).max(1000),
});

/**
 * [agent:event] main→renderer 이벤트 — 한 run 의 순서:
 * status(running) → (step(running) → step(ok|error|blocked))* → 종료 이벤트 1개 → status(종료 상태)
 * 승인 대기: step(running) → step(waiting) → status(waiting_user) → approval_required → approval_resolved
 * → status(running) → step(ok|denied). 질문도 같은 꼴(question / question_answered).
 * guard_stopped 는 spec 004 묶음 병렬 동안만 남긴다(발신 안 함) — 합치기 뒤 메인이 삭제.
 */
export const AgentEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('status'), runId: RunIdSchema, status: RunStatusSchema }),
  z.strictObject({ type: z.literal('step'), runId: RunIdSchema, step: StepSchema }),
  z.strictObject({ type: z.literal('done'), runId: RunIdSchema, summary: z.string() }),
  z.strictObject({ type: z.literal('failed'), runId: RunIdSchema, reason: z.string() }),
  z.strictObject({ type: z.literal('stopped'), runId: RunIdSchema }),
  z.strictObject({
    type: z.literal('guard_stopped'),
    runId: RunIdSchema,
    reason: z.string(),
    display: GuardDisplaySchema,
  }),
  z.strictObject({ type: z.literal('approval_required'), runId: RunIdSchema, request: ApprovalRequestSchema }),
  z.strictObject({
    type: z.literal('approval_resolved'),
    runId: RunIdSchema,
    requestId: RequestIdSchema,
    decision: z.union([ApprovalDecisionSchema, ModelApprovalDecisionSchema, z.literal('cancelled')]),
  }),
  z.strictObject({ type: z.literal('question'), runId: RunIdSchema, question: QuestionSchema }),
  /** 답 원문은 싣지 않는다 (SR-5) */
  z.strictObject({ type: z.literal('question_answered'), runId: RunIdSchema, requestId: RequestIdSchema }),
]);

export type TStartAgentRequest = z.infer<typeof StartAgentRequestSchema>;
export type TStartAgentResponse = z.infer<typeof StartAgentResponseSchema>;
export type TStopAgentRequest = z.infer<typeof StopAgentRequestSchema>;
export type TApproveAgentRequest = z.infer<typeof ApproveAgentRequestSchema>;
export type TAnswerAgentRequest = z.infer<typeof AnswerAgentRequestSchema>;
export type TAgentEvent = z.infer<typeof AgentEventSchema>;
