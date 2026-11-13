import { WebContentsView } from 'electron';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { createElectronTabView, createTabViewOptions } from '../electronTabView';

interface IMockWebContents {
  on: Mock;
  setWindowOpenHandler: Mock;
  getURL: Mock;
  getTitle: Mock;
  setZoomFactor: Mock;
  findInPage: Mock;
  stopFindInPage: Mock;
  close: Mock;
  isDestroyed: Mock;
  debugger: { attach: Mock; isAttached: Mock; sendCommand: Mock };
}

/** vitest.setup.main.ts 의 mock WebContentsView 로 어댑터를 만들고 기록된 리스너를 꺼낼 수 있게 한다 */
function setup() {
  const onInput = vi.fn();
  const tabView = createElectronTabView({ onInput });
  const webContents = (tabView.nativeView as { webContents: IMockWebContents }).webContents;
  const listenersOf = (eventName: string) =>
    webContents.on.mock.calls
      .filter(([name]) => name === eventName)
      .map(([, listener]) => listener as (...args: unknown[]) => unknown);
  const windowOpenHandler = webContents.setWindowOpenHandler.mock.calls[0]?.[0] as (details: {
    url: string;
  }) => unknown;
  return { tabView, webContents, onInput, listenersOf, windowOpenHandler };
}

function fireWillNavigate(listenersOf: ReturnType<typeof setup>['listenersOf'], url: string) {
  const event = { url, preventDefault: vi.fn() };
  for (const listener of listenersOf('will-navigate')) listener(event, url);
  return event;
}

