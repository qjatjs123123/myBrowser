import { setTimeout as sleepFor } from 'node:timers/promises';

import { chromium, type Browser, type Page } from 'playwright-core';

import type { ICdpConnection, TSleep } from './types';

const FIND_RETRY_INTERVAL_MS = 200;
const FIND_TIMEOUT_MS = 5000;

export interface ICreateCdpConnectionOptions {
  /** resolveCdpEndpoint 의 결과 (`http://127.0.0.1:{port}`) */
  endpoint: string;
  connect?: (endpoint: string) => Promise<Browser>;
  sleep?: TSleep;
  now?: () => number;
}

interface IConnectionState {
  browser: Browser;
  pageByTargetId: Map<string, Page>;
  targetIdByPage: WeakMap<Page, string>;
}

/**
 * [CDP 연결] connectOverCDP 로 1회 연결하고 탭의 CDP targetId ↔ playwright Page 를 잇는다 (spec 003 「탭 ↔ Page 매핑」).
 * 바로 연결을 시도하므로 연결 실패는 이 함수의 reject 로 드러난다. 끊기면 다음 getPage 에서 재연결 1회 — 실패면 throw.
 */
export async function createCdpConnection(options: ICreateCdpConnectionOptions): Promise<ICdpConnection> {
  const { endpoint, connect = (url) => chromium.connectOverCDP(url), sleep = sleepFor, now = Date.now } = options;
  const state = createState(await connect(endpoint));
  const ensureConnected = async () => {
    if (state.browser.isConnected()) return;
    Object.assign(state, createState(await connect(endpoint)));
  };
  return {
    getPage: async (targetId) => {
      await ensureConnected();
      return waitForPage({ state, targetId, sleep, now });
    },
    close: () => state.browser.close(),
  };
}

function createState(browser: Browser): IConnectionState {
  return { browser, pageByTargetId: new Map(), targetIdByPage: new WeakMap() };
}

interface IWaitForPageOptions {
  state: IConnectionState;
  targetId: string;
  sleep: TSleep;
  now: () => number;
}

/** 탭이 막 열린 직후엔 Page 가 아직 안 보일 수 있다 — 0.2s 간격으로 최대 5s 다시 찾는다 */
async function waitForPage({ state, targetId, sleep, now }: IWaitForPageOptions): Promise<Page> {
  const deadline = now() + FIND_TIMEOUT_MS;
  for (;;) {
    const page = await findPage(state, targetId);
    if (page) return page;
    if (now() >= deadline) throw new Error(`탭의 페이지를 찾지 못했습니다 (targetId ${targetId})`);
    await sleep(FIND_RETRY_INTERVAL_MS);
  }
}

async function findPage(state: IConnectionState, targetId: string): Promise<Page | null> {
  const cached = state.pageByTargetId.get(targetId);
  if (cached && !cached.isClosed()) return cached;
  for (const page of state.browser.contexts().flatMap((context) => context.pages())) {
    if ((await getTargetId(state, page)) !== targetId) continue;
    state.pageByTargetId.set(targetId, page);
    return page;
  }
  return null;
}

/** page 마다 1번만 CDP 세션을 열어 targetId 를 읽는다 — 읽기 실패(닫히는 중 등)는 null */
async function getTargetId(state: IConnectionState, page: Page): Promise<string | null> {
  const cached = state.targetIdByPage.get(page);
  if (cached) return cached;
  try {
    const session = await page.context().newCDPSession(page);
    const { targetInfo } = await session.send('Target.getTargetInfo');
    await session.detach().catch(() => undefined);
    state.targetIdByPage.set(page, targetInfo.targetId);
    return targetInfo.targetId;
  } catch {
    return null;
  }
}
