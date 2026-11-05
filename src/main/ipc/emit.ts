import type { z } from 'zod';

import type { TIpcChannel } from '@shared/ipc/channels';

/** 이벤트를 받을 webContents 의 최소 모양 — 테스트에서 가짜를 넣는다 */
export interface IWebContentsLike {
  send(channel: string, ...args: unknown[]): void;
  isDestroyed(): boolean;
}

/** main→renderer 이벤트 발신 함수 — 보내기 전 schema.parse 를 강제한다 */
export type TEmitToSidebar = <T>(channel: TIpcChannel, schema: z.ZodType<T>, payload: T) => void;

/**
 * [이벤트 발신] renderer(크롬+사이드바) webContents 로 이벤트를 보내는 emitToSidebar 를 만든다.
 * 스키마 위반은 우리 버그이므로 throw 해서 일찍 드러내고, 대상이 없거나 닫혔으면 조용히 무시한다.
 * 규칙: .claude/rules/electron/ipc.md 「핸들러」 — 이벤트 발신은 이 함수로만
 */
export function createSidebarEmitter(getWebContents: () => IWebContentsLike | null): TEmitToSidebar {
  return (channel, schema, payload) => {
    const data = schema.parse(payload);
    const webContents = getWebContents();
    if (!webContents || webContents.isDestroyed()) return;
    webContents.send(channel, data);
  };
}
