import { z } from 'zod';

/** [go_back] 입력 없음 — 대상 탭 뒤로 가기 */
export const GoBackInputSchema = z.strictObject({});

export type TGoBackInput = z.infer<typeof GoBackInputSchema>;
