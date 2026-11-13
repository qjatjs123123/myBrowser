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
    /** 확대/축소·페이지 내 찾기 (spec 021) */
    zoom: 'tabs:zoom',
    find: 'tabs:find',
    stopFind: 'tabs:stopFind',
    findUpdated: 'tabs:findUpdated',
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
    /** Linux 창 이동·크기 조절 — renderer 포인터를 main 이 창 bounds 로 옮긴다 (spec 016) */
    pointerStart: 'window:pointerStart',
    pointerMove: 'window:pointerMove',
    pointerEnd: 'window:pointerEnd',
    /** main→renderer — 최대화·전체 화면 상태 (spec 014) */
    stateChanged: 'window:stateChanged',
  },
  /** 지난 실행 기록 조회 (spec 012) — 조회만 한다 */
  runs: {
    list: 'runs:list',
    get: 'runs:get',
  },
  /** 에이전트 스킬(사용자 지침) 관리 (spec 013) */
  skills: {
    list: 'skills:list',
    create: 'skills:create',
    update: 'skills:update',
    delete: 'skills:delete',
  },
  /** 북마크 (spec 021) — 응답은 최신 추가 순 전체 목록 */
  bookmarks: {
    list: 'bookmarks:list',
    add: 'bookmarks:add',
    remove: 'bookmarks:remove',
  },
  /** 방문 기록 (spec 021) — 기록은 main 이 탭 로드 완료 때 직접 남긴다 */
  history: {
    list: 'history:list',
    remove: 'history:remove',
    clear: 'history:clear',
  },
} as const;

type TValues<T> = T extends string ? T : { [K in keyof T]: TValues<T[K]> }[keyof T];

/** 등록 가능한 모든 채널명 */
export type TIpcChannel = TValues<typeof IPC>;
