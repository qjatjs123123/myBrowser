/**
 * [평가 세트] 시나리오마다 실제 앱(_electron)을 띄워 할 일을 실행하고, 승인·질문은 시나리오 지시대로 답한다 (spec 005 FR-8).
 * 결과는 앱을 닫은 뒤 sqlite 에서 읽어 MYBROWSER_EVAL_RESULT_FILE 에 1줄(JSON)씩 붙인다 — 표·JSON 은 eval/cli.mjs 가 만든다.
 * 새 IPC 없이 e2e 픽스처(e2e/fixtures.ts)와 e2e 와 같은 화면 조작만 쓴다. 페이지는 로컬 픽스처만.
 */
import { appendFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test, type TAppEnv } from '../e2e/fixtures';
import { openInActiveTab as openWithTitle, runTask } from '../e2e/helpers';
import { EVAL_REAL_ENV, EVAL_SET_ENV, SITE_SET_NAME } from './cliArgs';
import { driveUntilEnd } from './drive';
import { DB_FILE_NAME, isPassed, readRunMetrics, type TEvalResult } from './report';
import { EVAL_SCENARIO_LIST, type IEvalScenario } from './scenarios';

const isReal = process.env[EVAL_REAL_ENV] === '1';
/** 실제 사이트 세트를 돌릴 때는 이 픽스처 세트를 만들지 않는다 (spec 020 FR-7) */
const isSiteSet = process.env[EVAL_SET_ENV] === SITE_SET_NAME;
const RESULT_FILE = process.env['MYBROWSER_EVAL_RESULT_FILE'];

/** 실제 모델 평가 — 가짜 모델·가짜 시나리오·게이트웨이를 빼서 dev 프로필(사내 GenAI 프록시: ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL)로 띄운다 (spec 007) */
const REAL_APP_ENV: TAppEnv = {
  MYBROWSER_FAKE_MODEL: '0',
  MYBROWSER_FAKE_SCENARIO: undefined,
  MYBROWSER_PROFILE: 'dev',
  MYBROWSER_GATEWAY_URL: undefined,
};

for (const scenario of isSiteSet ? [] : EVAL_SCENARIO_LIST) {
  test.describe(scenario.id, () => {
    test.use(isReal ? { appEnv: REAL_APP_ENV } : { fakeScenario: scenario.fakeScenario });

    test(`${scenario.id}: ${scenario.task}`, async ({ launchApp, fixtureUrl }) => {
      const result = await runScenario({ scenario, launchApp, fixtureUrl });
      if (RESULT_FILE) appendFileSync(RESULT_FILE, `${JSON.stringify(result)}\n`);
      expect(result.error).toBeUndefined();
      expect(isPassed(result), `기대 ${JSON.stringify(scenario.expect)} — 결과 ${JSON.stringify(result)}`).toBe(true);
    });
  });
}

interface IRunScenarioInput {
  scenario: IEvalScenario;
  launchApp: (options: { userDataDir: string }) => Promise<{ app: ElectronApplication; win: Page }>;
  fixtureUrl: (path: string) => string;
}

/** 앱 1회 실행 → 끝까지 진행 → 닫고 DB 지표 수집. 오류도 결과 1줄로 남긴다 */
async function runScenario({ scenario, launchApp, fixtureUrl }: IRunScenarioInput): Promise<TEvalResult> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mybrowser-eval-'));
  let approvals = 0;
  let error: string | undefined;
  let app: ElectronApplication | undefined;
  try {
    const launched = await launchApp({ userDataDir });
    app = launched.app;
    await openInActiveTab(launched.win, fixtureUrl(scenario.startPage));
    await runTask(launched.win, scenario.task);
    approvals = await driveUntilEnd(launched.win, {
      approvalAnswer: scenario.onApproval ?? 'denied',
      questionOption: scenario.onQuestion,
    });
  } catch (caught) {
    error = caught instanceof Error ? caught.message.split('\n')[0] : String(caught);
  } finally {
    await app?.close();
  }
  const result = collectResult({ scenario, userDataDir, approvals, error });
  rmSync(userDataDir, { recursive: true, force: true });
  return result;
}

function collectResult({
  scenario,
  userDataDir,
  approvals,
  error,
}: {
  scenario: IEvalScenario;
  userDataDir: string;
  approvals: number;
  error: string | undefined;
}): TEvalResult {
  const dbPath = join(userDataDir, DB_FILE_NAME);
  const metrics = existsSync(dbPath) ? readRunMetrics(dbPath) : null;
  return {
    id: scenario.id,
    expect: scenario.expect,
    status: metrics?.status ?? null,
    toolCalls: metrics?.toolCalls ?? 0,
    approvals,
    inputTokens: metrics?.inputTokens ?? 0,
    outputTokens: metrics?.outputTokens ?? 0,
    durationMs: metrics?.durationMs ?? null,
    ...(error === undefined ? {} : { error }),
  };
}

/** 주소창으로 활성 탭을 픽스처로 옮기고 탭 제목이 바뀔 때까지 기다린다 (e2e/agent-*.spec.ts 와 같은 순서) */
async function openInActiveTab(win: Page, url: string): Promise<void> {
  await openWithTitle(win, url, await getPageTitle(win, url));
}

/** 픽스처의 <title> — 파일을 바꿔도 따라가게 서버에서 읽는다 */
async function getPageTitle(win: Page, url: string): Promise<string> {
  const response = await win.request.get(url);
  return /<title>([^<]+)<\/title>/.exec(await response.text())?.[1] ?? '';
}
