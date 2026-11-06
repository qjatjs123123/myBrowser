/**
 * [spec 009] 사이드바 대화형 UI — 할 일 입력창의 Enter 로 실행하고, 세션 안에서 할 일 말풍선·응답이 쌓이며 [새 대화] 로 비운다.
 * 승인 창은 번호 선택 목록이고 열자마자 Enter 는 거부 1회다. 가짜 모델·로컬 픽스처만 쓴다.
 */
import type { ElectronApplication, Page } from '@playwright/test';

import { expect, findTabPage, test } from './fixtures';
import { getSidebar, openInActiveTab } from './helpers';

const EMPTY_TEXT = '할 일을 입력하면 여기에 진행 상황이 표시됩니다';

/** 할 일 입력창에 쓰고 Enter 로 실행한다 (버튼 클릭 없이) */
async function submitWithEnter(win: Page, task: string): Promise<void> {
  const textbox = getSidebar(win).getByRole('textbox', { name: '할 일' });
  await textbox.fill(task);
  await textbox.press('Enter');
}

function getStatus(win: Page) {
  return getSidebar(win).getByRole('status', { name: '실행 상태' });
}

test.describe('대화 기록', () => {
  test('Enter 로 실행하고 두 번째 할 일도 대화에 쌓이며 [새 대화] 로 비운다', async ({ win }) => {
    const sidebar = getSidebar(win);
    await submitWithEnter(win, '첫 번째 할 일');
    await expect(getStatus(win)).toHaveText('완료');
    await expect(sidebar.getByRole('group', { name: '내 할 일' })).toHaveText('첫 번째 할 일');
    await expect(sidebar.getByRole('textbox', { name: '할 일' })).toHaveValue('');

    await submitWithEnter(win, '두 번째 할 일');
    await expect(sidebar.getByRole('group', { name: '내 할 일' })).toHaveText(['첫 번째 할 일', '두 번째 할 일']);
    await expect(getStatus(win)).toHaveText('완료');
    await expect(sidebar.getByRole('region', { name: '실행 결과' })).toHaveCount(2);

    await sidebar.getByRole('button', { name: '새 대화' }).click();
    await expect(sidebar.getByRole('group', { name: '내 할 일' })).toHaveCount(0);
    await expect(sidebar.getByText(EMPTY_TEXT)).toBeVisible();
  });

  test('Shift+Enter 는 실행하지 않고 줄을 바꾼다', async ({ win }) => {
    const textbox = getSidebar(win).getByRole('textbox', { name: '할 일' });
    await textbox.fill('첫 줄');
    await textbox.press('Shift+Enter');
    await textbox.pressSequentially('둘째 줄');
    await expect(textbox).toHaveValue('첫 줄\n둘째 줄');
    await expect(getStatus(win)).toHaveText('대기');
  });
});

test.describe('승인 선택 목록', () => {
  test.use({ fakeScenario: 'approval-confirm' });

  test('승인 창이 열리자마자 Enter 를 누르면 거부 1회로 끝나고 확정 버튼은 눌리지 않는다', async ({
    app,
    win,
    fixtureUrl,
  }) => {
    await openInActiveTab(win, fixtureUrl('reservation.html'), '예약 페이지');
    await submitWithEnter(win, '7시 2명 예약해줘');

    const panel = getSidebar(win).getByRole('alertdialog', { name: '승인 필요' });
    const denyButton = panel.getByRole('button', { name: '거부' });
    await expect(denyButton).toBeFocused();
    await win.keyboard.press('Enter');

    await expect(getStatus(win)).toHaveText('완료');
    await expect(getSidebar(win).getByRole('img', { name: '거부됨' })).toHaveCount(1);
    // 중복 전송이면 두 번째 approve 가 NOT_FOUND toast 를 남긴다
    await expect(win.locator('[data-sonner-toast]')).toHaveCount(0);
    expect(await readClickLog(app)).toEqual([]);
  });
});

/** 예약 픽스처의 클릭 기록 */
async function readClickLog(app: ElectronApplication): Promise<unknown[]> {
  const tabPage = await findTabPage(app, 'reservation.html');
  return tabPage.evaluate(() => (globalThis as unknown as { __clickLog: unknown[] }).__clickLog);
}
