/**
 * [spec 011] 에이전트 사이드바 열기·닫기 — 툴바 끝 [에이전트] 와 패널 [사이드바 닫기] 로 열고 닫는다.
 * 닫혀 있어도 승인 요청이 오면 자동으로 보이고, 닫기·열기는 승인 결정을 보내지 않는다. 열림 상태는 다음 실행까지 기억한다.
 * [에이전트] 는 부분 일치로 [에이전트가 누르기] 와 겹치므로 항상 exact 로 찾는다. 가짜 모델·로컬 픽스처만 쓴다.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, findTabPage, test } from './fixtures';
import { getSidebar, openInActiveTab, runTask } from './helpers';

function getToggle(win: Page) {
  return win.getByRole('button', { name: '에이전트', exact: true });
}

/** 보이는 탭 View 의 폭 — 새 탭 View 는 숨겨져 bounds 가 적용되지 않으므로 픽스처를 연 뒤 쓴다 */
async function readVisibleTabViewWidth(app: ElectronApplication): Promise<number | null> {
  return app.evaluate(({ BrowserWindow }) => {
    const [mainWindow] = BrowserWindow.getAllWindows();
    const visibleView = mainWindow?.contentView.children.find((view) => view.getVisible());
    return visibleView ? visibleView.getBounds().width : null;
  });
}

/** 탭 View 폭이 탭 콘텐츠 영역 폭과 같아질 때까지 기다린다 */
async function expectTabViewFitsContent(app: ElectronApplication, win: Page): Promise<void> {
  const region = win.getByRole('region', { name: '탭 콘텐츠' });
  await expect
    .poll(async () => {
      const box = await region.boundingBox();
      return box ? (await readVisibleTabViewWidth(app)) === Math.round(box.width) : false;
    })
    .toBe(true);
}

test('[사이드바 닫기] 로 숨기면 탭이 넓어지고 [에이전트] 로 다시 열면 원래대로 돌아온다', async ({
  app,
  win,
  fixtureUrl,
}) => {
  await openInActiveTab(win, fixtureUrl('basic.html'), '픽스처 첫 페이지');
  const sidebar = getSidebar(win);
  const contentBefore = await win.getByRole('region', { name: '탭 콘텐츠' }).boundingBox();
  await expectTabViewFitsContent(app, win);

  await sidebar.getByRole('button', { name: '사이드바 닫기' }).click();
  await expect(sidebar).toBeHidden();
  await expect(getToggle(win)).toHaveAttribute('aria-pressed', 'false');
  const contentClosed = await win.getByRole('region', { name: '탭 콘텐츠' }).boundingBox();
  expect(contentClosed?.width).toBeGreaterThan(contentBefore?.width ?? 0);
  await expectTabViewFitsContent(app, win);

  await getToggle(win).click();
  await expect(sidebar).toBeVisible();
  await expect(getToggle(win)).toHaveAttribute('aria-pressed', 'true');
  await expectTabViewFitsContent(app, win);
});

test.describe('승인 요청 자동 열기', () => {
  test.use({ fakeScenario: 'approval-wait' });

  test('닫아 둔 사이드바는 승인 요청이 오면 거부에 포커스한 채 보이고, 닫았다 열어도 같은 카드가 남는다', async ({
    app,
    win,
    fixtureUrl,
  }) => {
    await openInActiveTab(win, fixtureUrl('reservation.html'), '예약 페이지');
    const sidebar = getSidebar(win);
    await runTask(win, '7시 2명 예약해줘');
    await sidebar.getByRole('button', { name: '사이드바 닫기' }).click();
    await expect(sidebar).toBeHidden();

    const panel = sidebar.getByRole('alertdialog', { name: '승인 필요' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: '거부' })).toBeFocused();

    await sidebar.getByRole('button', { name: '사이드바 닫기' }).click();
    await expect(sidebar).toBeHidden();
    await expect(getToggle(win)).toHaveAttribute('aria-description', '확인 필요');
    expect(await readClickLog(app)).toEqual([]);

    await getToggle(win).click();
    await expect(panel).toBeVisible();
    await expect(sidebar.getByRole('status', { name: '실행 상태' })).toHaveText('확인 필요');
    await panel.getByRole('button', { name: '에이전트가 누르기' }).click();
    await expect(sidebar.getByRole('status', { name: '실행 상태' })).toHaveText('완료');
    expect(await readClickLog(app)).toEqual(['confirm']);
  });
});

test('사이드바를 닫고 앱을 다시 켜면 닫힌 채로 시작한다', async ({ launchApp }) => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mybrowser-toggle-'));
  try {
    const first = await launchApp({ userDataDir });
    await getSidebar(first.win).getByRole('button', { name: '사이드바 닫기' }).click();
    await expect(getToggle(first.win)).toHaveAttribute('aria-pressed', 'false');
    await first.app.close();

    const second = await launchApp({ userDataDir });
    await expect(getToggle(second.win)).toHaveAttribute('aria-pressed', 'false');
    await expect(getSidebar(second.win)).toBeHidden();
    await second.app.close();
  } finally {
    rmSync(userDataDir, { recursive: true, force: true });
  }
});

/** 예약 픽스처의 클릭 기록 */
async function readClickLog(app: ElectronApplication): Promise<unknown[]> {
  const tabPage = await findTabPage(app, 'reservation.html');
  return tabPage.evaluate(() => (globalThis as unknown as { __clickLog: unknown[] }).__clickLog);
}
