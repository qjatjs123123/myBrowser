import { z } from 'zod';

/** [wait_for] 글이 나타날 때까지 또는 ms 만큼 기다린다 — 둘 중 하나 이상 필요 */
export const WaitForInputSchema = z
  .strictObject({
    text: z.string().min(1).max(200).optional(),
    ms: z.number().int().min(100).max(10000).optional(),
  })
  .refine((input) => input.text !== undefined || input.ms !== undefined, {
    message: 'text 또는 ms 중 하나는 있어야 합니다',
  });

export type TWaitForInput = z.infer<typeof WaitForInputSchema>;
