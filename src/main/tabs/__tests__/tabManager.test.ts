import { describe, expect, it, vi } from 'vitest';

import type { TTabsSnapshot } from '@shared/ipc/tabs';

import { TabManager } from '../tabManager';
import type { ITabHost, ITabView, ITabViewState } from '../tabType';

interface IFakeTabView extends ITabView {
  state: ITabViewState;
  emitStateChanged: () => void;
  emitOpenWindow: (url: string) => void;
}

/** 가짜 View — load 하면 url 이 바뀌고 상태 변경 콜백을 테스트가 직접 부른다 */
function createFakeView(): IFakeTabView {
  let stateListener = () => {};
  let openListener: (url: string) => void = () => {};
  const view: IFakeTabView = {
    state: { url: '', title: '', faviconUrl: null, isLoading: false, canGoBack: false, canGoForward: false },
    load: vi.fn((url: string) => {
      view.state = { ...view.state, url };
    }),
    goBack: vi.fn(),
    goForward: vi.fn(),
    reload: vi.fn(),
    stop: vi.fn(),
    getState: () => view.state,
    onStateChanged: (cb) => (stateListener = cb),
    onOpenWindow: (cb) => (openListener = cb),
    setBounds: vi.fn(),
    setVisible: vi.fn(),
    focus: vi.fn(),
    destroy: vi.fn(),
    getCdpTargetId: vi.fn(async () => `target-of-${view.state.url}`),
    nativeView: {},
    emitStateChanged: () => stateListener(),
    emitOpenWindow: (url) => openListener(url),
  };
  return view;
}

function setup() {
  const viewList: IFakeTabView[] = [];
  const host: ITabHost = { addChildView: vi.fn(), removeChildView: vi.fn() };
  const onChanged = vi.fn<(snapshot: TTabsSnapshot) => void>();
  const manager = new TabManager({
    host,
    onChanged,
    createView: () => {
      const view = createFakeView();
      viewList.push(view);
      return view;
    },
  });
  const lastSnapshot = () => onChanged.mock.calls.at(-1)?.[0];
  return { manager, host, onChanged, viewList, lastSnapshot };
}

const BOUNDS = { x: 0, y: 76, width: 800, height: 600 };

describe('TabManager 생성', () => {
  it('탭을 만들면 활성 탭이 되고 host 에 붙고 onChanged 가 불린다', () => {
    const { manager, host, viewList, lastSnapshot } = setup();
    const id = manager.createTab('https://a.com/');
    expect(id).toBe('tab-1');
    expect(manager.getActiveTabId()).toBe('tab-1');
    expect(host.addChildView).toHaveBeenCalledWith(viewList[0]?.nativeView);
    expect(viewList[0]?.load).toHaveBeenCalledWith('https://a.com/');
    expect(lastSnapshot()?.activeTabId).toBe('tab-1');
  });

  it('url 없이 만들면 about:blank 새 탭이고 숨김·제목 "새 탭" 이다', () => {
    const { manager, viewList, lastSnapshot } = setup();
    manager.setBounds(BOUNDS);
    manager.createTab();
    expect(viewList[0]?.load).toHaveBeenCalledWith('about:blank');
    expect(viewList[0]?.setVisible).toHaveBeenLastCalledWith(false);
    expect(lastSnapshot()?.tabList[0]).toMatchObject({ isNewTab: true, title: '새 탭', url: 'about:blank' });
  });

  it('허용되지 않는 url 로 만들면 새 탭으로 연다', () => {
    const { manager, viewList } = setup();
    manager.createTab('file:///etc/passwd');
    expect(viewList[0]?.load).toHaveBeenCalledWith('about:blank');
  });

  it('제목이 비어 있으면 url 을 제목으로 쓴다', () => {
    const { manager, lastSnapshot } = setup();
    manager.createTab('https://a.com/');
    expect(lastSnapshot()?.tabList[0]?.title).toBe('https://a.com/');
  });
});

describe('TabManager 전환·bounds', () => {
  it('전환하면 이전 View 는 숨기고 새 View 는 bounds 와 함께 보인다', () => {
    const { manager, viewList } = setup();
    manager.setBounds(BOUNDS);
    const firstId = manager.createTab('https://a.com/');
    manager.createTab('https://b.com/');
    manager.activateTab(firstId);
    expect(viewList[1]?.setVisible).toHaveBeenLastCalledWith(false);
    expect(viewList[0]?.setVisible).toHaveBeenLastCalledWith(true);
    expect(viewList[0]?.setBounds).toHaveBeenLastCalledWith(BOUNDS);
  });

  it('setBounds 는 활성 View 에만 적용된다', () => {
    const { manager, viewList } = setup();
    manager.createTab('https://a.com/');
    manager.createTab('https://b.com/');
    manager.setBounds(BOUNDS);
    expect(viewList[1]?.setBounds).toHaveBeenCalledWith(BOUNDS);
    expect(viewList[0]?.setBounds).not.toHaveBeenCalled();
  });

  it('cycleTab 은 양방향으로 순환한다', () => {
    const { manager } = setup();
    manager.createTab('https://a.com/');
    manager.createTab('https://b.com/');
    manager.createTab('https://c.com/');
    manager.cycleTab(1);
    expect(manager.getActiveTabId()).toBe('tab-1');
    manager.cycleTab(-1);
    expect(manager.getActiveTabId()).toBe('tab-3');
    manager.cycleTab(-1);
    expect(manager.getActiveTabId()).toBe('tab-2');
  });

  it('없는 id 는 hasTab 이 false 이고 activateTab 은 무시된다', () => {
    const { manager } = setup();
    manager.createTab();
    expect(manager.hasTab('tab-9')).toBe(false);
    manager.activateTab('tab-9');
    expect(manager.getActiveTabId()).toBe('tab-1');
  });
});