describe('createTabViewOptions', () => {
  it('persist:browsing 세션·격리·샌드박스를 켜고 preload 는 두지 않는다 (SR-1)', () => {
    const { webPreferences } = createTabViewOptions();
    expect(webPreferences).toMatchObject({
      partition: 'persist:browsing',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
    expect(webPreferences).not.toHaveProperty('preload');
  });

  it('WebContentsView 를 이 옵션으로 만든다', () => {
    setup();
    expect(vi.mocked(WebContentsView)).toHaveBeenLastCalledWith(createTabViewOptions());
  });
});

describe('createElectronTabView 팝업', () => {
  it('https 팝업은 deny 하고 onOpenWindow 로 url 을 넘긴다', () => {
    const { tabView, windowOpenHandler } = setup();
    const onOpenWindow = vi.fn();
    tabView.onOpenWindow(onOpenWindow);
    expect(windowOpenHandler({ url: 'https://a.com/' })).toEqual({ action: 'deny' });
    expect(onOpenWindow).toHaveBeenCalledWith('https://a.com/');
  });

  it('file: 팝업은 deny 하고 onOpenWindow 를 부르지 않는다', () => {
    const { tabView, windowOpenHandler } = setup();
    const onOpenWindow = vi.fn();
    tabView.onOpenWindow(onOpenWindow);
    expect(windowOpenHandler({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' });
    expect(onOpenWindow).not.toHaveBeenCalled();
  });
});

describe('createElectronTabView 이동 정책', () => {
  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x'])('%s 이동은 막는다', (url) => {
    const { listenersOf } = setup();
    expect(fireWillNavigate(listenersOf, url).preventDefault).toHaveBeenCalled();
  });

  it.each(['https://a.com/', 'about:blank'])('%s 이동은 막지 않는다', (url) => {
    const { listenersOf } = setup();
    expect(fireWillNavigate(listenersOf, url).preventDefault).not.toHaveBeenCalled();
  });
});

describe('createElectronTabView 상태·입력', () => {
  it.each(['did-start-loading', 'did-stop-loading', 'did-navigate', 'page-title-updated'])(
    '%s 이벤트면 onStateChanged 를 부른다',
    (eventName) => {
      const { tabView, listenersOf } = setup();
      const onStateChanged = vi.fn();
      tabView.onStateChanged(onStateChanged);
      for (const listener of listenersOf(eventName)) listener({});
      expect(onStateChanged).toHaveBeenCalledTimes(1);
    },
  );

  it('파비콘 갱신 이벤트면 첫 파비콘을 상태에 담고 onStateChanged 를 부른다', () => {
    const { tabView, listenersOf } = setup();
    const onStateChanged = vi.fn();
    tabView.onStateChanged(onStateChanged);
    for (const listener of listenersOf('page-favicon-updated')) listener({}, ['https://a.com/favicon.ico']);
    expect(onStateChanged).toHaveBeenCalledTimes(1);
    expect(tabView.getState().faviconUrl).toBe('https://a.com/favicon.ico');
  });

  it('before-input-event 를 onInput 으로 넘긴다', () => {
    const { onInput, listenersOf } = setup();
    const event = { preventDefault: vi.fn() };
    const input = { type: 'keyDown', key: 't', control: true };
    for (const listener of listenersOf('before-input-event')) listener(event, input);
    expect(onInput).toHaveBeenCalledWith(event, input);
  });

  it('destroy 는 아직 살아 있는 webContents 를 닫는다', () => {
    const { tabView, webContents } = setup();
    webContents.isDestroyed.mockReturnValue(false);
    tabView.destroy();
    expect(webContents.close).toHaveBeenCalledTimes(1);
  });
});

describe('createElectronTabView CDP targetId', () => {
  function setupDebugger(isAttached: boolean) {
    const context = setup();
    const cdp = context.webContents.debugger;
    cdp.isAttached.mockReturnValue(isAttached);
    cdp.sendCommand.mockResolvedValue({ targetInfo: { targetId: 'TARGET-1', type: 'page' } });
    return { ...context, cdp };
  }

  it('debugger 를 1.3 으로 붙이고 Target.getTargetInfo 의 targetId 를 돌려준다', async () => {
    const { tabView, cdp } = setupDebugger(false);
    await expect(tabView.getCdpTargetId()).resolves.toBe('TARGET-1');
    expect(cdp.attach).toHaveBeenCalledWith('1.3');
    expect(cdp.sendCommand).toHaveBeenCalledWith('Target.getTargetInfo');
  });

  it('이미 붙어 있으면 attach 하지 않는다', async () => {
    const { tabView, cdp } = setupDebugger(true);
    await tabView.getCdpTargetId();
    expect(cdp.attach).not.toHaveBeenCalled();
  });

  it('두 번 불러도 sendCommand 는 1번만 한다 (캐시)', async () => {
    const { tabView, cdp } = setupDebugger(false);
    await tabView.getCdpTargetId();
    await expect(tabView.getCdpTargetId()).resolves.toBe('TARGET-1');
    expect(cdp.sendCommand).toHaveBeenCalledTimes(1);
  });

  it('읽기에 실패하면 캐시하지 않고 다음 호출에서 다시 읽는다', async () => {
    const { tabView, cdp } = setupDebugger(false);
    cdp.sendCommand.mockRejectedValueOnce(new Error('detached'));
    await expect(tabView.getCdpTargetId()).rejects.toThrow('detached');
    await expect(tabView.getCdpTargetId()).resolves.toBe('TARGET-1');
    expect(cdp.sendCommand).toHaveBeenCalledTimes(2);
  });
});

describe('createElectronTabView 모서리 반지름 (spec 014)', () => {
  it('setBorderRadius 는 WebContentsView 의 setBorderRadius 로 넘긴다', () => {
    const tabView = createElectronTabView({ onInput: vi.fn() });
    tabView.setBorderRadius(10);
    expect((tabView.nativeView as { setBorderRadius: Mock }).setBorderRadius).toHaveBeenCalledWith(10);
  });
});

describe('createElectronTabView 찾기·로드·확대 (spec 021)', () => {
  it('새 검색(isNext=false)은 Electron findNext:true 로 부른다', () => {
    const { tabView, webContents } = setup();
    tabView.findInPage('사과', { isForward: true, isNext: false });
    expect(webContents.findInPage).toHaveBeenCalledWith('사과', { forward: true, findNext: true });
  });

  it('다음 결과(isNext=true)는 Electron findNext:false 로 부른다', () => {
    const { tabView, webContents } = setup();
    tabView.findInPage('사과', { isForward: false, isNext: true });
    expect(webContents.findInPage).toHaveBeenCalledWith('사과', { forward: false, findNext: false });
  });

  it('found-in-page 의 마지막 갱신이면 결과를 넘긴다', () => {
    const { tabView, listenersOf } = setup();
    const onFindUpdated = vi.fn();
    tabView.onFindUpdated(onFindUpdated);
    for (const listener of listenersOf('found-in-page')) {
      listener({}, { requestId: 1, activeMatchOrdinal: 2, matches: 5, finalUpdate: true });
    }
    expect(onFindUpdated).toHaveBeenCalledWith({ activeMatch: 2, matchCount: 5 });
  });

  it('found-in-page 가 중간 갱신이면 무시한다', () => {
    const { tabView, listenersOf } = setup();
    const onFindUpdated = vi.fn();
    tabView.onFindUpdated(onFindUpdated);
    for (const listener of listenersOf('found-in-page')) {
      listener({}, { requestId: 1, activeMatchOrdinal: 1, matches: 2, finalUpdate: false });
    }
    expect(onFindUpdated).not.toHaveBeenCalled();
  });

  it('did-navigate 면 찾기 강조를 지운다', () => {
    const { webContents, listenersOf } = setup();
    for (const listener of listenersOf('did-navigate')) listener({}, 'https://b.com/');
    expect(webContents.stopFindInPage).toHaveBeenCalledWith('clearSelection');
  });

  it('did-finish-load 면 현재 url·제목을 넘긴다', () => {
    const { tabView, webContents, listenersOf } = setup();
    webContents.getURL.mockReturnValue('https://a.com/');
    webContents.getTitle.mockReturnValue('A');
    const onPageLoaded = vi.fn();
    tabView.onPageLoaded(onPageLoaded);
    for (const listener of listenersOf('did-finish-load')) listener({});
    expect(onPageLoaded).toHaveBeenCalledWith({ url: 'https://a.com/', title: 'A' });
  });

  it('zoom-changed 의 in·out 을 그대로 넘긴다', () => {
    const { tabView, listenersOf } = setup();
    const onZoomWheel = vi.fn();
    tabView.onZoomWheel(onZoomWheel);
    for (const listener of listenersOf('zoom-changed')) {
      listener({}, 'in');
      listener({}, 'out');
    }
    expect(onZoomWheel.mock.calls).toEqual([['in'], ['out']]);
  });

  it('배율(%)은 zoomFactor 로 바꿔 적용한다', () => {
    const { tabView, webContents } = setup();
    tabView.setZoomPercent(125);
    expect(webContents.setZoomFactor).toHaveBeenCalledWith(1.25);
  });
});
