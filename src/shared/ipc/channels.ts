/**
 * [IPC 채널] renderer ↔ main 채널명의 단일 출처 — 형식 `{모듈}:{동작}`.
 * 규칙: .claude/rules/electron/ipc.md 「채널명」
 */
export const IPC = {
  app: { getInfo: 'app:getInfo' },
} as const;

type TValues<T> = T extends string ? T : { [K in keyof T]: TValues<T[K]> }[keyof T];

/** 등록 가능한 모든 채널명 */
export type TIpcChannel = TValues<typeof IPC>;
