/**
 * [spec 005 FR-9] 설치판 실행 — `pnpm dist:linux` 산출물(release/linux-unpacked/mybrowser)을 띄워
 * MYBROWSER_CDP_PORT 없이(설치판 기본: 127.0.0.1 + 임의 포트) 가짜 모델 run 이 탭에 붙어 끝까지 가는지 확인한다.
 * 산출물이 없으면 skip 하지 않고 실패한다 — `pnpm e2e:packaged` 가 빌드부터 한다.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../e2e/fixtures';

const ROOT = resolve(__dirname, '..');
const EXECUTABLE_PATH = resolve(ROOT, 'release/linux-unpacked/mybrowser');
const SCENARIO_DIR = resolve(ROOT, 'e2e/fixtures/model');

test.use({
  executablePath: EXECUTABLE_PATH,
  fakeScenario: 'search-read',
  appEnv: { MYBROWSER_CDP_PORT: undefined, MYBROWSER_FAKE_SCENARIO_DIR: SCENARIO_DIR },
});

function getSidebar(win: Page): Locator {
  return win.getByRole('complementary', { name: '에이전트 사이드바' });
}

/** 주소창으로 활성 탭을 픽스처 페이지로 옮긴다 (agent-mvp.spec 과 같은 순서 — 입력 경합 방지) */
async function openInActiveTab(win: Page, url: string, title: string): Promise<void> {
  const addressBar = win.getByRole('combobox', { name: '주소창' });
  await addressBar.click();
  await addressBar.fill(url);
  await expect(addressBar).toHaveValue(url);
  await addressBar.press('Enter');
  await expect(win.getByRole('tab', { name: title })).toBeVisible();
}

test('설치판 산출물이 있다', () => {
  expect(existsSync(EXECUTABLE_PATH), `${EXECUTABLE_PATH} 가 없습니다 — pnpm dist:linux 를 먼저 실행하세요`).toBe(true);
});

test('설치판에서 CDP 포트를 지정하지 않아도 에이전트가 탭에 붙어 끝까지 간다', async ({ win, fixtureUrl }) => {
  await openInActiveTab(win, fixtureUrl('agent-search.html'), '에이전트 검색');
  const sidebar = getSidebar(win);
  await sidebar.getByRole('textbox', { name: '할 일' }).fill('두 번째 페이지에서 전화번호 알려줘');
  await sidebar.getByRole('button', { name: '작업 실행' }).click();
  await expect(sidebar.getByRole('status', { name: '실행 상태' })).toHaveText('완료');
  await expect(sidebar.getByRole('region', { name: '실행 결과' })).toContainText('02-123-4567');
});
