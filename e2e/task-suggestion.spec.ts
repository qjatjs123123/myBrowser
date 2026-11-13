/**
 * [spec 019] 에이전트 입력창 추천 문구 — 현재 탭에 맞는 추천을 placeholder·흐린 이어쓰기로 보이고 Tab 으로 입력한다.
 * Tab 은 입력만 하고 실행하지 않는다 (SR-1). 로컬 픽스처만 쓴다.
 */
import { expect, test } from './fixtures';
import { getSidebar, openInActiveTab } from './helpers';

const NEW_TAB_SUGGESTION = '네이버에서 맛집 검색해서 평점 높은 곳 3개 알려줘';
const PAGE_SUGGESTION = '이 페이지 핵심만 3줄로 요약해줘';

test('새 탭이면 새 탭 추천이 placeholder 로 보이고, Tab 을 누르면 입력만 되고 실행되지 않는다', async ({ win }) => {
  const sidebar = getSidebar(win);
  const textbox = sidebar.getByRole('textbox', { name: '할 일' });
  await expect(textbox).toHaveAttribute('placeholder', NEW_TAB_SUGGESTION);
  await expect(sidebar.getByText('Tab 추천 입력 · Enter 실행 · Shift+Enter 줄바꿈')).toBeVisible();

  await textbox.focus();
  await textbox.press('Tab');
  await expect(textbox).toHaveValue(NEW_TAB_SUGGESTION);
  await expect(textbox).toBeFocused();
  await expect(sidebar.getByRole('group', { name: '내 할 일' })).toHaveCount(0);
});

test('일반 페이지면 페이지 추천이 보이고, 앞부분을 치고 Tab 을 누르면 나머지가 채워진다', async ({
  win,
  fixtureUrl,
}) => {
  await openInActiveTab(win, fixtureUrl('basic.html'), '픽스처 첫 페이지');
  const sidebar = getSidebar(win);
  const textbox = sidebar.getByRole('textbox', { name: '할 일' });
  await expect(textbox).toHaveAttribute('placeholder', PAGE_SUGGESTION);

  await textbox.fill('이 페이지');
  await expect(sidebar.getByTestId('task-suggestion-ghost')).toHaveText(PAGE_SUGGESTION);
  await textbox.press('Tab');
  await expect(textbox).toHaveValue(PAGE_SUGGESTION);
  await expect(sidebar.getByTestId('task-suggestion-ghost')).toHaveCount(0);
});