describe('TabManager 닫기', () => {
  it('활성 탭을 닫으면 오른쪽 이웃이 활성되고 host 에서 떼고 destroy 한다', () => {
    const { manager, host, viewList } = setup();
    const firstId = manager.createTab('https://a.com/');
    manager.createTab('https://b.com/');
    manager.activateTab(firstId);
    manager.closeTab(firstId);
    expect(manager.getActiveTabId()).toBe('tab-2');
    expect(host.removeChildView).toHaveBeenCalledWith(viewList[0]?.nativeView);
    expect(viewList[0]?.destroy).toHaveBeenCalled();
  });

  it('맨 오른쪽 활성 탭을 닫으면 왼쪽 이웃이 활성된다', () => {
    const { manager } = setup();
    manager.createTab('https://a.com/');
    const lastId = manager.createTab('https://b.com/');
    manager.closeTab(lastId);
    expect(manager.getActiveTabId()).toBe('tab-1');
  });

  it('비활성 탭을 닫으면 활성 탭은 그대로다', () => {
    const { manager } = setup();
    const firstId = manager.createTab('https://a.com/');
    manager.createTab('https://b.com/');
    manager.closeTab(firstId);
    expect(manager.getActiveTabId()).toBe('tab-2');
  });

  it('마지막 탭을 닫으면 새 탭 1개가 열린다', () => {
    const { manager, lastSnapshot } = setup();
    manager.closeTab(manager.createTab('https://a.com/'));
    expect(lastSnapshot()?.tabList).toHaveLength(1);
    expect(lastSnapshot()?.tabList[0]).toMatchObject({ id: 'tab-2', isNewTab: true });
    expect(lastSnapshot()?.activeTabId).toBe('tab-2');
  });
});

describe('TabManager 탐색·View 이벤트', () => {
  it('navigate·goBack·goForward·reload·stop 은 해당 View 에 위임한다', () => {
    const { manager, viewList } = setup();
    const id = manager.createTab();
    manager.navigate(id, 'https://a.com/');
    manager.goBack(id);
    manager.goForward(id);
    manager.reload(id);
    manager.stop(id);
    const view = viewList[0];
    expect(view?.load).toHaveBeenLastCalledWith('https://a.com/');
    for (const fn of [view?.goBack, view?.goForward, view?.reload, view?.stop]) expect(fn).toHaveBeenCalledTimes(1);
  });

  it('navigate 는 허용되지 않는 url 을 무시한다', () => {
    const { manager, viewList } = setup();
    const id = manager.createTab();
    manager.navigate(id, 'javascript:alert(1)');
    expect(viewList[0]?.load).toHaveBeenCalledTimes(1);
  });

  it('View 가 about:blank 에서 https 로 바뀌면 isNewTab false 가 되고 보인다', () => {
    const { manager, viewList, lastSnapshot } = setup();
    manager.setBounds(BOUNDS);
    manager.createTab();
    const view = viewList[0]!;
    view.state = { ...view.state, url: 'https://a.com/', title: 'A' };
    view.emitStateChanged();
    expect(lastSnapshot()?.tabList[0]).toMatchObject({ isNewTab: false, title: 'A' });
    expect(view.setVisible).toHaveBeenLastCalledWith(true);
    expect(view.setBounds).toHaveBeenLastCalledWith(BOUNDS);
  });

  it('onOpenWindow 가 허용 url 이면 새 활성 탭으로 연다', () => {
    const { manager, viewList } = setup();
    manager.createTab('https://a.com/');
    viewList[0]?.emitOpenWindow('https://b.com/');
    expect(manager.getActiveTabId()).toBe('tab-2');
    expect(viewList[1]?.load).toHaveBeenCalledWith('https://b.com/');
  });

  it('onOpenWindow 가 file: 이면 무시한다', () => {
    const { manager, viewList } = setup();
    manager.createTab('https://a.com/');
    viewList[0]?.emitOpenWindow('file:///etc/passwd');
    expect(viewList).toHaveLength(1);
    expect(manager.getSnapshot().tabList).toHaveLength(1);
  });
});

describe('TabManager CDP targetId', () => {
  it('있는 탭이면 그 View 의 targetId 를 돌려준다', async () => {
    const { manager, viewList } = setup();
    const id = manager.createTab('https://a.com/');
    await expect(manager.getCdpTargetId(id)).resolves.toBe('target-of-https://a.com/');
    expect(viewList[0]?.getCdpTargetId).toHaveBeenCalledTimes(1);
  });

  it('없는 탭이면 null 을 돌려준다', async () => {
    const { manager } = setup();
    manager.createTab('https://a.com/');
    await expect(manager.getCdpTargetId('tab-99')).resolves.toBeNull();
  });
});
