import { z } from 'zod';

/**
 * [window:stateChanged] main→renderer 이벤트 — 최대화 또는 전체 화면이면 isMaximized true (spec 014).
 * Linux 둥근 창은 이 값으로 모서리를 직각/둥글게 바꾼다.
 */
export const WindowStateSchema = z.strictObject({ isMaximized: z.boolean() });

export type TWindowState = z.infer<typeof WindowStateSchema>;

/** 창 조작 종류 — 이동 또는 끄는 변·모서리 (spec 016) */
export const WindowPointerKindSchema = z.enum(['move', 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);

/** 화면 좌표(DIP, 정수) — 다중 모니터에서 음수일 수 있다 (spec 016) */
export const WindowPointerPointSchema = z.strictObject({ screenX: z.number().int(), screenY: z.number().int() });

/** [window:pointerStart] 누른 지점과 조작 종류 (spec 016) */
export const WindowPointerStartRequestSchema = WindowPointerPointSchema.extend({ kind: WindowPointerKindSchema });

/** [window:pointerMove] 지금 커서 위치 (spec 016) */
export const WindowPointerMoveRequestSchema = WindowPointerPointSchema;

export type TWindowPointerKind = z.infer<typeof WindowPointerKindSchema>;
export type TWindowPointerPoint = z.infer<typeof WindowPointerPointSchema>;
export type TWindowPointerStartRequest = z.infer<typeof WindowPointerStartRequestSchema>;
export type TWindowPointerMoveRequest = z.infer<typeof WindowPointerMoveRequestSchema>;
