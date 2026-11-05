import { describe, expect, it, vi } from 'vitest';

import { IPC } from '@shared/ipc/channels';
import type { TTabsSnapshot } from '@shared/ipc/tabs';

import { createTabsHandlers, type ITabsHandlerTarget } from '../handlers/tabs';

const SNAPSHOT: TTabsSnapshot = {
  tabList: [
    {
      id: 'tab-1',
      url: 'about:blank',
      title: '새 탭',
      faviconUrl: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isNewTab: true,
    },
  ],
  activeTabId: 'tab-1',
};

function setup() {
  const tabManager = {
    getSnapshot: vi.fn(() => SNAPSHOT),
    createTab: vi.fn(() => 'tab-2'),
    closeTab: vi.fn(),
    activateTab: vi.fn(),
    navigate: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    reload: vi.fn(),
    stop: vi.fn(),
    setBounds: vi.fn(),
    hasTab: vi.fn((id: string) => id === 'tab-1'),
  } satisfies ITabsHandlerTarget;
  return { tabManager, handlers: createTabsHandlers(tabManager) };
}

describe('tabs 핸들러 list·create', () => {
  it('tabs:list 는 스냅샷을 성공 봉투로 돌려준다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.tabs.list]()).toEqual({ ok: true, data: SNAPSHOT });
  });

  it('tabs:list 에 인자가 오면 INVALID_INPUT 이다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.tabs.list]({ x: 1 })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('tabs:create 에 url 이 없으면 새 탭을 만든다', () => {
    const { handlers, tabManager } = setup();
    expect(handlers[IPC.tabs.create]({})).toEqual({ ok: true, data: { tabId: 'tab-2' } });
    expect(tabManager.createTab).toHaveBeenCalledWith(undefined);
  });

  it('tabs:create 에 url 이 있으면 그 url 로 만든다', () => {
    const { handlers, tabManager } = setup();
    handlers[IPC.tabs.create]({ url: 'https://a.com/' });
    expect(tabManager.createTab).toHaveBeenCalledWith('https://a.com/');
  });

  it('tabs:create 에 file: url 이면 INVALID_INPUT 이고 탭을 만들지 않는다', () => {
    const { handlers, tabManager } = setup();
    expect(handlers[IPC.tabs.create]({ url: 'file:///etc/passwd' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT', message: '요청 형식이 올바르지 않습니다' },
    });
    expect(tabManager.createTab).not.toHaveBeenCalled();
  });
});

describe('tabs 핸들러 탭 대상 채널', () => {
  it.each([
    [IPC.tabs.close, 'closeTab'],
    [IPC.tabs.activate, 'activateTab'],
    [IPC.tabs.goBack, 'goBack'],
    [IPC.tabs.goForward, 'goForward'],
    [IPC.tabs.reload, 'reload'],
    [IPC.tabs.stop, 'stop'],
  ] as const)('%s 는 성공 봉투와 함께 %s(tabId) 를 부른다', (channel, method) => {
    const { handlers, tabManager } = setup();
    expect(handlers[channel]({ tabId: 'tab-1' })).toEqual({ ok: true, data: null });
    expect(tabManager[method]).toHaveBeenCalledWith('tab-1');
  });

  it.each([IPC.tabs.close, IPC.tabs.activate, IPC.tabs.goBack, IPC.tabs.goForward, IPC.tabs.reload, IPC.tabs.stop])(
    '%s 에 없는 탭이면 NOT_FOUND 이다',
    (channel) => {
      const { handlers } = setup();
      expect(handlers[channel]({ tabId: 'tab-9' })).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: '탭을 찾을 수 없습니다' },
      });
    },
  );

  it('빈 tabId 면 INVALID_INPUT 이고 TabManager 를 부르지 않는다', () => {
    const { handlers, tabManager } = setup();
    expect(handlers[IPC.tabs.close]({ tabId: '' })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(tabManager.closeTab).not.toHaveBeenCalled();
  });
});

describe('tabs 핸들러 navigate·setBounds', () => {
  it('tabs:navigate 는 tabId·url 로 navigate 를 부른다', () => {
    const { handlers, tabManager } = setup();
    expect(handlers[IPC.tabs.navigate]({ tabId: 'tab-1', url: 'https://a.com/' })).toEqual({ ok: true, data: null });
    expect(tabManager.navigate).toHaveBeenCalledWith('tab-1', 'https://a.com/');
  });

  it('tabs:navigate 에 file: url 이면 INVALID_INPUT 이다', () => {
    const { handlers, tabManager } = setup();
    expect(handlers[IPC.tabs.navigate]({ tabId: 'tab-1', url: 'file:///etc/passwd' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    expect(tabManager.navigate).not.toHaveBeenCalled();
  });

  it('tabs:navigate 에 없는 탭이면 NOT_FOUND 이다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.tabs.navigate]({ tabId: 'tab-9', url: 'https://a.com/' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('tabs:setBounds 는 rect 를 넘긴다', () => {
    const { handlers, tabManager } = setup();
    const rect = { x: 0, y: 76, width: 800, height: 600 };
    expect(handlers[IPC.tabs.setBounds](rect)).toEqual({ ok: true, data: null });
    expect(tabManager.setBounds).toHaveBeenCalledWith(rect);
  });

  it('tabs:setBounds 에 음수가 있으면 INVALID_INPUT 이다', () => {
    const { handlers, tabManager } = setup();
    expect(handlers[IPC.tabs.setBounds]({ x: -1, y: 0, width: 1, height: 1 })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    expect(tabManager.setBounds).not.toHaveBeenCalled();
  });
});
