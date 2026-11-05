import { z } from 'zod';

/** [request_approval] 사람 개입 도구 — 모델이 스스로 확인을 받고 싶을 때. 항상 승인 창을 띄우고 run 당 승인 상한(SR-4)에 포함된다 */
export const RequestApprovalInputSchema = z.strictObject({
  action: z.string().min(1).max(100),
  target: z.string().max(200),
  reason: z.string().min(1).max(300),
});

export type TRequestApprovalInput = z.infer<typeof RequestApprovalInputSchema>;
