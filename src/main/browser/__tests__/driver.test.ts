import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { TTabsSnapshot } from '@shared/ipc/tabs';

import { createBrowserDriver } from '../driver';
import type { ICdpConnection, ITabsPort } from '../types';

import { findRef, getFixtureUrl } from './helpers';

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

/** 테스트가 연 page — 만들기가 끝나기 전에 browser 를 닫지 않도록 테스트마다 기다렸다 닫는다 */
let openedPageList: Array<Promise<Page>> = [];

afterEach(async () => {
  const pageList = await Promise.all(openedPageList);
  openedPageList = [];
  await Promise.all(pageList.map((page) => page.close()));
});

afterAll(async () => {
  await browser?.close();
});

interface IFakeTab {
  id: string;
  page: Promise<Page>;
}

/** 가짜 탭 포트 + 가짜 CDP — 탭 하나 = 실제 headless page 하나, targetId 는 `target-{tabId}` */
function setup() {
  const tabList: IFakeTab[] = [];
  let activeTabId: string | null = null;
  const openPage = async (url?: string) => {
    const page = await browser.newPage();
    if (url) await page.goto(url);
    return page;
  };
  const addTab = (url?: string) => {
    const id = `tab-${tabList.length + 1}`;
    const page = openPage(url);
    openedPageList.push(page);
    tabList.push({ id, page });
    activeTabId = id;
    return id;
  };
  const list = (): TTabsSnapshot => ({
    tabList: tabList.map(({ id }) => ({
      id,
      url: `https://example.test/${id}`,
      title: `제목 ${id}`,
      faviconUrl: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isNewTab: false,
    })),
    activeTabId,
  });
  const tabs: ITabsPort = {
    list: vi.fn(list),
    activate: vi.fn((id: string) => {
      activeTabId = id;
    }),
    create: vi.fn(addTab),
    getCdpTargetId: vi.fn(async (id: string) => (tabList.some((tab) => tab.id === id) ? `target-${id}` : null)),
  };
  const cdp: ICdpConnection = {
    getPage: vi.fn(async (targetId: string) => {
      const tab = tabList.find(({ id }) => `target-${id}` === targetId);
      if (!tab) throw new Error(`no page for ${targetId}`);
      return tab.page;
    }),
    close: vi.fn(async () => undefined),
  };
  const pageOf = (id: string) => tabList.find((tab) => tab.id === id)!.page;
  return { tabs, cdp, addTab, pageOf };
}

describe('createBrowserDriver 대상 탭', () => {
  it('snapshot 은 시작 탭의 page 를 읽는다', async () => {
    const { tabs, cdp, addTab } = setup();
    const startTabId = addTab(getFixtureUrl('browser-form.html'));
    const driver = createBrowserDriver({ tabs, cdp, startTabId });
    const result = await driver.snapshot();
    expect(result.ok && result.text).toContain('제목: 브라우저 폼 픽스처');
    expect(cdp.getPage).toHaveBeenCalledWith('target-tab-1');
  });

  it('snapshot 의 ref 로 click 하고 resolveTarget 으로 대상을 읽는다', async () => {
    const { tabs, cdp, addTab, pageOf } = setup();
    const startTabId = addTab(getFixtureUrl('browser-form.html'));
    const driver = createBrowserDriver({ tabs, cdp, startTabId });
    const snapshot = await driver.snapshot();
    const ref = findRef(snapshot.ok ? snapshot.text : '', 'button', '예약 확정');
    await expect(driver.resolveTarget({ ref })).resolves.toMatchObject({ name: '예약 확정' });
    await expect(driver.click({ ref })).resolves.toEqual({ ok: true, text: '클릭함' });
    expect(await (await pageOf(startTabId)).locator('#status').innerText()).toBe('확정 눌림');
  });

  it('getPageInfo 는 대상 탭의 url·제목을 돌려준다', async () => {
    const { tabs, cdp, addTab } = setup();
    const startTabId = addTab(getFixtureUrl('browser-second.html'));
    const driver = createBrowserDriver({ tabs, cdp, startTabId });
    await expect(driver.getPageInfo()).resolves.toEqual({
      url: getFixtureUrl('browser-second.html'),
      title: '두 번째',
    });
  });

  it('대상 탭이 없어지면 행동은 실패하고 resolveTarget 은 null 이다', async () => {
    const { tabs, cdp } = setup();
    const driver = createBrowserDriver({ tabs, cdp, startTabId: 'tab-9' });
    await expect(driver.snapshot()).resolves.toEqual({
      ok: false,
      reason: '대상 탭을 찾을 수 없습니다. list_tabs 로 탭을 확인하라',
    });
    await expect(driver.resolveTarget({ focused: true })).resolves.toBeNull();
  });
});

describe('createBrowserDriver 탭 도구', () => {
  it('listTabs 는 tabs.list() 를 줄마다 id·활성 표시·제목·url 로 보여준다', async () => {
    const { tabs, cdp, addTab } = setup();
    addTab();
    const startTabId = addTab();
    const driver = createBrowserDriver({ tabs, cdp, startTabId });
    await expect(driver.listTabs()).resolves.toEqual({
      ok: true,
      text: 'tab-1 제목 tab-1 — https://example.test/tab-1\ntab-2* 제목 tab-2 — https://example.test/tab-2',
    });
  });

  it('switchTab 은 tabs.activate 를 부르고 이후 대상 탭을 바꾼다', async () => {
    const { tabs, cdp, addTab } = setup();
    const firstId = addTab(getFixtureUrl('browser-form.html'));
    const startTabId = addTab(getFixtureUrl('browser-second.html'));
    const driver = createBrowserDriver({ tabs, cdp, startTabId });
    await expect(driver.switchTab({ tabId: firstId })).resolves.toEqual({ ok: true, text: '전환함: 제목 tab-1' });
    expect(tabs.activate).toHaveBeenCalledWith(firstId);
    await expect(driver.getPageInfo()).resolves.toMatchObject({ title: '브라우저 폼 픽스처' });
  });

  it('없는 탭으로 switchTab 하면 실패하고 대상 탭은 그대로다', async () => {
    const { tabs, cdp, addTab } = setup();
    const startTabId = addTab(getFixtureUrl('browser-second.html'));
    const driver = createBrowserDriver({ tabs, cdp, startTabId });
    const result = await driver.switchTab({ tabId: 'tab-9' });
    expect(result.ok).toBe(false);
    expect(tabs.activate).not.toHaveBeenCalled();
    await expect(driver.getPageInfo()).resolves.toMatchObject({ title: '두 번째' });
  });

  it('openTab 은 tabs.create 를 부르고 새 탭을 대상으로 삼는다', async () => {
    const { tabs, cdp, addTab } = setup();
    const startTabId = addTab(getFixtureUrl('browser-form.html'));
    const driver = createBrowserDriver({ tabs, cdp, startTabId });
    const url = getFixtureUrl('browser-second.html');
    await expect(driver.openTab({ url })).resolves.toEqual({ ok: true, text: '새 탭: tab-2' });
    expect(tabs.create).toHaveBeenCalledWith(url);
    await expect(driver.getPageInfo()).resolves.toEqual({ url, title: '두 번째' });
  });

  it('dispose 는 공유 CDP 연결을 닫지 않는다', async () => {
    const { tabs, cdp, addTab } = setup();
    const driver = createBrowserDriver({ tabs, cdp, startTabId: addTab() });
    await driver.dispose();
    expect(cdp.close).not.toHaveBeenCalled();
  });
});
