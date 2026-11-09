import { z } from 'zod';

import { IPC } from '@shared/ipc/channels';
import { fail, ok, type TIpcResult } from '@shared/ipc/result';
import { WindowPointerMoveRequestSchema, WindowPointerStartRequestSchema } from '@shared/ipc/window';

import type { IWindowControls } from '../../app/window';
import type { IWindowPointerSession } from '../../app/windowPointer';

const INVALID_MESSAGE = '요청 형식이 올바르지 않습니다';
/** window:pointerEnd 는 요청 인자가 없다 */
const PointerEndRequestSchema = z.undefined();

/**
 * [window 핸들러] 신호등 버튼 (spec 010) + Linux 창 끌기 (spec 016) — 끌기 입력은 safeParse 후 세션에 넘긴다.
 * controls·세션이 throw 하면 registry 가 INTERNAL 로 감싼다.
 * 규칙: .claude/rules/electron/ipc.md 「핸들러」
 */
export function createWindowHandlers(controls: IWindowControls, pointer: IWindowPointerSession) {
  return {
    [IPC.window.minimize]: (): TIpcResult<null> => {
      controls.minimize();
      return ok(null);
    },
    [IPC.window.toggleMaximize]: (): TIpcResult<null> => {
      controls.toggleMaximize();
      return ok(null);
    },
    [IPC.window.close]: (): TIpcResult<null> => {
      controls.close();
      return ok(null);
    },
    [IPC.window.pointerStart]: (raw: unknown): TIpcResult<null> => {
      const parsed = WindowPointerStartRequestSchema.safeParse(raw);
      if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
      pointer.start(parsed.data);
      return ok(null);
    },
    [IPC.window.pointerMove]: (raw: unknown): TIpcResult<null> => {
      const parsed = WindowPointerMoveRequestSchema.safeParse(raw);
      if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
      pointer.move(parsed.data);
      return ok(null);
    },
    [IPC.window.pointerEnd]: (raw?: unknown): TIpcResult<null> => {
      const parsed = PointerEndRequestSchema.safeParse(raw);
      if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
      pointer.end();
      return ok(null);
    },
  };
}
