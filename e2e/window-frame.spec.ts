/**
 * [spec 010] mac 브라우저 프레임 — OS 제목 표시줄 없이 맨 윗줄에 신호등·탭·사이드바 헤더가 한 줄로 있고,
 * 빈 곳은 창 드래그 영역, 탭·버튼은 클릭 영역이다. 신호등은 preload→IPC→main 창까지 실제 경로로 간다.
 * xvfb 에는 창 관리자가 없어 실제 최대화 상태는 바뀌지 않으므로 main 창 인스턴스에 대역을 심어 호출만 확인한다.
 */
import type { Locator } from '@playwright/test';

import { expect, test } from './fixtures';
import { getSidebar } from './helpers';

/** 요소의 실제 창 영역 — 가장 가까운 조상에서 정한 drag/no-drag (속성은 상속되지 않는다) */
async function getAppRegion(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    type TNode = { parentElement: TNode | null };
    type TStyle = { getPropertyValue: (name: string) => string };
    const readStyle = (globalThis as unknown as { getComputedStyle: (node: TNode) => TStyle }).getComputedStyle;
    for (let node: TNode | null = element as unknown as TNode; node; node = node.parentElement) {
      const style = readStyle(node);
      const region = style.getPropertyValue('-webkit-app-region') || style.getPropertyValue('app-region');
      if (region === 'drag' || region === 'no-drag') return region;
    }
    return 'none';
  });
}

test('맨 윗줄에 신호등·탭이 한 줄로 있고 사이드바 헤더도 같은 높이다', async ({ win }) => {
  const topBar = win.getByTestId('window-top-bar');
  const closeBox = await win.getByRole('button', { name: '창 닫기', exact: true }).boundingBox();
  const tabBox = await win.getByRole('tablist', { name: '탭' }).boundingBox();
  const topBox = await topBar.boundingBox();
  const headerBox = await getSidebar(win).getByRole('heading', { name: '에이전트' }).locator('..').boundingBox();
  if (!closeBox || !tabBox || !topBox || !headerBox) throw new Error('맨 윗줄 요소가 보이지 않습니다');

  expect(topBox.y).toBe(0);
  expect(closeBox.y).toBeGreaterThanOrEqual(topBox.y);
  expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(topBox.y + topBox.height);
  expect(tabBox.y + tabBox.height).toBeLessThanOrEqual(topBox.y + topBox.height);
  await expect(win.getByRole('button', { name: '창 최소화', exact: true })).toBeVisible();
  await expect(win.getByRole('button', { name: '창 최대화', exact: true })).toBeVisible();
  expect(headerBox.y).toBe(0);
  expect(headerBox.height).toBe(topBox.height);
});

test('빈 곳은 창 드래그 영역이고 탭·버튼·배지는 클릭 영역이다', async ({ win }) => {
  const sidebar = getSidebar(win);
  expect(await getAppRegion(win.getByTestId('window-top-bar'))).toBe('drag');
  expect(await getAppRegion(sidebar.getByRole('heading', { name: '에이전트' }).locator('..'))).toBe('drag');

  const clickableList = [
    win.getByRole('tab').first(),
    win.getByRole('button', { name: '새 탭 열기' }),
    win.getByRole('button', { name: '창 닫기', exact: true }),
    win.getByRole('button', { name: '창 최소화', exact: true }),
    win.getByRole('button', { name: '창 최대화', exact: true }),
    sidebar.getByRole('button', { name: '새 대화' }),
    sidebar.getByRole('status', { name: '실행 상태' }),
  ];
  for (const clickable of clickableList) expect(await getAppRegion(clickable)).toBe('no-drag');
});

test('[창 최대화]·[창 최소화] 를 누르면 main 창이 maximize·minimize 를 1회 받는다', async ({ app, win }) => {
  await app.evaluate(({ BrowserWindow }) => {
    const [mainWindow] = BrowserWindow.getAllWindows();
    if (!mainWindow) throw new Error('main 창이 없습니다');
    const callList: string[] = [];
    (globalThis as unknown as { __windowCallList: string[] }).__windowCallList = callList;
    mainWindow.maximize = () => void callList.push('maximize');
    mainWindow.minimize = () => void callList.push('minimize');
  });

  await win.getByRole('button', { name: '창 최대화', exact: true }).click();
  await win.getByRole('button', { name: '창 최소화', exact: true }).click();

  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as { __windowCallList: string[] }).__windowCallList))
    .toEqual(['maximize', 'minimize']);
});

test('탭 콘텐츠 영역은 주소창 줄 아래에서 시작한다', async ({ win }) => {
  const addressBox = await win.getByRole('combobox', { name: '주소창' }).boundingBox();
  const contentBox = await win.getByRole('region', { name: '탭 콘텐츠' }).boundingBox();
  if (!addressBox || !contentBox) throw new Error('주소창·탭 콘텐츠가 보이지 않습니다');
  expect(contentBox.y).toBeGreaterThanOrEqual(addressBox.y + addressBox.height);
});
