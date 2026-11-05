/**
 * [spec 004] 승인·질문·픽셀 도구 — 가드가 확정 행동 앞에서 run 을 대기시키고 사이드바 승인 창에서 사용자가 고른다.
 * 모든 경로에서 "승인 없는 실행 0" 을 픽스처의 클릭 기록으로 확인한다. 가짜 모델·로컬 픽스처만 쓴다.
 */
import type { ElectronApplication, Locator, Page } from '@playwright/test';

import { expect, findTabPage, test } from './fixtures';

/** 주소창으로 활성 탭을 픽스처로 옮기고 탭 제목이 바뀔 때까지 기다린다 */
async function openInActiveTab(win: Page, url: string, title: string): Promise<void> {
  const addressBar = win.getByRole('combobox', { name: '주소창' });
  await addressBar.fill(url);
  await addressBar.press('Enter');
  await expect(win.getByRole('tab', { name: title })).toBeVisible();
}

/** 사이드바 영역 — 크롬 버튼과 섞이지 않게 이 안에서만 찾는다 */
function getSidebar(win: Page): Locator {
  return win.getByRole('complementary', { name: '에이전트 사이드바' });
}

async function runTask(win: Page, task: string): Promise<void> {
  const sidebar = getSidebar(win);
  await sidebar.getByRole('textbox', { name: '할 일' }).fill(task);
  await sidebar.getByRole('button', { name: '작업 실행' }).click();
}

/** 승인 창이 떠 있을 때까지 기다려 돌려준다 */
async function waitForApproval(win: Page): Promise<Locator> {
  const panel = getSidebar(win).getByRole('alertdialog', { name: '승인 필요' });
  await expect(panel).toBeVisible();
  return panel;
}

/** 픽스처 페이지의 클릭 기록 */
async function readLog(app: ElectronApplication, urlPart: string, key: string): Promise<unknown[]> {
  const tabPage = await findTabPage(app, urlPart);
  return tabPage.evaluate((name) => (globalThis as unknown as Record<string, unknown[]>)[name] ?? [], key);
}

function getStatus(win: Page): Locator {
  return getSidebar(win).getByRole('status', { name: '실행 상태' });
}

test.describe('구조 도구 승인', () => {
  test.use({ fakeScenario: 'approval-confirm' });

  test('거부하면 확정 버튼을 누르지 않고 run 이 끝난다', async ({ app, win, fixtureUrl }) => {
    await openInActiveTab(win, fixtureUrl('reservation.html'), '예약 페이지');
    await runTask(win, '7시 2명 예약해줘');

    const panel = await waitForApproval(win);
    await expect(panel).toContainText('예약 확정');
    await expect(panel.getByRole('button', { name: '거부' })).toBeFocused();
    expect(await readLog(app, 'reservation.html', '__clickLog')).toEqual([]);
    await panel.getByRole('button', { name: '거부' }).click();

    await expect(getStatus(win)).toHaveText('완료');
    await expect(getSidebar(win).getByRole('img', { name: '거부됨' })).toHaveCount(1);
    expect(await readLog(app, 'reservation.html', '__clickLog')).toEqual([]);
  });

  test('에이전트가 누르기를 고르면 확정 버튼을 정확히 한 번 누른다', async ({ app, win, fixtureUrl }) => {
    await openInActiveTab(win, fixtureUrl('reservation.html'), '예약 페이지');
    await runTask(win, '7시 2명 예약해줘');

    const panel = await waitForApproval(win);
    await panel.getByRole('button', { name: '에이전트가 누르기' }).click();

    await expect(getStatus(win)).toHaveText('완료');
    expect(await readLog(app, 'reservation.html', '__clickLog')).toEqual(['confirm']);
  });

  test('직접 누를게요를 고르면 사용자가 누른 한 번만 기록되고 에이전트는 누르지 않는다', async ({
    app,
    win,
    fixtureUrl,
  }) => {
    await openInActiveTab(win, fixtureUrl('reservation.html'), '예약 페이지');
    await runTask(win, '7시 2명 예약해줘');

    const panel = await waitForApproval(win);
    await panel.getByRole('button', { name: '직접 누를게요' }).click();
    const tabPage = await findTabPage(app, 'reservation.html');
    await tabPage.getByRole('button', { name: '예약 확정' }).click();
    await panel.getByRole('button', { name: '계속' }).click();

    await expect(getStatus(win)).toHaveText('완료');
    expect(await readLog(app, 'reservation.html', '__clickLog')).toEqual(['confirm']);
  });

  test('승인 대기 중 작업 중지를 누르면 누르지 않고 중지됨으로 끝난다', async ({ app, win, fixtureUrl }) => {
    await openInActiveTab(win, fixtureUrl('reservation.html'), '예약 페이지');
    await runTask(win, '7시 2명 예약해줘');

    await waitForApproval(win);
    await getSidebar(win).getByRole('button', { name: '작업 중지' }).click();

    await expect(getStatus(win)).toHaveText('중지됨');
    await expect(getSidebar(win).getByRole('alertdialog', { name: '승인 필요' })).toHaveCount(0);
    expect(await readLog(app, 'reservation.html', '__clickLog')).toEqual([]);
  });
});

