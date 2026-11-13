/**
 * spec 021 — 북마크·방문 기록·페이지 내 찾기·확대/축소 흐름 (실제 앱, 로컬 픽스처)
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, pressKeyInTab, test } from './fixtures';
import { openInActiveTab } from './helpers';

const BASIC_TITLE = '픽스처 첫 페이지';
const SECOND_TITLE = '픽스처 두 번째 페이지';
const FIND_TITLE = '픽스처 찾기 페이지';
const MOD_MODIFIER = process.platform === 'darwin' ? 'meta' : 'control';

/**
 * [메뉴] 를 눌러 네이티브 팝업의 「방문 기록」 을 고른다 — OS 메뉴는 Playwright 가 누를 수 없어
 * main 의 Menu.prototype.popup 을 가로채 띄운 메뉴를 잡아 두고 그 항목을 click 한다.
 */
async function openHistoryFromMenu(app: ElectronApplication, win: Page): Promise<void> {
  await app.evaluate(({ Menu }) => {
    const store = globalThis as typeof globalThis & { lastPopupMenu?: Electron.Menu };
    Menu.prototype.popup = function capturePopup(this: Electron.Menu) {
      store.lastPopupMenu = this;
    };
    store.lastPopupMenu = undefined;
  });
  await win.getByRole('button', { name: '메뉴', exact: true }).click();
  await expect
    .poll(() =>
      app.evaluate(() => {
        const store = globalThis as typeof globalThis & { lastPopupMenu?: Electron.Menu };
        return store.lastPopupMenu?.items.map((item) => item.label) ?? [];
      }),
    )
    .toEqual(['방문 기록']);
  await app.evaluate(() => {
    const store = globalThis as typeof globalThis & { lastPopupMenu?: Electron.Menu };
    store.lastPopupMenu?.items[0]?.click();
  });
}

/** 새 탭 버튼으로 시작 화면을 연다 */
async function openNewTab(win: Page): Promise<void> {
  await win.getByRole('button', { name: '새 탭 열기', exact: true }).click();
  await expect(win.getByRole('textbox', { name: '새 탭 검색' })).toBeVisible();
}

