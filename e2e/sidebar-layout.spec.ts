/**
 * [spec 012] 사이드바 폭 조절·단축키·다크 모드 — 손잡이로 폭을 바꾸면 탭 View 가 따라오고 다음 실행까지 기억한다.
 * Ctrl+Shift+A 는 탭 페이지에 포커스가 있어도 패널을 닫고 연다.
 * 다크: Playwright 는 기본으로 colorScheme 'light' 를 에뮬레이트하므로 emulateMedia({ colorScheme: null }) 로 풀고 nativeTheme 을 바꾼다.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, pressKeyInTab, test } from './fixtures';
import { getSidebar, openInActiveTab } from './helpers';

const MOD_MODIFIER = process.platform === 'darwin' ? 'meta' : 'control';
const SCREENSHOT_DIR = process.env['HARNESS_RUN_DIR'] ?? 'test-results';

function getResizer(win: Page) {
  return win.getByRole('separator', { name: '사이드바 폭 조절' });
}

/** 보이는 탭 View 의 폭 (spec 011 방식) */
async function readVisibleTabViewWidth(app: ElectronApplication): Promise<number | null> {
  return app.evaluate(({ BrowserWindow }) => {
    const [mainWindow] = BrowserWindow.getAllWindows();
    const visibleView = mainWindow?.contentView.children.find((view) => view.getVisible());
    return visibleView ? visibleView.getBounds().width : null;
  });
}

async function expectTabViewFitsContent(app: ElectronApplication, win: Page): Promise<void> {
  const region = win.getByRole('region', { name: '탭 콘텐츠' });
  await expect
    .poll(async () => {
      const box = await region.boundingBox();
      return box ? (await readVisibleTabViewWidth(app)) === Math.round(box.width) : false;
    })
    .toBe(true);
}

/** 손잡이를 dx 만큼 끈다 (왼쪽 음수 = 패널이 넓어짐) */
async function dragResizer(win: Page, dx: number): Promise<void> {
  const box = await getResizer(win).boundingBox();
  if (!box) throw new Error('폭 조절 손잡이가 보이지 않습니다');
  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await win.mouse.move(startX, y);
  await win.mouse.down();
  await win.mouse.move(startX + dx, y, { steps: 5 });
  await win.mouse.up();
}

test('손잡이를 끌면 패널이 넓어지고 탭 View 가 맞춰지며, 다시 켜도 폭이 유지된다', async ({
  launchApp,
  fixtureUrl,
}) => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mybrowser-layout-'));
  try {
    const first = await launchApp({ userDataDir });
    await openInActiveTab(first.win, fixtureUrl('basic.html'), '픽스처 첫 페이지');
    const sidebar = getSidebar(first.win);
    const before = (await sidebar.boundingBox())?.width ?? 0;
    await dragResizer(first.win, -100);
    await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeGreaterThan(before + 50);
    const widened = Math.round((await sidebar.boundingBox())?.width ?? 0);
    await expectTabViewFitsContent(first.app, first.win);
    await first.app.close();

    const second = await launchApp({ userDataDir });
    await expect.poll(async () => Math.round((await getSidebar(second.win).boundingBox())?.width ?? 0)).toBe(widened);
    await second.app.close();
  } finally {
    rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('손잡이에 포커스한 채 ←/→ 로 16px 씩 조절한다', async ({ win }) => {
  const resizer = getResizer(win);
  await resizer.focus();
  const before = Number(await resizer.getAttribute('aria-valuenow'));
  await resizer.press('ArrowLeft');
  await expect(resizer).toHaveAttribute('aria-valuenow', String(before + 16));
  await resizer.press('ArrowRight');
  await expect(resizer).toHaveAttribute('aria-valuenow', String(before));
});

test('탭 페이지에 포커스가 있어도 Ctrl+Shift+A 로 패널을 닫고 연다', async ({ app, win, fixtureUrl }) => {
  await openInActiveTab(win, fixtureUrl('basic.html'), '픽스처 첫 페이지');
  const sidebar = getSidebar(win);
  const shortcut: Parameters<typeof pressKeyInTab>[1] = {
    urlPart: 'basic.html',
    keyCode: 'a',
    modifierList: [MOD_MODIFIER, 'shift'],
  };

  await pressKeyInTab(app, shortcut);
  await expect(sidebar).toBeHidden();
  await pressKeyInTab(app, shortcut);
  await expect(sidebar).toBeVisible();
});

test('OS 테마가 다크면 크롬·사이드바가 다크 토큰으로 그려진다', async ({ app, win }) => {
  await win.emulateMedia({ colorScheme: null });
  await app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = 'dark';
  });
  await expect
    .poll(() =>
      win.evaluate(() => {
        const g = globalThis as unknown as {
          getComputedStyle: (element: unknown) => { backgroundColor: string };
          document: { body: unknown };
        };
        return g.getComputedStyle(g.document.body).backgroundColor;
      }),
    )
    .toBe('oklch(0.21 0.006 285.9)');
  await win.screenshot({ path: join(SCREENSHOT_DIR, 'sidebar-dark.png') });
});
