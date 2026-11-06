import type { Page } from 'playwright-core';

import type { TTabsSnapshot } from '@shared/ipc/tabs';
import type {
  IBrowserDriver,
  IPoint,
  TActionResult,
  TClickInput,
  TOpenTabInput,
  TOverlayCommand,
  TScreenshotResult,
  TSwitchTabInput,
} from '@shared/tools';

import * as actions from './actions';
import { ActionError, toActionFailure, type IActionOptions } from './actions';
import { DEFAULT_TIMEOUT_MS } from './browserConstants';
import { clearHighlight, getRefCenter, showCursor, showHighlight } from './overlay';
import * as pointer from './pointer';
import { takeScreenshot } from './screenshot';
import { takeSnapshot } from './snapshot';
import { resolvePointTarget, resolveTarget } from './target';
import type { ICdpConnection, ITabsPort } from './types';

export interface ICreateBrowserDriverOptions {
  tabs: ITabsPort;
  /** 앱 수명 동안 공유하는 연결 — driver 는 닫지 않는다 */
  cdp: ICdpConnection;
  /** run 시작 시점의 활성 탭 */
  startTabId: string;
  timeoutMs?: number;
}

interface IDriverState {
  tabs: ITabsPort;
  cdp: ICdpConnection;
  currentTabId: string;
  options: IActionOptions;
  /** 마지막 스크린샷의 CSS px / 스크린샷 px — 스크린샷 전에는 1 */
  scale: number;
}

/**
 * [브라우저 드라이버] 에이전트 도구가 쓰는 IBrowserDriver 구현 — 현재 대상 탭의 Page 에 actions 를 적용한다.
 * switch_tab·open_tab 은 화면의 활성 탭도 바꾸고(tabs 포트) 이후 대상 탭이 된다.
 */
export function createBrowserDriver({ tabs, cdp, startTabId, timeoutMs }: ICreateBrowserDriverOptions): IBrowserDriver {
  const state: IDriverState = { tabs, cdp, currentTabId: startTabId, options: { timeoutMs }, scale: 1 };
  return { ...createPageMethods(state), ...createPixelMethods(state), ...createTabMethods(state) };
}

type TPixelMethodName =
  | 'takeScreenshot'
  | 'clickAt'
  | 'typeRaw'
  | 'pressRaw'
  | 'scrollAt'
  | 'moveTo'
  | 'resolvePointTarget'
  | 'isInViewport'
  | 'showOverlay';

type TPageMethods = Omit<IBrowserDriver, 'listTabs' | 'switchTab' | 'openTab' | 'dispose' | TPixelMethodName>;

/** 좌표 행동 메서드 — 좌표는 스크린샷 픽셀, 실행 전에 state.scale 로 CSS px 로 바꾼다 (spec 004 「좌표 변환」) */
function createPixelMethods(state: IDriverState): Pick<IBrowserDriver, TPixelMethodName> {
  const withPage = (work: (page: Page) => Promise<TActionResult>) => runOnPage(state, work);
  const pointerOptions = () => ({ ...state.options, scale: state.scale });
  const withCursor = (point: IPoint, work: (page: Page) => Promise<TActionResult>) =>
    withPage(async (page) => {
      await showCursor(page, pointer.toCssPoint(point, state.scale));
      return work(page);
    });
  return {
    takeScreenshot: () => captureScreenshot(state),
    clickAt: (input) => withCursor(input, (page) => pointer.clickAt(page, input, pointerOptions())),
    typeRaw: (input) => withPage((page) => pointer.typeRaw(page, input)),
    pressRaw: (input) => withPage((page) => pointer.pressRaw(page, input)),
    scrollAt: (input) => withCursor(input, (page) => pointer.scrollAt(page, input, pointerOptions())),
    moveTo: (input) => withCursor(input, (page) => pointer.moveTo(page, input, pointerOptions())),
    resolvePointTarget: (input) => withPageOr(state, null, (page) => resolvePointTarget(page, input, state.scale)),
    isInViewport: (input) => withPageOr(state, false, (page) => pointer.isInViewport(page, input, state.scale)),
    showOverlay: (cmd) => withPageOr(state, undefined, (page) => applyOverlay(page, cmd, state.scale)),
  };
}

/** 스크린샷이 성공했을 때만 비율을 갱신하고, 계약 모양(scale 제외)으로 돌려준다 */
async function captureScreenshot(state: IDriverState): Promise<TScreenshotResult> {
  let page: Page;
  try {
    page = await getCurrentPage(state);
  } catch (error) {
    return toActionFailure(error);
  }
  const result = await takeScreenshot(page);
  if (!result.ok) return result;
  state.scale = result.scale;
  return { ok: true, pngBase64: result.pngBase64, width: result.width, height: result.height };
}

/** 오버레이 명령 위임 — 좌표는 CSS px 로 바꿔 보낸다. overlay 함수들이 실패를 삼킨다 */
async function applyOverlay(page: Page, cmd: TOverlayCommand, scale: number): Promise<void> {
  if (cmd.kind === 'clear') return clearHighlight(page);
  if (cmd.kind === 'cursor') return showCursor(page, pointer.toCssPoint(cmd.point, scale));
  return showHighlight(page, 'ref' in cmd ? { ref: cmd.ref } : pointer.toCssPoint(cmd.point, scale));
}

