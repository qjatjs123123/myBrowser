import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { Page } from '@playwright/test';

import { expect, findTabPage, pressKeyInTab, test } from './fixtures';

const BASIC_TITLE = '픽스처 첫 페이지';
const SECOND_TITLE = '픽스처 두 번째 페이지';
const POPUP_TITLE = '픽스처 팝업 링크';
const MOD_MODIFIER = process.platform === 'darwin' ? 'meta' : 'control';

/** 주소창에 입력하고 Enter */
async function submitAddress(win: Page, text: string): Promise<void> {
  const addressBar = win.getByRole('combobox', { name: '주소창' });
  await addressBar.click();
  await addressBar.fill(text);
  await addressBar.press('Enter');
}

test('시작하면 새 탭 하나와 시작 화면이 보인다', async ({ win }) => {
  await expect(win.getByRole('tab')).toHaveCount(1);
  await expect(win.getByRole('tab', { name: '새 탭', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(win.getByRole('textbox', { name: '새 탭 검색' })).toBeVisible();
  await expect(win.getByRole('combobox', { name: '주소창' })).toHaveValue('');
});

test('주소창에 URL 을 입력하면 탭이 그 페이지로 이동한다', async ({ win, fixtureUrl }) => {
  const url = fixtureUrl('basic.html');
  await submitAddress(win, url);
  await expect(win.getByRole('tab', { name: BASIC_TITLE, exact: true })).toBeVisible();
  await expect(win.getByRole('combobox', { name: '주소창' })).toHaveValue(url);
  await expect(win.getByRole('textbox', { name: '새 탭 검색' })).toBeHidden();
});

test('뒤로·앞으로 버튼으로 이전·다음 페이지로 간다', async ({ win, fixtureUrl }) => {
  await submitAddress(win, fixtureUrl('basic.html'));
  await expect(win.getByRole('tab', { name: BASIC_TITLE, exact: true })).toBeVisible();
  await submitAddress(win, fixtureUrl('second.html'));
  await expect(win.getByRole('tab', { name: SECOND_TITLE, exact: true })).toBeVisible();

  await win.getByRole('button', { name: '뒤로', exact: true }).click();
  await expect(win.getByRole('tab', { name: BASIC_TITLE, exact: true })).toBeVisible();
  await win.getByRole('button', { name: '앞으로', exact: true }).click();
  await expect(win.getByRole('tab', { name: SECOND_TITLE, exact: true })).toBeVisible();
});

test('새 탭을 열고 전환하고 닫을 수 있다', async ({ win, fixtureUrl }) => {
  const url = fixtureUrl('basic.html');
  await submitAddress(win, url);
  await expect(win.getByRole('tab', { name: BASIC_TITLE, exact: true })).toBeVisible();

  await win.getByRole('button', { name: '새 탭 열기', exact: true }).click();
  await expect(win.getByRole('tab')).toHaveCount(2);
  await expect(win.getByRole('combobox', { name: '주소창' })).toHaveValue('');

  await win.getByRole('tab', { name: BASIC_TITLE, exact: true }).click();
  await expect(win.getByRole('combobox', { name: '주소창' })).toHaveValue(url);

  await win.getByRole('button', { name: '새 탭 탭 닫기', exact: true }).click();
  await expect(win.getByRole('tab')).toHaveCount(1);
});

test('URL 이 아닌 글자를 입력하면 검색 선택지가 뜨고 Esc 로 닫힌다', async ({ win }) => {
  const addressBar = win.getByRole('combobox', { name: '주소창' });
  await addressBar.click();
  await addressBar.fill('강남 맛집');
  await expect(win.getByRole('option', { name: "'강남 맛집' — 네이버에서 검색" })).toBeVisible();
  await expect(win.getByRole('option', { name: "'강남 맛집' — 구글에서 검색" })).toBeVisible();

  await addressBar.press('Escape');
  await expect(win.getByRole('listbox', { name: '검색 선택' })).toBeHidden();
  await expect(win.getByRole('tab', { name: '새 탭', exact: true })).toBeVisible();
});

test('target=_blank 링크는 별도 창이 아니라 새 탭으로 열린다', async ({ app, win, fixtureUrl }) => {
  await submitAddress(win, fixtureUrl('popup-link.html'));
  await expect(win.getByRole('tab', { name: POPUP_TITLE, exact: true })).toBeVisible();

  const page = await findTabPage(app, 'popup-link.html');
  await page.getByRole('link', { name: '새 탭으로 열기' }).click();
  await expect(win.getByRole('tab')).toHaveCount(2);
  await expect(win.getByRole('tab', { name: SECOND_TITLE, exact: true })).toHaveAttribute('aria-selected', 'true');

  // file: 링크는 새 탭도 별도 창도 만들지 않는다 (SR-2)
  await page.getByRole('link', { name: 'file 링크' }).click();
  await expect(win.getByRole('tab')).toHaveCount(2);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
});

test('탭 페이지에 포커스가 있어도 단축키가 동작한다', async ({ app, win, fixtureUrl }) => {
  await submitAddress(win, fixtureUrl('basic.html'));
  await expect(win.getByRole('tab', { name: BASIC_TITLE, exact: true })).toBeVisible();
  await pressKeyInTab(app, { urlPart: 'basic.html', keyCode: 't', modifierList: [MOD_MODIFIER] });
  await expect(win.getByRole('tab')).toHaveCount(2);
  await expect(win.getByRole('textbox', { name: '새 탭 검색' })).toBeFocused();

  await win.getByRole('tab', { name: BASIC_TITLE, exact: true }).click();
  await pressKeyInTab(app, { urlPart: 'basic.html', keyCode: 'l', modifierList: [MOD_MODIFIER] });
  await expect(win.getByRole('combobox', { name: '주소창' })).toBeFocused();

  await pressKeyInTab(app, { urlPart: 'basic.html', keyCode: 'w', modifierList: [MOD_MODIFIER] });
  await expect(win.getByRole('tab')).toHaveCount(1);
});

test('메뉴 막대는 숨기고 편집 메뉴만 남긴다', async ({ app, win }) => {
  await expect(win.getByRole('tab')).toHaveCount(1);
  const menu = await app.evaluate(({ BrowserWindow, Menu }) => ({
    isMenuBarVisible: BrowserWindow.getAllWindows()[0]?.isMenuBarVisible(),
    roleList: Menu.getApplicationMenu()?.items.map((item) => item.role ?? null) ?? [],
  }));
  expect(menu.isMenuBarVisible).toBe(false);
  expect(menu.roleList).toContain('editmenu');
  for (const role of ['filemenu', 'viewmenu', 'windowmenu']) expect(menu.roleList).not.toContain(role);
});

test('로그인 쿠키는 앱을 다시 켜도 남고 탭은 새 탭 하나로 시작한다', async ({ launchApp, fixtureUrl }) => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mybrowser-e2e-persist-'));
  try {
    const first = await launchApp({ userDataDir });
    await submitAddress(first.win, fixtureUrl('set-cookie'));
    await expect(first.win.getByRole('tab', { name: '쿠키 확인', exact: true })).toBeVisible();
    await first.app.close();

    const second = await launchApp({ userDataDir });
    await expect(second.win.getByRole('tab')).toHaveCount(1);
    await expect(second.win.getByRole('tab', { name: '새 탭', exact: true })).toBeVisible();
    await submitAddress(second.win, fixtureUrl('cookie'));
    const page = await findTabPage(second.app, '/cookie');
    await expect(page.locator('#cookie')).toContainText('e2e_login=1');
    await second.app.close();
  } finally {
    rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('크롬 화면 스크린샷을 남긴다 (시각 확인용)', async ({ win, fixtureUrl }) => {
  await submitAddress(win, fixtureUrl('basic.html'));
  await expect(win.getByRole('tab', { name: BASIC_TITLE, exact: true })).toBeVisible();
  await win.getByRole('button', { name: '새 탭 열기', exact: true }).click();
  await expect(win.getByRole('tab')).toHaveCount(2);
  const dir = resolve(__dirname, '../test-results');
  mkdirSync(dir, { recursive: true });
  await win.screenshot({ path: join(dir, 'browser-chrome.png') });
});
