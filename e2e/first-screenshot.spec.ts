/**
 * [spec 021] 할 일 시작 시 현재 탭 캡처 첨부 — 기본 켬이면 첫 메시지에 image 블록이 붙고, MYBROWSER_FIRST_SCREENSHOT=0 이면 텍스트만.
 * 첨부 여부는 가짜 모델 `{{firstImage}}` 자리표시자로 끝까지 확인한다. 외부 사이트·실제 API 없음.
 */
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { getSidebar, openInActiveTab, runTask } from './helpers';

/** 픽스처에서 할 일을 실행하고 끝날 때까지 기다린다 */
async function runOnFixture(win: Page, url: string): Promise<void> {
  await openInActiveTab(win, url, '픽스처 첫 페이지');
  await runTask(win, '이 페이지 요약해줘');
  await expect(getSidebar(win).getByRole('status', { name: '실행 상태' })).toHaveText('완료');
}

test.describe('기본 켬', () => {
  // 셸에 MYBROWSER_FIRST_SCREENSHOT 가 남아 있어도 기본값을 확인한다
  test.use({ fakeScenario: 'first-image-echo', appEnv: { MYBROWSER_FIRST_SCREENSHOT: undefined } });

  test('할 일을 실행하면 현재 탭 캡처가 첫 메시지에 붙는다', async ({ win, fixtureUrl }) => {
    await runOnFixture(win, fixtureUrl('basic.html'));
    await expect(getSidebar(win).getByRole('region', { name: '실행 결과' })).toContainText('첫 화면 캡처: 있음');
  });
});

test.describe('끔', () => {
  test.use({ fakeScenario: 'first-image-echo', appEnv: { MYBROWSER_FIRST_SCREENSHOT: '0' } });

  test('MYBROWSER_FIRST_SCREENSHOT=0 이면 텍스트만 보낸다', async ({ win, fixtureUrl }) => {
    await runOnFixture(win, fixtureUrl('basic.html'));
    await expect(getSidebar(win).getByRole('region', { name: '실행 결과' })).toContainText('첫 화면 캡처: 없음');
  });
});