/** 구조 click — 요소 중심에 커서를 먼저 보이고 클릭한다 (커서 표시 실패는 무시) */
async function clickWithCursor(page: Page, input: TClickInput, options: IActionOptions): Promise<TActionResult> {
  const center = await getRefCenter(page, input.ref);
  if (center !== null) await showCursor(page, center);
  return actions.click(page, input, options);
}

function createPageMethods(state: IDriverState): TPageMethods {
  const { options } = state;
  const withPage = (work: (page: Page) => Promise<TActionResult>) => runOnPage(state, work);
  return {
    snapshot: () => withPage((page) => takeSnapshot(page, { timeoutMs: options.timeoutMs })),
    readText: (input) => withPage((page) => actions.readText(page, input, options)),
    navigate: (input) => withPage((page) => actions.navigate(page, input, options)),
    goBack: () => withPage((page) => actions.goBack(page, options)),
    click: (input) => withPage((page) => clickWithCursor(page, input, options)),
    typeText: (input) => withPage((page) => actions.typeText(page, input, options)),
    selectOption: (input) => withPage((page) => actions.selectOption(page, input, options)),
    pressKey: (input) => withPage((page) => actions.pressKey(page, input, options)),
    scroll: (input) => withPage((page) => actions.scroll(page, input)),
    waitFor: (input) => withPage((page) => actions.waitFor(page, input, options)),
    resolveTarget: (req) => withPageOr(state, null, (page) => resolveTarget(page, req, options)),
    getPageInfo: () => getPageInfo(state),
  };
}

function createTabMethods(state: IDriverState): Pick<IBrowserDriver, 'listTabs' | 'switchTab' | 'openTab' | 'dispose'> {
  return {
    listTabs: async () => ({ ok: true, text: formatTabList(state.tabs.list()) }),
    switchTab: async (input) => switchTab(state, input),
    openTab: async (input) => openTab(state, input),
    // 연결(cdp)은 앱이 공유하므로 run 이 끝나도 닫지 않는다
    dispose: async () => undefined,
  };
}

async function getCurrentPage(state: IDriverState): Promise<Page> {
  const targetId = await state.tabs.getCdpTargetId(state.currentTabId);
  if (targetId === null) throw new ActionError('대상 탭을 찾을 수 없습니다. list_tabs 로 탭을 확인하라');
  return state.cdp.getPage(targetId);
}

/** Page 를 못 찾거나 작업이 throw 하면 fallback — 가드 해석·오버레이처럼 실패를 결과로 못 쓰는 메서드용 */
async function withPageOr<T>(state: IDriverState, fallback: T, work: (page: Page) => Promise<T>): Promise<T> {
  try {
    return await work(await getCurrentPage(state));
  } catch {
    return fallback;
  }
}

async function runOnPage(state: IDriverState, work: (page: Page) => Promise<TActionResult>): Promise<TActionResult> {
  try {
    return await work(await getCurrentPage(state));
  } catch (error) {
    return toActionFailure(error);
  }
}

/** Page 를 못 찾으면 탭 목록의 url·제목으로 대신한다 (첫 user 메시지용) */
async function getPageInfo(state: IDriverState): Promise<{ url: string; title: string }> {
  try {
    const page = await getCurrentPage(state);
    return { url: page.url(), title: await page.title() };
  } catch {
    const tab = state.tabs.list().tabList.find((item) => item.id === state.currentTabId);
    return { url: tab?.url ?? '', title: tab?.title ?? '' };
  }
}

function switchTab(state: IDriverState, { tabId }: TSwitchTabInput): TActionResult {
  const tab = state.tabs.list().tabList.find((item) => item.id === tabId);
  if (!tab) return { ok: false, reason: `탭 ${tabId} 이(가) 없습니다. list_tabs 로 탭을 확인하라` };
  state.tabs.activate(tabId);
  state.currentTabId = tabId;
  return { ok: true, text: `전환함: ${tab.title}` };
}

async function openTab(state: IDriverState, { url }: TOpenTabInput): Promise<TActionResult> {
  const tabId = state.tabs.create(url);
  state.currentTabId = tabId;
  if (url !== undefined) await waitForTabLoad(state);
  return { ok: true, text: `새 탭: ${tabId}` };
}

/** 새 탭이 about:blank 를 벗어나 문서를 띄울 때까지 기다린다 — 실패해도 탭은 열렸으므로 무시 */
async function waitForTabLoad(state: IDriverState): Promise<void> {
  const timeout = state.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const page = await getCurrentPage(state);
    await page.waitForURL((current) => current.href !== 'about:blank', { waitUntil: 'domcontentloaded', timeout });
  } catch {
    // 정책 밖 url 이면 TabManager 가 새 탭(about:blank)으로 연다 — 다음 snapshot 이 실제 상태를 보여 준다
  }
}

function formatTabList({ tabList, activeTabId }: TTabsSnapshot): string {
  if (tabList.length === 0) return '열린 탭이 없습니다';
  return tabList.map((tab) => `${tab.id}${tab.id === activeTabId ? '*' : ''} ${tab.title} — ${tab.url}`).join('\n');
}
