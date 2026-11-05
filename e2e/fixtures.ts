/**
 * [e2e 픽스처] 실제 myBrowser 앱을 Playwright _electron 으로 띄운다.
 * - 깨끗한 임시 프로필(MYBROWSER_USER_DATA), 가짜 모델 모드(MYBROWSER_FAKE_MODEL=1), 임의 CDP 포트(0 — 떠 있는 pnpm dev 와 충돌 방지)
 * - renderer console.error·pageerror·main 의 [main.error] 를 모아 HARNESS_RUN_DIR/console-errors.log 에 쓰고, 1건이라도 있으면 테스트를 실패시킨다
 * 규칙: .claude/rules/test-convention.md 「e2e」, .claude/skills/desktop/app-check
 */
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron, test as base, type ElectronApplication, type Page } from '@playwright/test';

export { expect } from '@playwright/test';

const ROOT = resolve(__dirname, '..');

/** 알려진 무해한 출력 — 패턴과 이유를 함께 적는다. 테스트 코드에서 개별로 무시하지 않는다 */
const IGNORED_ERROR_LIST: { pattern: RegExp; reason: string }[] = [];

interface IFixtures {
  app: ElectronApplication;
  win: Page;
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

export const test = base.extend<IFixtures & { errorList: string[] }>({
  errorList: async ({}, use, testInfo) => {
    const errorList: string[] = [];
    await use(errorList);
    writeErrorLog(testInfo.title, errorList);
    if (errorList.length) throw new Error(`앱에서 에러 ${errorList.length}건 발생:\n${errorList.join('\n')}`);
  },

  app: async ({ errorList }, use) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'mybrowser-e2e-'));
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
    await use(app);
    await app.close();
    rmSync(userDataDir, { recursive: true, force: true });
  },

  win: async ({ app, errorList }, use) => {
    const win = await app.firstWindow();
    win.on('console', (message) => {
      if (message.type() === 'error' && !isIgnored(message.text())) errorList.push(`[console.error] ${message.text()}`);
    });
    win.on('pageerror', (error) => errorList.push(`[pageerror] ${error.message}`));
    await win.waitForLoadState('domcontentloaded');
    await use(win);
  },
});
