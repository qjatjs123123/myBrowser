/**
 * [IPC 채널] renderer ↔ main 채널명의 단일 출처 — 형식 `{모듈}:{동작}`.
 * 규칙: .claude/rules/electron/ipc.md 「채널명」
 */
export const IPC = {
  app: { getInfo: 'app:getInfo' },
  tabs: {
    list: 'tabs:list',
    create: 'tabs:create',
    close: 'tabs:close',
    activate: 'tabs:activate',
    navigate: 'tabs:navigate',
    goBack: 'tabs:goBack',
    goForward: 'tabs:goForward',
    reload: 'tabs:reload',
    stop: 'tabs:stop',
    setBounds: 'tabs:setBounds',
    changed: 'tabs:changed',
  },
  shortcut: { pressed: 'shortcut:pressed' },
  agent: {
    start: 'agent:start',
    stop: 'agent:stop',
    approve: 'agent:approve',
    answer: 'agent:answer',
    event: 'agent:event',
  },
  account: {
    getStatus: 'account:getStatus',
    startActivation: 'account:startActivation',
    cancelActivation: 'account:cancelActivation',
    openManage: 'account:openManage',
    signOut: 'account:signOut',
    changed: 'account:changed',
  },
  /** 프레임 없는 창의 신호등 버튼 (spec 010) — macOS 는 네이티브 신호등이라 renderer 가 부르지 않는다 */
  window: {
    minimize: 'window:minimize',
    toggleMaximize: 'window:toggleMaximize',
    close: 'window:close',
  },
} as const;

type TValues<T> = T extends string ? T : { [K in keyof T]: TValues<T[K]> }[keyof T];

/** 등록 가능한 모든 채널명 */
export type TIpcChannel = TValues<typeof IPC>;