test('[북마크] 로 넣은 페이지가 새 탭 타일로 보이고 누르면 이동하며, 다시 켜도 남는다', async ({
  launchApp,
  fixtureUrl,
}) => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mybrowser-e2e-bookmark-'));
  try {
    const first = await launchApp({ userDataDir });
    await openInActiveTab(first.win, fixtureUrl('basic.html'), BASIC_TITLE);
    const star = first.win.getByRole('button', { name: '북마크', exact: true });
    await star.click();
    await expect(star).toHaveAttribute('aria-pressed', 'true');

    await openNewTab(first.win);
    const tile = first.win.getByRole('navigation', { name: '북마크' }).getByRole('button', { name: BASIC_TITLE });
    await tile.click();
    await expect(first.win.getByRole('combobox', { name: '주소창' })).toHaveValue(fixtureUrl('basic.html'));
    await first.app.close();

    const second = await launchApp({ userDataDir });
    await expect(
      second.win.getByRole('navigation', { name: '북마크' }).getByRole('button', { name: BASIC_TITLE }),
    ).toBeVisible();
    await second.app.close();
  } finally {
    rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('Ctrl+D 로 북마크를 넣고 다시 누르면 뺀다', async ({ app, win, fixtureUrl }) => {
  await openInActiveTab(win, fixtureUrl('basic.html'), BASIC_TITLE);
  const star = win.getByRole('button', { name: '북마크', exact: true });
  await pressKeyInTab(app, { urlPart: 'basic.html', keyCode: 'd', modifierList: [MOD_MODIFIER] });
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await pressKeyInTab(app, { urlPart: 'basic.html', keyCode: 'd', modifierList: [MOD_MODIFIER] });
  await expect(star).toHaveAttribute('aria-pressed', 'false');
});

test('새 탭에는 방문 기록이 없고 [메뉴] 「방문 기록」 페이지에서 검색·한 줄 지우기·모두 지우기가 된다 (spec 023)', async ({
  app,
  win,
  fixtureUrl,
}) => {
  await openInActiveTab(win, fixtureUrl('basic.html'), BASIC_TITLE);
  await openInActiveTab(win, fixtureUrl('second.html'), SECOND_TITLE);
  await openNewTab(win);
  await expect(win.getByRole('textbox', { name: '방문 기록 검색' })).toBeHidden();

  await openHistoryFromMenu(app, win);
  await expect(win.getByRole('tab', { name: '방문 기록', exact: true })).toBeVisible();
  await expect(win.getByRole('heading', { name: '방문 기록', level: 1 })).toBeVisible();
  await expect(win.getByRole('textbox', { name: '방문 기록 검색' })).toBeFocused();
  const list = win.getByRole('list', { name: '방문 기록 목록' });
  await expect(list.getByRole('button', { name: SECOND_TITLE, exact: true })).toBeVisible();
  await expect(list.getByRole('button', { name: BASIC_TITLE, exact: true })).toBeVisible();

  await win.getByRole('textbox', { name: '방문 기록 검색' }).fill('두 번째');
  await expect(list.getByRole('button', { name: BASIC_TITLE, exact: true })).toBeHidden();
  await list.getByRole('button', { name: `${SECOND_TITLE} 기록에서 지우기` }).click();
  await expect(win.getByText('찾는 기록이 없습니다')).toBeVisible();

  await win.getByRole('textbox', { name: '방문 기록 검색' }).fill('');
  await expect(list.getByRole('button', { name: BASIC_TITLE, exact: true })).toBeVisible();
  await win.getByRole('button', { name: '방문 기록 모두 지우기' }).click();
  await win.getByRole('button', { name: '정말 모두 지울까요?' }).click();
  await expect(win.getByText('방문 기록이 없습니다')).toBeVisible();
});

test('방문 기록 항목을 누르면 그 탭이 페이지로 이동하고 탭 제목도 바뀐다 (spec 023)', async ({ app, win, fixtureUrl }) => {
  await openInActiveTab(win, fixtureUrl('basic.html'), BASIC_TITLE);
  await openHistoryFromMenu(app, win);
  await win
    .getByRole('list', { name: '방문 기록 목록' })
    .getByRole('button', { name: BASIC_TITLE, exact: true })
    .click();
  await expect(win.getByRole('combobox', { name: '주소창' })).toHaveValue(fixtureUrl('basic.html'));
  await expect(win.getByRole('tab', { name: '방문 기록', exact: true })).toHaveCount(0);
  await expect(win.getByRole('heading', { name: '방문 기록', level: 1 })).toBeHidden();
});

test('Ctrl+F 로 찾기 줄을 열어 개수를 보고 Enter 로 다음, Esc 로 닫으며 이동하면 사라진다', async ({
  app,
  win,
  fixtureUrl,
}) => {
  await openInActiveTab(win, fixtureUrl('browser-find.html'), FIND_TITLE);
  await pressKeyInTab(app, { urlPart: 'browser-find.html', keyCode: 'f', modifierList: [MOD_MODIFIER] });
  const findInput = win.getByRole('textbox', { name: '찾을 내용' });
  await expect(findInput).toBeFocused();
  await findInput.fill('사과');
  const count = win.getByLabel('찾은 결과');
  await expect(count).toHaveText('1/3');
  await findInput.press('Enter');
  await expect(count).toHaveText('2/3');
  await findInput.press('Shift+Enter');
  await expect(count).toHaveText('1/3');
  await findInput.press('Escape');
  await expect(win.getByRole('search', { name: '페이지에서 찾기' })).toBeHidden();

  await pressKeyInTab(app, { urlPart: 'browser-find.html', keyCode: 'f', modifierList: [MOD_MODIFIER] });
  await expect(win.getByRole('search', { name: '페이지에서 찾기' })).toBeVisible();
  await openInActiveTab(win, fixtureUrl('second.html'), SECOND_TITLE);
  await expect(win.getByRole('search', { name: '페이지에서 찾기' })).toBeHidden();
});

test('Ctrl+= 두 번이면 125% 배율 버튼이 보이고 누르면 100% 로 돌아가 사라진다', async ({ app, win, fixtureUrl }) => {
  await openInActiveTab(win, fixtureUrl('basic.html'), BASIC_TITLE);
  await pressKeyInTab(app, { urlPart: 'basic.html', keyCode: '=', modifierList: [MOD_MODIFIER] });
  await pressKeyInTab(app, { urlPart: 'basic.html', keyCode: '=', modifierList: [MOD_MODIFIER] });
  const badge = win.getByRole('button', { name: /^확대\/축소 125%/ });
  await expect(badge).toBeVisible();
  await pressKeyInTab(app, { urlPart: 'basic.html', keyCode: '-', modifierList: [MOD_MODIFIER] });
  await expect(win.getByRole('button', { name: /^확대\/축소 110%/ })).toBeVisible();
  await win.getByRole('button', { name: /^확대\/축소/ }).click();
  await expect(win.getByRole('button', { name: /^확대\/축소/ })).toBeHidden();
});

test('Ctrl+H 면 방문 기록 탭이 열리고 검색에 포커스하며, 다시 눌러도 탭이 늘지 않는다 (spec 023)', async ({
  app,
  win,
  fixtureUrl,
}) => {
  await openInActiveTab(win, fixtureUrl('basic.html'), BASIC_TITLE);
  const historyKey = process.platform === 'darwin' ? ['meta', 'shift'] : ['control'];
  await pressKeyInTab(app, {
    urlPart: 'basic.html',
    keyCode: 'h',
    modifierList: historyKey as ('control' | 'meta' | 'shift')[],
  });
  await expect(win.getByRole('tab')).toHaveCount(2);
  await expect(win.getByRole('tab', { name: '방문 기록', exact: true })).toBeVisible();
  await expect(win.getByRole('textbox', { name: '방문 기록 검색' })).toBeFocused();

  await win.getByRole('tab', { name: BASIC_TITLE }).click();
  await openHistoryFromMenu(app, win);
  await expect(win.getByRole('tab')).toHaveCount(2);
  await expect(win.getByRole('textbox', { name: '방문 기록 검색' })).toBeFocused();
});
