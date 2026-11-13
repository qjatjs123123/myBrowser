import { describe, expect, it } from 'vitest';

import {
  CreateTabRequestSchema,
  CreateTabResponseSchema,
  EmptyResponseSchema,
  FindInPageRequestSchema,
  FindUpdatedEventSchema,
  NavigateRequestSchema,
  SetBoundsRequestSchema,
  TabRequestSchema,
  TabsSnapshotSchema,
  TabStateSchema,
  ZoomTabRequestSchema,
} from '../tabs';

const VALID_TAB = {
  id: 'tab-1',
  url: 'about:blank',
  title: '새 탭',
  faviconUrl: null,
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  isNewTab: true,
  zoomPercent: 100,
  agentActivity: null,
  internalPage: null,
};

describe('TabRequestSchema', () => {
  it('tabId 가 있으면 통과한다', () => {
    expect(TabRequestSchema.safeParse({ tabId: 'tab-1' }).success).toBe(true);
  });

  it('tabId 가 빈 문자열이면 실패한다', () => {
    expect(TabRequestSchema.safeParse({ tabId: '' }).success).toBe(false);
  });

  it('추가 키가 있으면 실패한다', () => {
    expect(TabRequestSchema.safeParse({ tabId: 'tab-1', extra: true }).success).toBe(false);
  });
});

