import { z } from 'zod';

/** [navigate] 현재 대상 탭을 url 로 이동 — 스킴·host 검사는 가드(SR-3)가 한다 */
export const NavigateInputSchema = z.strictObject({ url: z.url() });

export type TNavigateInput = z.infer<typeof NavigateInputSchema>;
