import type { TRunStatus } from '@shared/agent/run';
import type { TAgentEvent } from '@shared/ipc/agent';
import type { TAgentActivity } from '@shared/ipc/tabs';

/** 표시를 바꿀 탭 쪽 함수 — 실제로는 TabManager.setAgentActivity */
export interface IAgentTabActivityDeps {
  setActivity: (tabId: string | null, activity: TAgentActivity | null) => void;
}

/** 에이전트가 쓰는 탭 포트 중 대상 탭을 바꾸는 부분 (browser/types 의 ITabsPort 와 호환) */
interface ITabsPortLike {
  activate(id: string): void;
  create(url?: string): string;
}

/** run 상태 → 탭 표시. 종료 상태면 null (spec 021 FR-12) */
const ACTIVITY_BY_STATUS: Partial<Record<TRunStatus, TAgentActivity>> = {
  queued: 'working',
  running: 'working',
  waiting_user: 'waiting',
};

/**
 * [에이전트 탭 표시] run 이 다루는 탭에 작업 중·응답 대기 표시를 붙인다 — 표시용일 뿐 에이전트 동작과 무관 (SR-4).
 * 대상 탭은 run 시작 탭이고, 드라이버가 탭을 전환·새로 열면(감싼 포트) 그 탭으로 옮긴다.
 */
export function createAgentTabActivity({ setActivity }: IAgentTabActivityDeps) {
  const state: { tabId: string | null; activity: TAgentActivity | null } = { tabId: null, activity: null };
  const apply = () => setActivity(state.activity === null ? null : state.tabId, state.activity);
  const moveTo = (tabId: string) => {
    state.tabId = tabId;
    if (state.activity !== null) apply();
  };
  return {
    /** run 시작 — 시작 탭을 작업 중으로 */
    startRun: (tabId: string) => {
      state.tabId = tabId;
      state.activity = 'working';
      apply();
    },
    /** 탭 포트를 감싸 전환·새 탭을 대상 탭으로 따라간다 */
    wrapTabsPort: <T extends ITabsPortLike>(port: T): T => ({
      ...port,
      activate: (id: string) => {
        port.activate(id);
        moveTo(id);
      },
      create: (url?: string) => {
        const id = port.create(url);
        moveTo(id);
        return id;
      },
    }),
    /** status 이벤트만 본다 — 종료 상태면 표시를 지운다 */
    handleEvent: (event: TAgentEvent) => {
      if (event.type !== 'status') return;
      state.activity = ACTIVITY_BY_STATUS[event.status] ?? null;
      apply();
    },
  };
}