describe('NavigateRequestSchema', () => {
  it('https·http url 이면 통과한다', () => {
    expect(NavigateRequestSchema.safeParse({ tabId: 'tab-1', url: 'https://a.com/x' }).success).toBe(true);
    expect(NavigateRequestSchema.safeParse({ tabId: 'tab-1', url: 'http://127.0.0.1:8080/' }).success).toBe(true);
  });

  it('file: url 이면 실패한다', () => {
    expect(NavigateRequestSchema.safeParse({ tabId: 'tab-1', url: 'file:///etc/passwd' }).success).toBe(false);
  });

  it('javascript: url 이면 실패한다', () => {
    expect(NavigateRequestSchema.safeParse({ tabId: 'tab-1', url: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('data: url 이면 실패한다', () => {
    expect(NavigateRequestSchema.safeParse({ tabId: 'tab-1', url: 'data:text/html,hi' }).success).toBe(false);
  });

  it('빈 tabId 면 실패한다', () => {
    expect(NavigateRequestSchema.safeParse({ tabId: '', url: 'https://a.com/' }).success).toBe(false);
  });

  it('추가 키가 있으면 실패한다', () => {
    expect(NavigateRequestSchema.safeParse({ tabId: 'tab-1', url: 'https://a.com/', x: 1 }).success).toBe(false);
  });
});

describe('CreateTabRequestSchema', () => {
  it('url 이 없으면 새 탭 요청으로 통과한다', () => {
    expect(CreateTabRequestSchema.safeParse({}).success).toBe(true);
  });

  it('https url 이면 통과한다', () => {
    expect(CreateTabRequestSchema.safeParse({ url: 'https://a.com/' }).success).toBe(true);
  });

  it('file:·javascript: url 이면 실패한다', () => {
    expect(CreateTabRequestSchema.safeParse({ url: 'file:///etc/passwd' }).success).toBe(false);
    expect(CreateTabRequestSchema.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('추가 키가 있으면 실패한다', () => {
    expect(CreateTabRequestSchema.safeParse({ background: true }).success).toBe(false);
  });
});

describe('CreateTabResponseSchema', () => {
  it('tabId 가 있으면 통과하고 비어 있으면 실패한다', () => {
    expect(CreateTabResponseSchema.safeParse({ tabId: 'tab-2' }).success).toBe(true);
    expect(CreateTabResponseSchema.safeParse({ tabId: '' }).success).toBe(false);
  });
});

describe('SetBoundsRequestSchema', () => {
  it('0 이상의 정수 사각형이면 통과한다', () => {
    expect(SetBoundsRequestSchema.safeParse({ x: 0, y: 80, width: 1000, height: 600 }).success).toBe(true);
  });

  it('음수 값이 있으면 실패한다', () => {
    expect(SetBoundsRequestSchema.safeParse({ x: -1, y: 0, width: 10, height: 10 }).success).toBe(false);
  });

  it('소수 값이 있으면 실패한다', () => {
    expect(SetBoundsRequestSchema.safeParse({ x: 0, y: 0.5, width: 10, height: 10 }).success).toBe(false);
  });

  it('추가 키가 있으면 실패한다', () => {
    expect(SetBoundsRequestSchema.safeParse({ x: 0, y: 0, width: 10, height: 10, z: 1 }).success).toBe(false);
  });

  it('값이 빠지면 실패한다', () => {
    expect(SetBoundsRequestSchema.safeParse({ x: 0, y: 0, width: 10 }).success).toBe(false);
  });
});

describe('EmptyResponseSchema', () => {
  it('null 만 통과한다', () => {
    expect(EmptyResponseSchema.safeParse(null).success).toBe(true);
    expect(EmptyResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe('TabStateSchema', () => {
  it('필드가 모두 맞으면 통과한다', () => {
    expect(TabStateSchema.safeParse(VALID_TAB).success).toBe(true);
  });

  it('필드가 빠지면 실패한다', () => {
    const { isNewTab: _omit, ...missing } = VALID_TAB;
    expect(TabStateSchema.safeParse(missing).success).toBe(false);
  });

  it('추가 키가 있으면 실패한다', () => {
    expect(TabStateSchema.safeParse({ ...VALID_TAB, extra: 1 }).success).toBe(false);
  });
});

describe('TabsSnapshotSchema', () => {
  it('탭 목록과 활성 탭 id 가 있으면 통과한다', () => {
    expect(TabsSnapshotSchema.safeParse({ tabList: [VALID_TAB], activeTabId: 'tab-1' }).success).toBe(true);
  });

  it('활성 탭이 없으면 activeTabId null 로 통과한다', () => {
    expect(TabsSnapshotSchema.safeParse({ tabList: [], activeTabId: null }).success).toBe(true);
  });

  it('목록 안의 탭이 잘못되면 실패한다', () => {
    expect(TabsSnapshotSchema.safeParse({ tabList: [{ ...VALID_TAB, id: '' }], activeTabId: null }).success).toBe(
      false,
    );
  });

  it('추가 키가 있으면 실패한다', () => {
    expect(TabsSnapshotSchema.safeParse({ tabList: [], activeTabId: null, extra: 1 }).success).toBe(false);
  });
});

describe('TabStateSchema 의 배율·에이전트 표시 (spec 021)', () => {
  it('zoomPercent 가 500 을 넘으면 실패한다', () => {
    expect(TabStateSchema.safeParse({ ...VALID_TAB, zoomPercent: 600 }).success).toBe(false);
  });

  it('agentActivity 가 working 이면 통과한다', () => {
    expect(TabStateSchema.safeParse({ ...VALID_TAB, agentActivity: 'working' }).success).toBe(true);
  });

  it('agentActivity 가 목록 밖 값이면 실패한다', () => {
    expect(TabStateSchema.safeParse({ ...VALID_TAB, agentActivity: 'done' }).success).toBe(false);
  });
});

describe('ZoomTabRequestSchema', () => {
  it('direction 이 in·out·reset 이면 통과한다', () => {
    for (const direction of ['in', 'out', 'reset']) {
      expect(ZoomTabRequestSchema.safeParse({ tabId: 'tab-1', direction }).success).toBe(true);
    }
  });

  it('direction 이 목록 밖이면 실패한다', () => {
    expect(ZoomTabRequestSchema.safeParse({ tabId: 'tab-1', direction: 'max' }).success).toBe(false);
  });
});

describe('FindInPageRequestSchema', () => {
  const VALID_FIND = { tabId: 'tab-1', text: '사과', isForward: true, isNext: false };

  it('찾을 글자가 있으면 통과한다', () => {
    expect(FindInPageRequestSchema.safeParse(VALID_FIND).success).toBe(true);
  });

  it('찾을 글자가 비면 실패한다', () => {
    expect(FindInPageRequestSchema.safeParse({ ...VALID_FIND, text: '' }).success).toBe(false);
  });

  it('찾을 글자가 201자면 실패한다', () => {
    expect(FindInPageRequestSchema.safeParse({ ...VALID_FIND, text: 'a'.repeat(201) }).success).toBe(false);
  });
});

describe('FindUpdatedEventSchema', () => {
  it('개수가 0 이상 정수면 통과한다', () => {
    expect(FindUpdatedEventSchema.safeParse({ tabId: 'tab-1', activeMatch: 0, matchCount: 0 }).success).toBe(true);
  });

  it('개수가 음수면 실패한다', () => {
    expect(FindUpdatedEventSchema.safeParse({ tabId: 'tab-1', activeMatch: -1, matchCount: 3 }).success).toBe(false);
  });
});

describe('TabStateSchema 의 내부 페이지 (spec 023)', () => {
  it('internalPage 가 history 면 통과한다', () => {
    expect(TabStateSchema.safeParse({ ...VALID_TAB, internalPage: 'history' }).success).toBe(true);
  });

  it('internalPage 가 목록 밖 값이거나 빠지면 실패한다', () => {
    expect(TabStateSchema.safeParse({ ...VALID_TAB, internalPage: 'settings' }).success).toBe(false);
    const { internalPage: _omitted, ...withoutPage } = VALID_TAB;
    expect(TabStateSchema.safeParse(withoutPage).success).toBe(false);
  });
});
