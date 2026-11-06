/**
 * [spec 012] 실행 기록 — 패널 [실행 기록] 으로 저장된 지난 run 목록을 보고, 줄을 눌러 읽기 전용으로 다시 본다.
 * 기록 보기에는 실행·승인 버튼이 없다(SR-1). 가짜 모델·로컬 픽스처만 쓴다.
 */
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { getSidebar, openInActiveTab, runTask } from './helpers';

function getStatus(win: Page) {
  return getSidebar(win).getByRole('status', { name: '실행 상태' });
}

test('할 일 두 개를 실행하면 기록 목록에 최신 먼저 보이고, 줄을 누르면 그 run 을 다시 본다', async ({ win }) => {
  const sidebar = getSidebar(win);
  await runTask(win, '첫 번째 기록');
  await expect(getStatus(win)).toHaveText('완료');
  await runTask(win, '두 번째 기록');
  await expect(getStatus(win)).toHaveText('완료');

  await sidebar.getByRole('button', { name: '실행 기록' }).click();
  const list = sidebar.getByRole('list', { name: '실행 기록 목록' });
  await expect(list.getByRole('button')).toHaveCount(2);
  await expect(list.getByRole('button').first()).toContainText('두 번째 기록');
  await expect(list.getByRole('button').first()).toContainText('완료');

  await list.getByRole('button', { name: '첫 번째 기록' }).click();
  await expect(sidebar.getByRole('group', { name: '내 할 일' })).toHaveText('첫 번째 기록');
  await expect(sidebar.getByRole('region', { name: '실행 결과' })).toBeVisible();

  await sidebar.getByRole('button', { name: '목록으로' }).click();
  await expect(list).toBeVisible();
  await sidebar.getByRole('button', { name: '대화로 돌아가기' }).click();
  await expect(sidebar.getByRole('group', { name: '내 할 일' })).toHaveText(['첫 번째 기록', '두 번째 기록']);
});

test.describe('거부한 run 의 기록', () => {
  test.use({ fakeScenario: 'approval-confirm' });

  test('거부한 단계가 기록 상세에 보이고 실행·승인 버튼은 없다', async ({ win, fixtureUrl }) => {
    await openInActiveTab(win, fixtureUrl('reservation.html'), '예약 페이지');
    await runTask(win, '7시 2명 예약해줘');
    const sidebar = getSidebar(win);
    const panel = sidebar.getByRole('alertdialog', { name: '승인 필요' });
    await panel.getByRole('button', { name: '거부' }).click();
    await expect(getStatus(win)).toHaveText('완료');

    await sidebar.getByRole('button', { name: '실행 기록' }).click();
    await sidebar
      .getByRole('list', { name: '실행 기록 목록' })
      .getByRole('button', { name: '7시 2명 예약해줘' })
      .click();
    await expect(sidebar.getByRole('img', { name: '거부됨' })).toHaveCount(1);
    await expect(sidebar.getByRole('alertdialog')).toHaveCount(0);
    await expect(sidebar.getByRole('button', { name: '에이전트가 누르기' })).toHaveCount(0);
  });
});
