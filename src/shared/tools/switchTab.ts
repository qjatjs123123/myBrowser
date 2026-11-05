import { z } from 'zod';

/** [switch_tab] tabId(list_tabs 결과) 로 대상 탭 전환 — 화면의 활성 탭도 바뀐다 */
export const SwitchTabInputSchema = z.strictObject({ tabId: z.string().min(1) });

export type TSwitchTabInput = z.infer<typeof SwitchTabInputSchema>;
