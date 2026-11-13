/**
 * spec 021 — 에이전트가 일하는 탭 표시(작업 중·응답 대기)와 창 포커스가 없을 때의 OS 알림.
 * 가짜 모델(approval-wait: 읽기 → 3초 대기 → 예약 확정 클릭 → 가드 승인)·로컬 픽스처만 쓴다.
 * 알림은 OS 데몬이 없는 xvfb 에서도 결정적이도록 main 의 Notification·창 포커스를 테스트에서 바꿔 기록만 한다.
 */
import type { ElectronApplication } from '@playwright/test';

import { expect, findTabPage, test } from './fixtures';
import { getSidebar, openInActiveTab, runTask } from './helpers';

const RESERVATION_TITLE = '예약 페이지';

test.use({ fakeScenario: 'approval-wait' });

async function readClickLog(app: ElectronApplication): Promise<unknown[]> {
  const tabPage = await findTabPage(app, 'reservation.html');
  return tabPage.evaluate(() => (globalThis as unknown as { __clickLog: unknown[] }).__clickLog);
}

/** 메인 창은 포커스가 없는 것으로, OS 알림은 띄우지 않고 제목·본문만 기록하게 바꾼다 */
async function recordNotifications(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow, Notification }) => {
    const log: { title: string; body: string }[] = [];
    (globalThis as unknown as { __notifyLog: typeof log }).__notifyLog = log;
    Notification.isSupported = () => true;
    Notification.prototype.show = function show(this: { title: string; body: string }) {
      log.push({ title: this.title, body: this.body });
    };
    for (const window of BrowserWindow.getAllWindows()) window.isFocused = () => false;
  });
}

async function readNotifications(app: ElectronApplication): Promise<{ title: string; body: string }[]> {
  return app.evaluate(() => (globalThis as unknown as { __notifyLog: { title: string; body: string }[] }).__notifyLog);
}

test('run 동안 대상 탭에 작업 중·응답 대기 표시가 보이고 끝나면 사라진다', async ({ app, win, fixtureUrl }) => {
  await openInActiveTab(win, fixtureUrl('reservation.html'), RESERVATION_TITLE);
  await runTask(win, '7시 2명 예약해줘');
  const tabRow = win.getByRole('tab', { name: RESERVATION_TITLE }).locator('..');
  await expect(tabRow.getByRole('img', { name: '에이전트 작업 중' })).toBeVisible();

  const panel = getSidebar(win).getByRole('alertdialog', { name: '승인 필요' });
  await expect(panel).toBeVisible();
  await expect(tabRow.getByRole('img', { name: '에이전트 응답 대기' })).toBeVisible();
  // 탭 이름은 표시와 무관하게 그대로다
  await expect(win.getByRole('tab', { name: RESERVATION_TITLE, exact: true })).toBeVisible();
  expect(await readClickLog(app)).toEqual([]);

  await panel.getByRole('button', { name: '거부' }).click();
  await expect(getSidebar(win).getByRole('status', { name: '실행 상태' })).not.toHaveText('확인 필요');
  await expect(tabRow.getByRole('img', { name: /^에이전트/ })).toBeHidden();
  expect(await readClickLog(app)).toEqual([]);
});

test('창에 포커스가 없으면 승인 대기·종료 때 OS 알림을 띄우고, 알림으로는 클릭이 실행되지 않는다', async ({
  app,
  win,
  fixtureUrl,
}) => {
  await recordNotifications(app);
  await openInActiveTab(win, fixtureUrl('reservation.html'), RESERVATION_TITLE);
  await runTask(win, '7시 2명 예약해줘');
  const panel = getSidebar(win).getByRole('alertdialog', { name: '승인 필요' });
  await expect(panel).toBeVisible();
  await expect.poll(() => readNotifications(app)).toEqual([expect.objectContaining({ title: '승인이 필요합니다' })]);
  expect(await readClickLog(app)).toEqual([]);

  await panel.getByRole('button', { name: '에이전트가 누르기' }).click();
  await expect(getSidebar(win).getByRole('status', { name: '실행 상태' })).toHaveText('완료');
  await expect
    .poll(async () => (await readNotifications(app)).map((notification) => notification.title))
    .toEqual(['승인이 필요합니다', '작업을 마쳤습니다']);
  expect(await readClickLog(app)).toEqual(['confirm']);
});
