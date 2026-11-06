/**
 * [e2e 픽스처] 실제 myBrowser 앱을 Playwright _electron 으로 띄운다.
 * - 깨끗한 임시 프로필(MYBROWSER_USER_DATA), 가짜 모델 모드(MYBROWSER_FAKE_MODEL=1, 시나리오는 fakeScenario 옵션), 임의 CDP 포트(0 — 떠 있는 pnpm dev 와 충돌 방지)
 * - renderer console.error·pageerror·main 의 [main.error] 를 모아 HARNESS_RUN_DIR/console-errors.log 에 쓰고, 1건이라도 있으면 테스트를 실패시킨다
 * - 탭 페이지는 로컬 픽스처 서버(fixtureUrl)만 연다 — 외부 사이트 금지
 * - `test.use({ appEnv, executablePath })` 로 env 를 덮어쓰거나(값 undefined = 키 제거) 설치판 실행 파일을 띄운다 (spec 005)
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

/** 앱 env 덮어쓰기 — 값이 undefined 면 그 키를 env 에서 뺀다 (예: 설치판 e2e 의 MYBROWSER_CDP_PORT) */
export type TAppEnv = Record<string, string | undefined>;

/** launchApp 호출 인자 — appEnv 는 fixture 옵션 appEnv 위에 덮어쓴다 (가짜 게이트웨이처럼 실행마다 바뀌는 값) */
export interface ILaunchAppOptions {
  userDataDir: string;
  appEnv?: TAppEnv;
}

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
  launchApp: (options: ILaunchAppOptions) => Promise<ILaunchedApp>;
  /** 가짜 모델 시나리오 이름(e2e/fixtures/model/{이름}.json) — `test.use({ fakeScenario })` 로 고른다 */
  fakeScenario: string | undefined;
  /** 기본 env 위에 덮어쓸 값 — `test.use({ appEnv })` */
  appEnv: TAppEnv;
  /** 설치판 실행 파일 — 주면 소스 폴더(ROOT)를 인자로 넘기지 않는다. `test.use({ executablePath })` */
  executablePath: string | undefined;
}

/** launchElectron 입력 */
interface ILaunchElectronOptions {
  userDataDir: string;
  errorList: string[];
  fakeScenario?: string;
  appEnv: TAppEnv;
  executablePath?: string;
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

/** 기본 env + appEnv 덮어쓰기 — undefined 값의 키는 뺀다 */
function createAppEnv({ userDataDir, fakeScenario, appEnv }: ILaunchElectronOptions): Record<string, string> {
  const { ELECTRON_RENDERER_URL: _devServerUrl, ...baseEnv } = process.env;
  const merged: TAppEnv = {
    ...baseEnv,
    NODE_ENV: 'test',
    MYBROWSER_FAKE_MODEL: '1',
    MYBROWSER_CDP_PORT: '0',
    MYBROWSER_USER_DATA: userDataDir,
    ...(fakeScenario ? { MYBROWSER_FAKE_SCENARIO: fakeScenario } : {}),
    ...appEnv,
  };
  return Object.fromEntries(
    Object.entries(merged).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

/** 앱을 띄우고 main 의 [main.error] 줄을 errorList 에 모은다 */
async function launchElectron(options: ILaunchElectronOptions): Promise<ElectronApplication> {
  const { errorList, executablePath } = options;
  const app = await _electron.launch({
    ...(executablePath ? { executablePath } : { args: [ROOT] }),
    cwd: ROOT,
    env: createAppEnv(options),
  });
  app.process().stderr?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.startsWith(EXTERNAL_REQUEST_PREFIX)) errorList.push(line);
      else if (line.startsWith('[main.error]') && !isIgnored(line)) errorList.push(line);
    }
  });
  await blockExternalRequests(app);
  return app;
}

/** e2e 중 외부 사이트 요청을 막았다는 표시 — errorList 에 들어가 테스트를 실패시킨다 (spec 008 FR-3) */
export const EXTERNAL_REQUEST_PREFIX = '[e2e.external]';

/**
 * 탭(브라우징 세션)의 외부 host 요청을 취소하고 stderr 에 남긴다 — 테스트가 외부 사이트에 기대지 않게 한다.
 * 앱 코드(src/)에는 넣지 않는다 (SR-4). app.evaluate 안은 main 프로세스로 직렬화되므로 판정을 함수 안에 둔다.
 */
async function blockExternalRequests(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ session }, prefix) => {
    const LOCAL_HOST_LIST = ['127.0.0.1', 'localhost', '[::1]'];
    const LOCAL_SCHEME_LIST = ['about:', 'data:', 'blob:', 'devtools:', 'chrome:', 'file:'];
    const isLocal = (url: string) => {
      try {
        const { protocol, hostname } = new URL(url);
        return LOCAL_SCHEME_LIST.includes(protocol) || LOCAL_HOST_LIST.includes(hostname);
      } catch {
        return false;
      }
    };
    session.fromPartition('persist:browsing').webRequest.onBeforeRequest((details, callback) => {
      if (isLocal(details.url)) return callback({});
      process.stderr.write(`${prefix} ${details.url}\n`);
      callback({ cancel: true });
    });
  }, EXTERNAL_REQUEST_PREFIX);
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
  {
    urlPart,
    keyCode,
    modifierList,
  }: { urlPart: string; keyCode: string; modifierList: ('control' | 'meta' | 'shift' | 'alt')[] },
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
  fakeScenario: [undefined, { option: true }],
  appEnv: [{}, { option: true }],
  executablePath: [undefined, { option: true }],

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

  launchApp: async ({ errorList, fakeScenario, appEnv, executablePath }, use) => {
    await use(async ({ userDataDir, appEnv: callAppEnv }) => {
      const merged = { ...appEnv, ...callAppEnv };
      const app = await launchElectron({ userDataDir, errorList, fakeScenario, appEnv: merged, executablePath });
      return { app, win: await openChromeWindow(app, errorList) };
    });
  },

  app: async ({ errorList, fakeScenario, appEnv, executablePath }, use) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'mybrowser-e2e-'));
    const app = await launchElectron({ userDataDir, errorList, fakeScenario, appEnv, executablePath });
    await use(app);
    await app.close();
    rmSync(userDataDir, { recursive: true, force: true });
  },

  win: async ({ app, errorList }, use) => {
    await use(await openChromeWindow(app, errorList));
  },
});
