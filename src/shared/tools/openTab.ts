import { z } from 'zod';

/** [open_tab] 새 탭을 활성으로 열고 이후 대상 탭으로 삼는다 — url 이 있으면 가드가 SR-3 검사 */
export const OpenTabInputSchema = z.strictObject({ url: z.url().optional() });

export type TOpenTabInput = z.infer<typeof OpenTabInputSchema>;