test.describe('질문', () => {
  test.use({ fakeScenario: 'ask-user' });

  test('질문 카드의 선택지로 답하면 run 이 이어서 끝난다', async ({ win, fixtureUrl }) => {
    await openInActiveTab(win, fixtureUrl('reservation.html'), '예약 페이지');
    await runTask(win, '예약해줘');

    const card = getSidebar(win).getByRole('dialog', { name: '에이전트 질문' });
    await expect(card).toContainText('몇 명으로 예약할까요?');
    await expect(getStatus(win)).toHaveText('확인 필요');
    await card.getByRole('button', { name: '2명' }).click();

    await expect(getStatus(win)).toHaveText('완료');
    await expect(getSidebar(win).getByRole('list', { name: '진행 단계' })).toContainText('질문: 몇 명으로 예약할까요?');
  });
});

test.describe('예약 전체 흐름', () => {
  test.use({ fakeScenario: 'reservation-full' });

  test('인원·시간을 고르고 달력은 픽셀로 누른 뒤 확정은 승인받아 누른다', async ({ app, win, fixtureUrl }) => {
    await openInActiveTab(win, fixtureUrl('reservation-form.html'), '예약하기');
    await runTask(win, '15일 7시 2명 예약해줘');

    const panel = await waitForApproval(win);
    await expect(panel).toContainText('예약 확정');
    expect(await readLog(app, 'reservation-form.html', '__dateLog')).toEqual([15]);
    expect(await readLog(app, 'reservation-form.html', '__clickLog')).toEqual([]);
    const tabPage = await findTabPage(app, 'reservation-form.html');
    await expect(tabPage.locator('[data-mybrowser-overlay]')).toHaveCount(1);
    await expect(tabPage.getByLabel('인원')).toHaveValue('2명');
    await panel.getByRole('button', { name: '에이전트가 누르기' }).click();

    await expect(getStatus(win)).toHaveText('완료');
    expect(await readLog(app, 'reservation-form.html', '__clickLog')).toEqual(['confirm']);
  });
});

test.describe('픽셀 확정 버튼', () => {
  test.use({ fakeScenario: 'pixel-confirm' });

  test('이름 없는 canvas 좌표 클릭은 승인을 받고, 거부하면 누르지 않는다', async ({ app, win, fixtureUrl }) => {
    await openInActiveTab(win, fixtureUrl('pixel-confirm.html'), '그림 결제 버튼');
    await runTask(win, '결제해줘');

    const panel = await waitForApproval(win);
    await expect(panel).toContainText('요소를 확인할 수 없음');
    expect(await readLog(app, 'pixel-confirm.html', '__clickLog')).toEqual([]);
    await panel.getByRole('button', { name: '거부' }).click();

    await expect(getStatus(win)).toHaveText('완료');
    expect(await readLog(app, 'pixel-confirm.html', '__clickLog')).toEqual([]);
  });
});
