/**
 * [spec 003] 에이전트 MVP — 사이드바에서 할 일을 실행하면 가짜 모델 시나리오대로 활성 탭에서 도구가 돌고,
 * 확정 버튼 앞에서는 가드가 클릭 전에 멈추며, 비밀번호 입력은 차단된다. 외부 사이트·실제 API 없음.
 */
import type { Page } from '@playwright/test';

import { expect, findTabPage, test } from './fixtures';
import { getSidebar, openInActiveTab, runTask } from './helpers';

test.describe('검색·읽기', () => {
  test.use({ fakeScenario: 'search-read' });

  test('할 일을 실행하면 링크를 눌러 다음 페이지를 읽고 결과를 보여준다', async ({ win, fixtureUrl }) => {
    await openInActiveTab(win, fixtureUrl('agent-search.html'), '에이전트 검색');
    await runTask(win, '두 번째 페이지에서 전화번호 알려줘');

    const sidebar = getSidebar(win);
    await expect(sidebar.getByRole('status', { name: '실행 상태' })).toHaveText('완료');
    const timeline = sidebar.getByRole('list', { name: '진행 단계' });
    await expect(timeline).toContainText('페이지 읽기');
    await expect(timeline).toContainText('‘두 번째 페이지’ 클릭');
    await expect(timeline).toContainText('글 읽기');
    await expect(sidebar.getByRole('region', { name: '실행 결과' })).toContainText('02-123-4567');
    await expect(win.getByRole('combobox', { name: '주소창' })).toHaveValue(fixtureUrl('agent-result.html'));
  });
});

test.describe('확정 직전 정지', () => {
  test.use({ fakeScenario: 'reservation-stop' });

  test('예약 확정 버튼은 클릭하지 않고 승인 창에서 멈춘다 (spec 004 — 대기로 바뀜)', async ({
    app,
    win,
    fixtureUrl,
  }) => {
    await openInActiveTab(win, fixtureUrl('reservation.html'), '예약 페이지');
    await runTask(win, '오늘 7시 2명 예약해줘');

    const sidebar = getSidebar(win);
    await expect(sidebar.getByRole('status', { name: '실행 상태' })).toHaveText('확인 필요');
    await expect(sidebar.getByRole('alertdialog', { name: '승인 필요' })).toContainText('예약 확정');
    await expect(sidebar.getByRole('img', { name: '확인 대기' })).toHaveCount(1);
    const tabPage = await findTabPage(app, 'reservation.html');
    const clickLog = await tabPage.evaluate(() => (globalThis as unknown as { __clickLog: string[] }).__clickLog);
    expect(clickLog).toEqual([]);
  });
});

test.describe('비밀번호 차단', () => {
  test.use({ fakeScenario: 'password-block' });

  test('비밀번호 칸 입력은 차단되고 run 은 끝까지 진행된다', async ({ app, win, fixtureUrl }) => {
    await openInActiveTab(win, fixtureUrl('login.html'), '로그인');
    await runTask(win, '로그인해줘');

    const sidebar = getSidebar(win);
    await expect(sidebar.getByRole('status', { name: '실행 상태' })).toHaveText('완료');
    await expect(sidebar.getByRole('img', { name: '차단됨' })).toHaveCount(1);
    const tabPage = await findTabPage(app, 'login.html');
    await expect(tabPage.getByLabel('비밀번호')).toHaveValue('');
  });
});

test.describe('중지', () => {
  test.use({ fakeScenario: 'stop-wait' });

  test('실행 중 작업 중지를 누르면 중지됨으로 끝난다', async ({ win, fixtureUrl }) => {
    await openInActiveTab(win, fixtureUrl('basic.html'), await getBasicTitle(win, fixtureUrl('basic.html')));
    await runTask(win, '잠깐 기다려줘');

    const sidebar = getSidebar(win);
    await expect(sidebar.getByRole('list', { name: '진행 단계' })).toContainText('기다리기');
    await sidebar.getByRole('button', { name: '작업 중지' }).click();
    await expect(sidebar.getByRole('status', { name: '실행 상태' })).toHaveText('중지됨');
  });
});

/** basic 픽스처의 제목 — 파일을 바꿔도 테스트가 따라가게 픽스처에서 읽는다 */
async function getBasicTitle(win: Page, url: string): Promise<string> {
  const response = await win.request.get(url);
  const matched = /<title>([^<]+)<\/title>/.exec(await response.text());
  return matched?.[1] ?? '';
}
