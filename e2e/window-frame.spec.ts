/**
 * [spec 010] mac 브라우저 프레임 — OS 제목 표시줄 없이 맨 윗줄에 신호등·탭·사이드바 헤더가 한 줄로 있고,
 * 빈 곳은 창 드래그 영역, 탭·버튼은 클릭 영역이다. 신호등은 preload→IPC→main 창까지 실제 경로로 간다.
 * xvfb 에는 창 관리자가 없어 실제 최대화 상태는 바뀌지 않으므로 main 창 인스턴스에 대역을 심어 호출만 확인한다.
 */
import type { ElectronApplication, Locator, Page } from '@playwright/test';

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

test('맨 윗줄에 신호등·탭이 한 줄로 있고 탭 줄·툴바는 창 전체 폭, [에이전트] 는 툴바 오른쪽 끝이다 (spec 011)', async ({ win }) => {
  const topBar = win.getByTestId('window-top-bar');
  const closeBox = await win.getByRole('button', { name: '창 닫기', exact: true }).boundingBox();
  const tabBox = await win.getByRole('tablist', { name: '탭' }).boundingBox();
  const topBox = await topBar.boundingBox();
  const toggleBox = await win.getByRole('button', { name: '에이전트', exact: true }).boundingBox();
  const addressBox = await win.getByRole('combobox', { name: '주소창' }).boundingBox();
  const viewportWidth = await win.evaluate(() => (globalThis as unknown as { innerWidth: number }).innerWidth);
  if (!closeBox || !tabBox || !topBox || !toggleBox || !addressBox) {
    throw new Error('맨 윗줄 요소가 보이지 않습니다');
  }

  expect(topBox.y).toBe(0);
  expect(closeBox.y).toBeGreaterThanOrEqual(topBox.y);
  expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(topBox.y + topBox.height);
  expect(tabBox.y + tabBox.height).toBeLessThanOrEqual(topBox.y + topBox.height);
  await expect(win.getByRole('button', { name: '창 최소화', exact: true })).toBeVisible();
  await expect(win.getByRole('button', { name: '창 최대화', exact: true })).toBeVisible();
  expect(topBox.width).toBe(viewportWidth);
  expect(toggleBox.x).toBeGreaterThan(addressBox.x + addressBox.width);
  expect(toggleBox.x + toggleBox.width).toBeGreaterThan(viewportWidth - 24);
});

test('맨 윗줄 빈 곳은 창 드래그 영역이고 탭·버튼은 클릭 영역, 사이드바 헤더는 드래그 영역이 아니다', async ({ win }) => {
  const sidebar = getSidebar(win);
  expect(await getAppRegion(win.getByTestId('window-top-bar'))).toBe('drag');
  expect(await getAppRegion(sidebar.getByRole('heading', { name: '에이전트' }).locator('..'))).toBe('none');

  const clickableList = [
    win.getByRole('tab').first(),
    win.getByRole('button', { name: '새 탭 열기' }),
    win.getByRole('button', { name: '창 닫기', exact: true }),
    win.getByRole('button', { name: '창 최소화', exact: true }),
    win.getByRole('button', { name: '창 최대화', exact: true }),
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

/** 앱 루트·body 의 모서리·배경 계산값 */
async function readFrameStyle(win: Page): Promise<{ radius: string; bodyBackground: string }> {
  return win.getByRole('main', { name: '브라우징 영역' }).evaluate((element) => {
    type TStyle = { borderTopLeftRadius: string; backgroundColor: string };
    const g = globalThis as unknown as { getComputedStyle: (node: unknown) => TStyle; document: { body: unknown } };
    return {
      radius: g.getComputedStyle(element).borderTopLeftRadius,
      bodyBackground: g.getComputedStyle(g.document.body).backgroundColor,
    };
  });
}

/** 메인 창에 최대화 계열 이벤트를 보낸다 — xvfb 에는 창 관리자가 없어 실제 최대화 대신 이벤트로 확인한다 */
async function emitWindowEvent(app: ElectronApplication, eventName: 'maximize' | 'unmaximize'): Promise<void> {
  await app.evaluate(({ BrowserWindow }, name) => {
    const [mainWindow] = BrowserWindow.getAllWindows();
    mainWindow?.emit(name);
  }, eventName);
}

test('Linux 는 창 모서리가 둥글고 최대화하면 직각, 풀면 다시 둥글다 (spec 014)', async ({ app, win }) => {
  test.skip(process.platform !== 'linux', 'macOS·Windows 는 OS 가 모서리를 그린다');
  const root = win.getByRole('main', { name: '브라우징 영역' });
  await expect(root).toHaveAttribute('data-window-frame', 'rounded');
  expect(await readFrameStyle(win)).toEqual({ radius: '10px', bodyBackground: 'rgba(0, 0, 0, 0)' });

  await emitWindowEvent(app, 'maximize');
  await expect(root).toHaveAttribute('data-window-frame', 'square');
  expect((await readFrameStyle(win)).radius).toBe('0px');

  await emitWindowEvent(app, 'unmaximize');
  await expect(root).toHaveAttribute('data-window-frame', 'rounded');
  expect((await readFrameStyle(win)).radius).toBe('10px');
});
