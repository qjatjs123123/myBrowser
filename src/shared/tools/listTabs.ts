import { z } from 'zod';

/** [list_tabs] 입력 없음 — 열린 탭 목록 */
export const ListTabsInputSchema = z.strictObject({});

export type TListTabsInput = z.infer<typeof ListTabsInputSchema>;
