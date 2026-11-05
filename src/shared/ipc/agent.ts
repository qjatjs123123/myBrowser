import { z } from 'zod';

import { GuardDisplaySchema, RunIdSchema, RunStatusSchema, StepSchema } from '../agent/run';

/** [agent:start] 요청 — 사용자가 사이드바에 쓴 할 일 */
export const StartAgentRequestSchema = z.strictObject({
  task: z.string().trim().min(1).max(2000),
});

/** [agent:start] 응답 — 새 run id */
export const StartAgentResponseSchema = z.strictObject({ runId: RunIdSchema });

/** [agent:stop] 요청 — 응답은 EmptyResponseSchema(tabs.ts) */
export const StopAgentRequestSchema = z.strictObject({ runId: RunIdSchema });

/**
 * [agent:event] main→renderer 이벤트 — 한 run 의 순서:
 * status(running) → (step(running) → step(ok|error|blocked))* → 종료 이벤트 1개 → status(종료 상태)
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
]);

export type TStartAgentRequest = z.infer<typeof StartAgentRequestSchema>;
export type TStartAgentResponse = z.infer<typeof StartAgentResponseSchema>;
export type TStopAgentRequest = z.infer<typeof StopAgentRequestSchema>;
export type TAgentEvent = z.infer<typeof AgentEventSchema>;
