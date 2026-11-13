/**
 * [spec 015] 에이전트 정확도 — 긴 본문 뒤에 붙는 날짜 레이어(코레일 run 783efc20 회귀).
 * 압축·대화상자 우선 snapshot 이라 가짜 모델이 레이어 안 날짜·시각·[적용] ref 를 찾아 출발일을 채운다. 외부 사이트·실제 API 없음.
 */
import { expect, findTabPage, test } from './fixtures';
import { getSidebar, openInActiveTab, runTask } from './helpers';

test.describe('날짜 레이어', () => {
  test.use({ fakeScenario: 'date-layer' });

  test('긴 페이지 뒤 날짜 레이어에서 날짜·시각을 고르고 [적용] 까지 눌러 출발일을 채운다', async ({
    app,
    win,
    fixtureUrl,
  }) => {
    await openInActiveTab(win, fixtureUrl('date-layer.html'), '날짜 레이어');
    await runTask(win, '17일 10시로 출발일 골라줘');

    const sidebar = getSidebar(win);
    await expect(sidebar.getByRole('status', { name: '실행 상태' })).toHaveText('완료');
    const timeline = sidebar.getByRole('list', { name: '진행 단계' });
    await expect(timeline).toContainText('‘적용’ 클릭');
    const tabPage = await findTabPage(app, 'date-layer.html');
    await expect(tabPage.getByLabel('출발일')).toHaveValue('2026-11-17 10시');
  });
});

test.describe('같은 클릭 반복 (spec 024)', () => {
  test.use({ fakeScenario: 'repeat-click' });

  test('선택 상태가 트리에 안 보이는 예약 레이어에서 같은 클릭을 반복하면 5회째에 실패로 멈춘다', async ({
    win,
    fixtureUrl,
  }) => {
    await openInActiveTab(win, fixtureUrl('booking-toggle.html'), '예약 선택 토글');
    await runTask(win, '2명 15일 예약 시간 골라줘');

    const sidebar = getSidebar(win);
    await expect(sidebar.getByRole('status', { name: '실행 상태' })).toHaveText('실패');
    await expect(sidebar.getByRole('region', { name: '실행 결과' })).toContainText('같은 행동을 반복해 멈췄습니다');
    await expect(sidebar.getByText('예약 시간을 골랐습니다')).toHaveCount(0);
  });
});

test.describe('잘린 날짜 레이어 (spec 025)', () => {
  test.use({ fakeScenario: 'korail-layer' });

  test('레이어가 12k 에서 잘려도 잘린 부분 목록의 [선택 완료] 를 눌러 출발일을 채운다', async ({ app, win, fixtureUrl }) => {
    await openInActiveTab(win, fixtureUrl('korail-layer.html'), '코레일 날짜 레이어');
    await runTask(win, '11월 30일로 출발일 골라줘');

    const sidebar = getSidebar(win);
    await expect(sidebar.getByRole('status', { name: '실행 상태' })).toHaveText('완료');
    await expect(sidebar.getByRole('list', { name: '진행 단계' })).toContainText('‘선택 완료’ 클릭');
    const tabPage = await findTabPage(app, 'korail-layer.html');
    await expect(tabPage.locator('#departure')).toHaveValue('2026-11-30');
  });
});
