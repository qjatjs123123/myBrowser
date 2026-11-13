import { WebContentsView, type Input, type WebContents, type WebContentsViewConstructorOptions } from 'electron';

import { log } from '../log';

import type { ITabFindResult, ITabView, ITabViewState } from './tabType';
import { isAllowedTabUrl } from './urlPolicy';

/** 탭 상태가 바뀌었다고 볼 webContents 이벤트 (파비콘은 값을 기억해야 해서 따로 듣는다) */
const STATE_EVENT_LIST = [
  'did-start-loading',
  'did-stop-loading',
  'did-navigate',
  'did-navigate-in-page',
  'page-title-updated',
] as const;

/** before-input-event 의 event 중 단축키 처리에 필요한 부분 */
export interface IPreventableEvent {
  preventDefault(): void;
}

export interface IElectronTabViewOptions {
  /** 탭 페이지에 포커스가 있을 때의 키 입력 — 단축키 판정은 shortcuts.ts 한 경로 */
  onInput: (event: IPreventableEvent, input: Input) => void;
}

interface ITabListeners {
  stateList: Array<() => void>;
  openList: Array<(url: string) => void>;
  findList: Array<(result: ITabFindResult) => void>;
  loadedList: Array<(page: { url: string; title: string }) => void>;
  zoomWheelList: Array<(direction: 'in' | 'out') => void>;
  faviconUrl: string | null;
}

const PERCENT = 100;

/**
 * [탭 View 옵션] 웹페이지 탭의 보안 기본값 (SR-1) — preload 없음, persist:browsing 세션.
 * 규칙: .claude/rules/electron/main.md 「보안 기본값」 — 바꾸지 않는다
 */
export function createTabViewOptions(): WebContentsViewConstructorOptions {
  return {
    webPreferences: {
      partition: 'persist:browsing',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  };
}

/** [탭 View 어댑터] WebContentsView 를 ITabView 로 감싼다 — 팝업은 deny 후 새 탭 요청, 정책 밖 이동은 막는다 (SR-2) */
export function createElectronTabView({ onInput }: IElectronTabViewOptions): ITabView {
  const view = new WebContentsView(createTabViewOptions());
  const listeners: ITabListeners = {
    stateList: [],
    openList: [],
    findList: [],
    loadedList: [],
    zoomWheelList: [],
    faviconUrl: null,
  };
  attachStateEvents(view.webContents, listeners);
  attachPageEvents(view.webContents, listeners);
  attachNavigationPolicy(view.webContents, listeners);
  view.webContents.on('before-input-event', (event, input) => onInput(event, input));
  return toTabView(view, listeners);
}

/** 로딩·이동·제목·파비콘 이벤트를 상태 변경 콜백으로 모은다 */
function attachStateEvents(webContents: WebContents, listeners: ITabListeners): void {
  const emitState = () => listeners.stateList.forEach((cb) => cb());
  webContents.on('did-navigate', () => (listeners.faviconUrl = null));
  for (const eventName of STATE_EVENT_LIST) webContents.on(eventName as 'did-stop-loading', emitState);
  webContents.on('page-favicon-updated', (_event, faviconList) => {
    listeners.faviconUrl = faviconList[0] ?? null;
    emitState();
  });
}

/**
 * 찾기 결과(마지막 갱신만)·메인 프레임 로드 완료·Ctrl+휠 (spec 021).
 * 다른 페이지로 이동하면 지난 찾기 강조를 지운다 (FR-9) — 같은 문서 안 이동(#hash)은 그대로.
 */
function attachPageEvents(webContents: WebContents, listeners: ITabListeners): void {
  webContents.on('found-in-page', (_event, result) => {
    if (!result.finalUpdate) return;
    const found = { activeMatch: result.activeMatchOrdinal, matchCount: result.matches };
    listeners.findList.forEach((cb) => cb(found));
  });
  webContents.on('did-finish-load', () => {
    const page = { url: webContents.getURL(), title: webContents.getTitle() };
    listeners.loadedList.forEach((cb) => cb(page));
  });
  webContents.on('did-navigate', () => webContents.stopFindInPage('clearSelection'));
  webContents.on('zoom-changed', (_event, direction) => {
    listeners.zoomWheelList.forEach((cb) => cb(direction));
  });
}

/** 팝업은 항상 deny(허용 url 만 새 탭 요청), 정책 밖 이동은 preventDefault — 별도 창은 만들지 않는다 */
function attachNavigationPolicy(webContents: WebContents, listeners: ITabListeners): void {
  webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedTabUrl(url)) listeners.openList.forEach((cb) => cb(url));
    return { action: 'deny' };
  });
  webContents.on('will-navigate', (event) => {
    if (!isAllowedTabUrl(event.url)) event.preventDefault();
  });
}

