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

Object.defineProperty(window, 'api', {
  configurable: true,
  value: {
    app: { getInfo: vi.fn() },
    tabs: {
      list: vi.fn(),
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
    window: { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn(), onStateChanged: createSubscribeMock() },
    runs: { list: vi.fn(), get: vi.fn() },
    skills: {
      list: vi.fn(() => Promise.resolve(EMPTY_SKILL_LIST_RESULT)),
      create: vi.fn(() => Promise.resolve(EMPTY_SKILL_LIST_RESULT)),
      update: vi.fn(() => Promise.resolve(EMPTY_SKILL_LIST_RESULT)),
      delete: vi.fn(() => Promise.resolve(EMPTY_SKILL_LIST_RESULT)),
    },
  },
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
