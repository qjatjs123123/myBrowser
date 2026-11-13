/**
 * [spec 019] run 입력 토큰 상한 — MYBROWSER_MAX_INPUT_TOKENS 를 넘으면 run 이 실패로 끝나고 다음 도구는 돌지 않는다.
 * 가짜 모델은 턴당 입력 10 토큰 — 상한 15 면 첫 턴(snapshot)은 돌고 둘째 턴(click)에서 멈춘다. 외부 사이트·실제 API 없음.
 */
import { expect, test } from './fixtures';
import { getSidebar, openInActiveTab, runTask } from './helpers';

test.describe('입력 토큰 상한', () => {
  test.use({ fakeScenario: 'search-read', appEnv: { MYBROWSER_MAX_INPUT_TOKENS: '15' } });

  test('누적 입력 토큰이 상한을 넘으면 run 이 실패하고 다음 도구는 실행하지 않는다', async ({ win, fixtureUrl }) => {
    await openInActiveTab(win, fixtureUrl('agent-search.html'), '에이전트 검색');
    await runTask(win, '두 번째 페이지에서 전화번호 알려줘');

    const sidebar = getSidebar(win);
    await expect(sidebar.getByRole('status', { name: '실행 상태' })).toHaveText('실패');
    await expect(sidebar.getByRole('region', { name: '실행 결과' })).toContainText('입력 토큰 한도(15)를 넘었습니다');
    await expect(sidebar.getByRole('list', { name: '진행 단계' })).not.toContainText('‘두 번째 페이지’ 클릭');
    await expect(win.getByRole('combobox', { name: '주소창' })).toHaveValue(fixtureUrl('agent-search.html'));
  });
});