function toTabView(view: WebContentsView, listeners: ITabListeners): ITabView {
  const { webContents } = view;
  const getCdpTargetId = createCachedTargetIdReader(webContents);
  return {
    nativeView: view,
    load: (url) => void loadUrl(webContents, url),
    goBack: () => webContents.navigationHistory.goBack(),
    goForward: () => webContents.navigationHistory.goForward(),
    reload: () => webContents.reload(),
    stop: () => webContents.stop(),
    getState: () => readState(webContents, listeners.faviconUrl),
    onStateChanged: (cb) => listeners.stateList.push(cb),
    onOpenWindow: (cb) => listeners.openList.push(cb),
    setZoomPercent: (percent) => webContents.setZoomFactor(percent / PERCENT),
    // Electron 의 findNext=true 는 "새 검색 세션 시작" — 우리 isNext(같은 검색어의 다음 결과)와 뜻이 반대다
    findInPage: (text, { isForward, isNext }) => void webContents.findInPage(text, { forward: isForward, findNext: !isNext }),
    stopFindInPage: () => webContents.stopFindInPage('clearSelection'),
    onFindUpdated: (cb) => listeners.findList.push(cb),
    onPageLoaded: (cb) => listeners.loadedList.push(cb),
    onZoomWheel: (cb) => listeners.zoomWheelList.push(cb),
    setBounds: (rect) => view.setBounds(rect),
    setVisible: (isVisible) => view.setVisible(isVisible),
    setBorderRadius: (radius) => view.setBorderRadius(radius),
    focus: () => webContents.focus(),
    destroy: () => {
      if (!webContents.isDestroyed()) webContents.close();
    },
    getCdpTargetId,
  };
}

/** targetId 는 webContents 수명 동안 바뀌지 않는다 — 첫 성공 값을 캐시하고, 실패하면 다음 호출에서 다시 읽는다 */
function createCachedTargetIdReader(webContents: WebContents): () => Promise<string> {
  let cached: Promise<string> | null = null;
  return () => {
    cached ??= readCdpTargetId(webContents).catch((error: unknown) => {
      cached = null;
      throw error;
    });
    return cached;
  };
}

/** webContents.debugger 로 자기 CDP targetId 를 읽는다 — 이미 붙어 있으면 attach 를 생략 */
async function readCdpTargetId(webContents: WebContents): Promise<string> {
  if (!webContents.debugger.isAttached()) webContents.debugger.attach('1.3');
  const result = (await webContents.debugger.sendCommand('Target.getTargetInfo')) as {
    targetInfo: { targetId: string };
  };
  return result.targetInfo.targetId;
}

function readState(webContents: WebContents, faviconUrl: string | null): ITabViewState {
  return {
    url: webContents.getURL(),
    title: webContents.getTitle(),
    faviconUrl,
    isLoading: webContents.isLoading(),
    canGoBack: webContents.navigationHistory.canGoBack(),
    canGoForward: webContents.navigationHistory.canGoForward(),
    zoomPercent: Math.round(webContents.getZoomFactor() * PERCENT),
  };
}

/** loadURL 은 다른 이동으로 끊기면(ERR_ABORTED) reject 한다 — 정상 흐름이라 warn 으로만 남긴다 */
async function loadUrl(webContents: WebContents, url: string): Promise<void> {
  try {
    await webContents.loadURL(url);
  } catch (error) {
    log.warn('tabs', `페이지 로드 중단: ${url}`, error);
  }
}
