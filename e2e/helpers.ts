/**
 * e2e·평가 세트 공용 화면 조작 — 사이드바 찾기·할 일 실행·주소창으로 픽스처 열기.
 * 여러 spec 이 같은 순서를 따라야 경합(주소창 글자 섞임)이 재발하지 않는다.
 */
import type { Locator, Page } from '@playwright/test';

import { expect } from './fixtures';

/** 사이드바 영역 — 크롬의 버튼(예: 로딩 중 "중지")과 섞이지 않게 이 안에서만 찾는다 */
export function getSidebar(win: Page): Locator {
  return win.getByRole('complementary', { name: '에이전트 사이드바' });
}

/** 할 일을 입력하고 실행한다 */
export async function runTask(win: Page, task: string): Promise<void> {
  const sidebar = getSidebar(win);
  await sidebar.getByRole('textbox', { name: '할 일' }).fill(task);
  await sidebar.getByRole('button', { name: '작업 실행' }).click();
}

/** 주소창으로 활성 탭을 픽스처 페이지로 옮기고 탭 제목이 바뀔 때까지 기다린다 */
export async function openInActiveTab(win: Page, url: string, title: string): Promise<void> {
  const addressBar = win.getByRole('combobox', { name: '주소창' });
  // 앱 시작 직후 포커스·값 동기화와 겹쳐 글자가 섞이는 경합을 피한다 (browser-chrome.spec 과 같은 순서 + 값 확인)
  await addressBar.click();
  await addressBar.fill(url);
  await expect(addressBar).toHaveValue(url);
  await addressBar.press('Enter');
  await expect(win.getByRole('tab', { name: title })).toBeVisible();
}
