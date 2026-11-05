import type { Page } from 'playwright-core';

import type { TTabsSnapshot } from '@shared/ipc/tabs';
import type { IBrowserDriver, TActionResult, TOpenTabInput, TSwitchTabInput } from '@shared/tools';

import * as actions from './actions';
import { ActionError, toActionFailure, type IActionOptions } from './actions';
import { takeSnapshot } from './snapshot';
import { resolveTarget } from './target';
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
}

/**
 * [브라우저 드라이버] 에이전트 도구가 쓰는 IBrowserDriver 구현 — 현재 대상 탭의 Page 에 actions 를 적용한다.
 * switch_tab·open_tab 은 화면의 활성 탭도 바꾸고(tabs 포트) 이후 대상 탭이 된다.
 */
export function createBrowserDriver({ tabs, cdp, startTabId, timeoutMs }: ICreateBrowserDriverOptions): IBrowserDriver {
  const state: IDriverState = { tabs, cdp, currentTabId: startTabId, options: { timeoutMs } };
  return { ...createPageMethods(state), ...createTabMethods(state) };
}

type TPageMethods = Omit<IBrowserDriver, 'listTabs' | 'switchTab' | 'openTab' | 'dispose'>;

function createPageMethods(state: IDriverState): TPageMethods {
  const { options } = state;
  const withPage = (work: (page: Page) => Promise<TActionResult>) => runOnPage(state, work);
  return {
    snapshot: () => withPage((page) => takeSnapshot(page, { timeoutMs: options.timeoutMs })),
    readText: (input) => withPage((page) => actions.readText(page, input, options)),
    navigate: (input) => withPage((page) => actions.navigate(page, input, options)),
    goBack: () => withPage((page) => actions.goBack(page, options)),
    click: (input) => withPage((page) => actions.click(page, input, options)),
    typeText: (input) => withPage((page) => actions.typeText(page, input, options)),
    selectOption: (input) => withPage((page) => actions.selectOption(page, input, options)),
    pressKey: (input) => withPage((page) => actions.pressKey(page, input, options)),
    scroll: (input) => withPage((page) => actions.scroll(page, input)),
    waitFor: (input) => withPage((page) => actions.waitFor(page, input, options)),
    resolveTarget: async (req) => {
      const page = await getCurrentPage(state).catch(() => null);
      return page ? resolveTarget(page, req, options) : null;
    },
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
  const timeout = state.options.timeoutMs ?? 10_000;
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
