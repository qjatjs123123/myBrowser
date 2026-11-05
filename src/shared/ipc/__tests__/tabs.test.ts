import { describe, expect, it } from 'vitest';

import {
  CreateTabRequestSchema,
  CreateTabResponseSchema,
  EmptyResponseSchema,
  NavigateRequestSchema,
  SetBoundsRequestSchema,
  TabRequestSchema,
  TabsSnapshotSchema,
  TabStateSchema,
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
