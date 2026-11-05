import { z } from 'zod';

/** [scroll] 페이지를 위·아래로 스크롤 (기본 한 화면) */
export const ScrollInputSchema = z.strictObject({
  direction: z.enum(['down', 'up']),
  amount: z.enum(['page', 'half']).optional(),
});

export type TScrollInput = z.infer<typeof ScrollInputSchema>;
