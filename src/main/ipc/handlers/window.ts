import { IPC } from '@shared/ipc/channels';
import { ok, type TIpcResult } from '@shared/ipc/result';

import type { IWindowControls } from '../../app/window';

/**
 * [window 핸들러] 신호등 버튼 (spec 010) — 요청 입력이 없으므로 검증할 입력은 없다. controls 가 throw 하면 registry 가 INTERNAL 로 감싼다.
 * 규칙: .claude/rules/electron/ipc.md 「핸들러」
 */
export function createWindowHandlers(controls: IWindowControls) {
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
  };
}
