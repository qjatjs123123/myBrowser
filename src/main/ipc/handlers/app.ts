import { AppInfoSchema, ShowMenuRequestSchema, type TAppInfo, type TAppMode, type TShowMenuRequest } from '@shared/ipc/app';
import { IPC } from '@shared/ipc/channels';
import { fail, ok, type TIpcResult } from '@shared/ipc/result';

const INVALID_MESSAGE = '요청 형식이 올바르지 않습니다';

interface IAppInfoSource {
  getName: () => string;
  getVersion: () => string;
  mode: TAppMode;
  /** 툴바 [메뉴] 네이티브 팝업을 그 위치에 띄운다 (spec 023) — 항목은 main 이 정한다 */
  showMenu: (point: TShowMenuRequest) => void;
}

/**
 * [app 핸들러] app:getInfo — 응답은 보내기 전에 parse 해 우리 버그를 일찍 잡는다.
 * app:showMenu — 위치만 검증해 넘긴다 (spec 023 SR-2).
 * 규칙: .claude/rules/electron/ipc.md 「핸들러」
 */
export function createAppHandlers(source: IAppInfoSource) {
  return {
    [IPC.app.getInfo]: (): TIpcResult<TAppInfo> =>
      ok(AppInfoSchema.parse({ name: source.getName(), version: source.getVersion(), mode: source.mode })),
    [IPC.app.showMenu]: (raw: unknown): TIpcResult<null> => {
      const parsed = ShowMenuRequestSchema.safeParse(raw);
      if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
      source.showMenu(parsed.data);
      return ok(null);
    },
  };
}
