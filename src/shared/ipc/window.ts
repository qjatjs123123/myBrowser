import { z } from 'zod';

/**
 * [window:stateChanged] main→renderer 이벤트 — 최대화 또는 전체 화면이면 isMaximized true (spec 014).
 * Linux 둥근 창은 이 값으로 모서리를 직각/둥글게 바꾼다.
 */
export const WindowStateSchema = z.strictObject({ isMaximized: z.boolean() });

export type TWindowState = z.infer<typeof WindowStateSchema>;
