/**
 * [e2e 픽스처] 실제 myBrowser 앱을 Playwright _electron 으로 띄운다.
 * - 깨끗한 임시 프로필(MYBROWSER_USER_DATA), 가짜 모델 모드(MYBROWSER_FAKE_MODEL=1), 임의 CDP 포트(0 — 떠 있는 pnpm dev 와 충돌 방지)
 * - renderer console.error·pageerror·main 의 [main.error] 를 모아 HARNESS_RUN_DIR/console-errors.log 에 쓰고, 1건이라도 있으면 테스트를 실패시킨다
 * - 탭 페이지는 로컬 픽스처 서버(fixtureUrl)만 연다 — 외부 사이트 금지
 * 규칙: .claude/rules/test-convention.md 「e2e」, .claude/skills/desktop/app-check
 */
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron, test as base, type ElectronApplication, type Page } from '@playwright/test';

import { type IFixtureServer, startFixtureServer } from './fixtures/server';

export { expect } from '@playwright/test';

const ROOT = resolve(__dirname, '..');

/** 알려진 무해한 출력 — 패턴과 이유를 함께 적는다. 테스트 코드에서 개별로 무시하지 않는다 */
const IGNORED_ERROR_LIST: { pattern: RegExp; reason: string }[] = [];

/** 앱을 한 번 띄운 결과 — 같은 userData 로 여러 번 띄우는 테스트(프로필 영속)에서 쓴다 */
export interface ILaunchedApp {
  app: ElectronApplication;
  win: Page;
}

interface IFixtures {
  app: ElectronApplication;
  win: Page;
  errorList: string[];
  /** 픽스처 서버 경로의 절대 URL — 예: fixtureUrl('basic.html') */
  fixtureUrl: (path: string) => string;
  /** 같은 userData 로 앱을 띄운다 — 테스트가 닫는다. 에러는 errorList 로 모인다 */
  launchApp: (options: { userDataDir: string }) => Promise<ILaunchedApp>;
}

function isIgnored(line: string): boolean {
  return IGNORED_ERROR_LIST.some(({ pattern }) => pattern.test(line));
}

function writeErrorLog(testTitle: string, errorList: string[]): void {
  const runDir = process.env['HARNESS_RUN_DIR'];
  if (!runDir) return;
  mkdirSync(runDir, { recursive: true });
  const body = errorList.length ? errorList.join('\n') : '(no errors)';
  appendFileSync(join(runDir, 'console-errors.log'), `## ${testTitle}\n${body}\n`);
}

/** 앱을 띄우고 main 의 [main.error] 줄을 errorList 에 모은다 */
async function launchElectron(userDataDir: string, errorList: string[]): Promise<ElectronApplication> {
  const { ELECTRON_RENDERER_URL: _devServerUrl, ...baseEnv } = process.env;
  const app = await _electron.launch({
    args: [ROOT],
    cwd: ROOT,
    env: {
      ...baseEnv,
      NODE_ENV: 'test',
      MYBROWSER_FAKE_MODEL: '1',
      MYBROWSER_CDP_PORT: '0',
      MYBROWSER_USER_DATA: userDataDir,
    },
  });
  app.process().stderr?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.startsWith('[main.error]') && !isIgnored(line)) errorList.push(line);
    }
  });
  return app;
}

const CHROME_URL_PATTERN = /\/renderer\/index\.html$|^http:\/\/localhost:\d+\/?$/;

/** 크롬 + 사이드바 renderer 창을 찾는다 — 탭 View(about:blank)가 먼저 잡힐 수 있어 firstWindow 를 쓰지 않는다 */
async function findChromeWindow(app: ElectronApplication): Promise<Page> {
  const found = app.windows().find((page) => CHROME_URL_PATTERN.test(page.url()));
  if (found) return found;
  return app.waitForEvent('window', { predicate: (page) => CHROME_URL_PATTERN.test(page.url()) });
}

/** 크롬 창을 받아 콘솔 에러·pageerror 를 errorList 에 모은다 */
async function openChromeWindow(app: ElectronApplication, errorList: string[]): Promise<Page> {
  const win = await findChromeWindow(app);
  win.on('console', (message) => {
    if (message.type() === 'error' && !isIgnored(message.text())) errorList.push(`[console.error] ${message.text()}`);
  });
  win.on('pageerror', (error) => errorList.push(`[pageerror] ${error.message}`));
  await win.waitForLoadState('domcontentloaded');
  return win;
}

/** 탭(WebContentsView) 페이지를 URL 일부로 찾는다 — 크롬 창이 아닌 Page 중에서 */
export async function findTabPage(app: ElectronApplication, urlPart: string): Promise<Page> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => candidate.url().includes(urlPart));
    if (page) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`탭 페이지를 찾지 못했습니다: ${urlPart}`);
}

/**
 * 탭 webContents 에 OS 입력과 같은 경로로 키를 보낸다 — Playwright 의 keyboard(CDP)는 before-input-event 를 거치지 않아
 * main 의 단축키 처리를 검증할 수 없다.
 */
export async function pressKeyInTab(
  app: ElectronApplication,
  { urlPart, keyCode, modifierList }: { urlPart: string; keyCode: string; modifierList: ('control' | 'meta' | 'shift' | 'alt')[] },
): Promise<void> {
  await app.evaluate(
    ({ webContents }, args) => {
      const target = webContents.getAllWebContents().find((candidate) => candidate.getURL().includes(args.urlPart));
      if (!target) throw new Error(`탭 webContents 를 찾지 못했습니다: ${args.urlPart}`);
      target.focus();
      target.sendInputEvent({ type: 'keyDown', keyCode: args.keyCode, modifiers: args.modifierList });
      target.sendInputEvent({ type: 'keyUp', keyCode: args.keyCode, modifiers: args.modifierList });
    },
    { urlPart, keyCode, modifierList },
  );
}

export const test = base.extend<IFixtures, { fixtureServer: IFixtureServer }>({
  fixtureServer: [
    async ({}, use) => {
      const server = await startFixtureServer();
      await use(server);
      await server.close();
    },
    { scope: 'worker' },
  ],

  fixtureUrl: async ({ fixtureServer }, use) => {
    await use((path) => fixtureServer.url(path));
  },

  errorList: async ({}, use, testInfo) => {
    const errorList: string[] = [];
    await use(errorList);
    writeErrorLog(testInfo.title, errorList);
    if (errorList.length) throw new Error(`앱에서 에러 ${errorList.length}건 발생:\n${errorList.join('\n')}`);
  },

  launchApp: async ({ errorList }, use) => {
    await use(async ({ userDataDir }) => {
      const app = await launchElectron(userDataDir, errorList);
      return { app, win: await openChromeWindow(app, errorList) };
    });
  },

  app: async ({ errorList }, use) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'mybrowser-e2e-'));
    const app = await launchElectron(userDataDir, errorList);
    await use(app);
    await app.close();
    rmSync(userDataDir, { recursive: true, force: true });
  },

  win: async ({ app, errorList }, use) => {
    await use(await openChromeWindow(app, errorList));
  },
});
