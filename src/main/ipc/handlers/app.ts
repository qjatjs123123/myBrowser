import { AppInfoSchema, type TAppInfo, type TAppMode } from '@shared/ipc/app';
import { IPC } from '@shared/ipc/channels';
import { ok, type TIpcResult } from '@shared/ipc/result';

interface IAppInfoSource {
  getName: () => string;
  getVersion: () => string;
  mode: TAppMode;
}

/**
 * [app 핸들러] app:getInfo — 요청 입력이 없으므로 검증할 입력은 없고, 응답은 보내기 전에 parse 해 우리 버그를 일찍 잡는다.
 * 규칙: .claude/rules/electron/ipc.md 「핸들러」
 */
export function createAppHandlers(source: IAppInfoSource) {
  return {
    [IPC.app.getInfo]: (): TIpcResult<TAppInfo> =>
      ok(AppInfoSchema.parse({ name: source.getName(), version: source.getVersion(), mode: source.mode })),
  };
}
