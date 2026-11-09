/**
 * [spec 010·014·016] mac 브라우저 프레임 — OS 제목 표시줄 없이 맨 윗줄에 신호등·탭·사이드바 헤더가 한 줄로 있고,
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

test('맨 윗줄 빈 곳은 창 드래그 영역(Linux 는 앱이 직접 처리 — spec 016)이고 탭·버튼은 클릭 영역, 사이드바 헤더는 드래그 영역이 아니다', async ({ win }) => {
  const sidebar = getSidebar(win);
  expect(await getAppRegion(win.getByTestId('window-top-bar'))).toBe(process.platform === 'linux' ? 'none' : 'drag');
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

/** main 창의 setBounds·maximize 를 기록 대역으로 바꾸고, 바꾸기 전 bounds 를 돌려준다 (xvfb 에는 창 관리자가 없다) */
async function stubWindowBounds(app: ElectronApplication): Promise<TBounds> {
  return app.evaluate(({ BrowserWindow }) => {
    const [mainWindow] = BrowserWindow.getAllWindows();
    if (!mainWindow) throw new Error('main 창이 없습니다');
    const record = { boundsList: [] as unknown[], maximizeCount: 0 };
    (globalThis as unknown as { __windowRecord: typeof record }).__windowRecord = record;
    mainWindow.setBounds = (bounds) => void record.boundsList.push(bounds);
    mainWindow.maximize = () => void (record.maximizeCount += 1);
    return mainWindow.getBounds();
  });
}

type TBounds = { x: number; y: number; width: number; height: number };
type TWindowRecord = { boundsList: TBounds[]; maximizeCount: number };

async function readWindowRecord(app: ElectronApplication): Promise<TWindowRecord> {
  return app.evaluate(() => (globalThis as unknown as { __windowRecord: TWindowRecord }).__windowRecord);
}

/** 맨 윗줄 오른쪽 끝 빈 곳 — 탭·버튼이 없는 자리 */
async function getTopBarEmptyPoint(win: Page): Promise<{ x: number; y: number }> {
  const box = await win.getByTestId('window-top-bar').boundingBox();
  if (!box) throw new Error('맨 윗줄이 보이지 않습니다');
  return { x: box.x + box.width - 40, y: box.y + box.height / 2 };
}

async function dragMouse(win: Page, from: { x: number; y: number }, delta: { x: number; y: number }): Promise<void> {
  await win.mouse.move(from.x, from.y);
  await win.mouse.down();
  await win.mouse.move(from.x + delta.x / 2, from.y + delta.y / 2, { steps: 3 });
  await win.mouse.move(from.x + delta.x, from.y + delta.y, { steps: 3 });
  await win.mouse.up();
}

test.describe('Linux 창 끌기·더블클릭·크기 조절 (spec 016)', () => {
  test.skip(process.platform !== 'linux', 'macOS·Windows 는 OS 가 처리한다');

  test('맨 윗줄 빈 곳을 끌면 창이 끈 만큼 옮겨지고 크기는 그대로다', async ({ app, win }) => {
    const origin = await stubWindowBounds(app);
    await dragMouse(win, await getTopBarEmptyPoint(win), { x: 60, y: 30 });
    await expect
      .poll(async () => (await readWindowRecord(app)).boundsList.at(-1))
      .toEqual({ x: origin.x + 60, y: origin.y + 30, width: origin.width, height: origin.height });
  });

  test('맨 윗줄 빈 곳을 더블클릭하면 창을 최대화한다', async ({ app, win }) => {
    await stubWindowBounds(app);
    const point = await getTopBarEmptyPoint(win);
    await win.mouse.dblclick(point.x, point.y);
    await expect.poll(async () => (await readWindowRecord(app)).maximizeCount).toBe(1);
  });

  test('탭을 끌어도 창은 움직이지 않는다', async ({ app, win }) => {
    await stubWindowBounds(app);
    const tabBox = await win.getByRole('tab').first().boundingBox();
    if (!tabBox) throw new Error('탭이 보이지 않습니다');
    await dragMouse(win, { x: tabBox.x + tabBox.width / 2, y: tabBox.y + tabBox.height / 2 }, { x: 60, y: 30 });
    await expect(win.getByRole('tab').first()).toBeVisible();
    expect((await readWindowRecord(app)).boundsList).toEqual([]);
  });

  // 창 밖으로는 마우스를 보낼 수 없어(xvfb 화면 = 창) 안쪽으로 끌어 줄이는 쪽을 확인한다
  test('오른쪽 아래 모서리를 끌면 창 크기가 끈 만큼 바뀌고 위치는 그대로다', async ({ app, win }) => {
    const origin = await stubWindowBounds(app);
    const cornerBox = await win.locator('[data-testid="window-resize-edge"][data-resize-edge="se"]').boundingBox();
    if (!cornerBox) throw new Error('모서리 손잡이가 보이지 않습니다');
    await dragMouse(win, { x: cornerBox.x + cornerBox.width / 2, y: cornerBox.y + cornerBox.height / 2 }, { x: -40, y: -20 });
    await expect
      .poll(async () => (await readWindowRecord(app)).boundsList.at(-1))
      .toEqual({ x: origin.x, y: origin.y, width: origin.width - 40, height: origin.height - 20 });
  });

  test('최대화되면 가장자리 손잡이가 없어지고, 풀리면 8개가 돌아온다', async ({ app, win }) => {
    const edgeList = win.getByTestId('window-resize-edge');
    await expect(edgeList).toHaveCount(8);
    await emitWindowEvent(app, 'maximize');
    await expect(edgeList).toHaveCount(0);
    await emitWindowEvent(app, 'unmaximize');
    await expect(edgeList).toHaveCount(8);
  });

  test('최대화가 아니면 탭 콘텐츠 영역은 창 왼쪽 가장자리에서 4px 안쪽이다', async ({ win }) => {
    const contentBox = await win.getByRole('region', { name: '탭 콘텐츠' }).boundingBox();
    if (!contentBox) throw new Error('탭 콘텐츠가 보이지 않습니다');
    expect(contentBox.x).toBe(4);
  });
});
