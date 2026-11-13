// renderer 단위 테스트 — jest-dom matcher + window.api mock (각 테스트에서 mockResolvedValue 로 응답을 준다)
import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/** 구독 mock — 호출되면 해제용 vi.fn 을 돌려준다 (vi.clearAllMocks 뒤에도 유지되도록 구현으로 둔다) */
function createSubscribeMock(): ReturnType<typeof vi.fn> {
  return vi.fn(() => vi.fn());
}

/** skills.* 기본 응답 — ok({ skillList: [] }) (spec 013) */
const EMPTY_SKILL_LIST_RESULT = { ok: true, data: { skillList: [] } } as const;
/** tabs.list 기본 응답 — 탭 없음. 입력창 추천 훅(spec 019)이 탭을 구독해도 기존 테스트가 깨지지 않게 */
const EMPTY_TAB_LIST_RESULT = { ok: true, data: { tabList: [], activeTabId: null } } as const;
/** runs.list 기본 응답 — 기록 없음 (spec 019 추천 훅이 마운트 때 부른다) */
const EMPTY_RUN_LIST_RESULT = { ok: true, data: { runList: [] } } as const;
/** bookmarks.* 기본 응답 — 북마크 없음 (spec 021) */
const EMPTY_BOOKMARK_LIST_RESULT = { ok: true, data: { bookmarkList: [] } } as const;
/** history.list 기본 응답 — 기록 없음 (spec 021) */
const EMPTY_HISTORY_LIST_RESULT = { ok: true, data: { entryList: [] } } as const;
/** 돌려줄 데이터 없는 성공 */
const EMPTY_OK_RESULT = { ok: true, data: null } as const;

Object.defineProperty(window, 'api', {
  configurable: true,
  value: {
    app: { getInfo: vi.fn(), showMenu: vi.fn() },
    tabs: {
      list: vi.fn(() => Promise.resolve(EMPTY_TAB_LIST_RESULT)),
      create: vi.fn(),
      close: vi.fn(),
      activate: vi.fn(),
      navigate: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      stop: vi.fn(),
      setBounds: vi.fn(),
      onChanged: createSubscribeMock(),
      zoom: vi.fn(() => Promise.resolve(EMPTY_OK_RESULT)),
      find: vi.fn(() => Promise.resolve(EMPTY_OK_RESULT)),
      stopFind: vi.fn(() => Promise.resolve(EMPTY_OK_RESULT)),
      onFindUpdated: createSubscribeMock(),
    },
    shortcut: { onPressed: createSubscribeMock() },
    agent: {
      start: vi.fn(),
      stop: vi.fn(),
      approve: vi.fn(),
      answer: vi.fn(),
      onEvent: createSubscribeMock(),
    },
    account: {
      getStatus: vi.fn(() => Promise.resolve({ ok: true, data: { state: 'not_required' } })),
      startActivation: vi.fn(),
      cancelActivation: vi.fn(),
      openManage: vi.fn(),
      signOut: vi.fn(),
      onChanged: createSubscribeMock(),
    },
    window: {
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      close: vi.fn(),
      pointerStart: vi.fn(),
      pointerMove: vi.fn(),
      pointerEnd: vi.fn(),
      onStateChanged: createSubscribeMock(),
    },
    runs: { list: vi.fn(() => Promise.resolve(EMPTY_RUN_LIST_RESULT)), get: vi.fn() },
    skills: {
      list: vi.fn(() => Promise.resolve(EMPTY_SKILL_LIST_RESULT)),
      create: vi.fn(() => Promise.resolve(EMPTY_SKILL_LIST_RESULT)),
      update: vi.fn(() => Promise.resolve(EMPTY_SKILL_LIST_RESULT)),
      delete: vi.fn(() => Promise.resolve(EMPTY_SKILL_LIST_RESULT)),
    },
    bookmarks: {
      list: vi.fn(() => Promise.resolve(EMPTY_BOOKMARK_LIST_RESULT)),
      add: vi.fn(() => Promise.resolve(EMPTY_BOOKMARK_LIST_RESULT)),
      remove: vi.fn(() => Promise.resolve(EMPTY_BOOKMARK_LIST_RESULT)),
    },
    history: {
      list: vi.fn(() => Promise.resolve(EMPTY_HISTORY_LIST_RESULT)),
      remove: vi.fn(() => Promise.resolve(EMPTY_OK_RESULT)),
      clear: vi.fn(() => Promise.resolve(EMPTY_OK_RESULT)),
    },
  },
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
