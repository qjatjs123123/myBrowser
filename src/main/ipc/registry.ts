import type { TIpcChannel } from '@shared/ipc/channels';
import { fail } from '@shared/ipc/result';

import { log } from '../log';

/** 채널 → 핸들러 (첫 인자 event 는 쓰지 않는다) */
export type THandlerMap = Partial<Record<TIpcChannel, (...args: unknown[]) => unknown>>;

/** ipcMain 중 등록에 필요한 부분 — 테스트에서 가짜를 넣는다 */
export interface IIpcMainLike {
  handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => void;
}

/**
 * [IPC 등록표] 채널 ↔ 핸들러를 한 곳에서 등록한다. 핸들러가 throw 하면 INTERNAL 실패 봉투로 감싸고 [main.error] 로 남긴다.
 * 규칙: .claude/rules/electron/ipc.md 「핸들러」 — 새 채널은 handlers 에 추가하고 여기로 넘긴다
 */
export function registerIpc(ipcMain: IIpcMainLike, handlers: THandlerMap): TIpcChannel[] {
  const channelList = Object.keys(handlers) as TIpcChannel[];
  for (const channel of channelList) {
    const handler = handlers[channel];
    if (!handler) continue;
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return await handler(...args);
      } catch (error) {
        log.error('ipc', `${channel} 처리 실패`, error);
        return fail('INTERNAL', '앱 내부 오류가 발생했습니다. 다시 시도해 주세요');
      }
    });
  }
  return channelList;
}
