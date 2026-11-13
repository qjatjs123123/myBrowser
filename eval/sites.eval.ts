/**
 * [평가 세트] 실제 사이트 세트 (spec 019) — `pnpm eval -- --real --yes-spend --set sites [--repeat N]` 일 때만 테스트를 만든다.
 * 시나리오 × 회차마다 깨끗한 프로필로 앱을 띄워 실제 사이트에서 할 일을 실행하고, 승인 창은 항상 거부한다 (SR-1).
 * 판정은 assert 하지 않고 결과 줄만 쓴다 — 집계·종료 코드는 eval/cli.mjs (FR-3·FR-6).
 * 실행마다 MYBROWSER_EVAL_OUT_DIR 에 `{id}-{n}.png`(끝 화면)·`{id}-{n}.steps.json`(단계 로그)을 남긴다 (FR-4).
 */
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { test, type TAppEnv } from '../e2e/fixtures';
import { runTask } from '../e2e/helpers';
import { EVAL_REPEAT_ENV, EVAL_SET_ENV, SITE_SET_NAME } from './cliArgs';
import { captureTab, driveUntilEnd, getAddressBarUrl, openSiteInActiveTab } from './drive';
import { DB_FILE_NAME, readRunMetrics, readStepList } from './report';
import { judgeSiteRun, type TSiteResult } from './siteJudge';
import { type ISiteScenario, SITE_APPROVAL_ANSWER, SITE_SCENARIO_LIST } from './siteScenarios';

const isSiteSet = process.env[EVAL_SET_ENV] === SITE_SET_NAME;
const REPEAT = Number(process.env[EVAL_REPEAT_ENV] ?? '1');
const RESULT_FILE = process.env['MYBROWSER_EVAL_RESULT_FILE'];
const OUT_DIR = process.env['MYBROWSER_EVAL_OUT_DIR'];
/** run 1건의 입력 토큰 상한 — 넘으면 앱이 run 을 실패로 끝낸다 (FR-1·FR-3) */
const SITE_MAX_INPUT_TOKENS = '1500000';

/** 실제 모델(dev 프로필) + 입력 토큰 상한 — 가짜 모델·게이트웨이는 뺀다 */
const SITE_APP_ENV: TAppEnv = {
  MYBROWSER_FAKE_MODEL: '0',
  MYBROWSER_FAKE_SCENARIO: undefined,
  MYBROWSER_PROFILE: 'dev',
  MYBROWSER_GATEWAY_URL: undefined,
  MYBROWSER_MAX_INPUT_TOKENS: SITE_MAX_INPUT_TOKENS,
};

const runList = isSiteSet
  ? SITE_SCENARIO_LIST.flatMap((scenario) => Array.from({ length: REPEAT }, (_, index) => ({ scenario, n: index + 1 })))
  : [];

test.describe('실제 사이트', () => {
  test.use({ appEnv: SITE_APP_ENV, allowExternalRequests: true });

  for (const { scenario, n } of runList) {
    test(`${scenario.id}-${String(n)}: ${scenario.task}`, async ({ launchApp, errorList }) => {
      const result = await runSiteScenario({ scenario, n, launchApp, errorList });
      if (RESULT_FILE) appendFileSync(RESULT_FILE, `${JSON.stringify(result)}\n`);
    });
  }
});

interface IRunSiteInput {
  scenario: ISiteScenario;
  n: number;
  launchApp: (options: { userDataDir: string }) => Promise<{ app: ElectronApplication; win: Page }>;
  errorList: string[];
}

/** 화면 쪽에서 관찰한 값 */
interface IScreenObserved {
  approvals: number;
  endUrl: string | null;
  error: string | undefined;
}

/** 앱 1회 실행 → 끝까지 진행(승인 거부) → 끝 화면·URL → 닫고 DB 에서 지표·단계 로그. 오류도 결과 1줄로 남긴다 */
async function runSiteScenario({ scenario, n, launchApp, errorList }: IRunSiteInput): Promise<TSiteResult> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mybrowser-eval-site-'));
  const observed = await driveSiteScenario({ scenario, n, launchApp, userDataDir });
  const error = observed.error ?? (errorList.length > 0 ? errorList.join(' / ').slice(0, 500) : undefined);
  const result = collectSiteResult({ scenario, n, userDataDir, observed: { ...observed, error } });
  rmSync(userDataDir, { recursive: true, force: true });
  return result;
}

/** 앱을 띄워 할 일을 끝까지 진행하고 화면 쪽 관찰값을 돌려준다 — 앱은 여기서 닫는다 */
async function driveSiteScenario({
  scenario,
  n,
  launchApp,
  userDataDir,
}: Omit<IRunSiteInput, 'errorList'> & { userDataDir: string }): Promise<IScreenObserved> {
  let app: ElectronApplication | undefined;
  const observed: IScreenObserved = { approvals: 0, endUrl: null, error: undefined };
  try {
    const launched = await launchApp({ userDataDir });
    app = launched.app;
    await openSiteInActiveTab(app, launched.win, scenario.startUrl);
    await runTask(launched.win, scenario.task);
    observed.approvals = await driveUntilEnd(launched.win, { approvalAnswer: SITE_APPROVAL_ANSWER });
    observed.endUrl = await getAddressBarUrl(launched.win);
    if (OUT_DIR) await captureTab(app, observed.endUrl, join(OUT_DIR, `${scenario.id}-${String(n)}.png`));
  } catch (caught) {
    observed.error = caught instanceof Error ? (caught.message.split('\n')[0] ?? '') : String(caught);
  } finally {
    await app?.close();
  }
  return observed;
}

/** DB 지표·단계 로그를 읽어 결과 줄을 만들고, 단계 로그 파일을 남긴다 */
function collectSiteResult({
  scenario,
  n,
  userDataDir,
  observed,
}: {
  scenario: ISiteScenario;
  n: number;
  userDataDir: string;
  observed: IScreenObserved;
}): TSiteResult {
  const dbPath = join(userDataDir, DB_FILE_NAME);
  const hasDb = existsSync(dbPath);
  const metrics = hasDb ? readRunMetrics(dbPath) : null;
  if (OUT_DIR && hasDb) writeStepLog(join(OUT_DIR, `${scenario.id}-${String(n)}.steps.json`), readStepList(dbPath));
  const status = metrics?.status ?? null;
  const answer = metrics?.answer ?? null;
  const { approvals, endUrl, error } = observed;
  return {
    id: scenario.id,
    n,
    judgement: judgeSiteRun(scenario.judge, { status, answer, endUrl, approvals, ...(error ? { error } : {}) }),
    status,
    answer,
    endUrl,
    toolCalls: metrics?.toolCalls ?? 0,
    approvals,
    inputTokens: metrics?.inputTokens ?? 0,
    outputTokens: metrics?.outputTokens ?? 0,
    durationMs: metrics?.durationMs ?? null,
    ...(error ? { error } : {}),
  };
}

function writeStepLog(path: string, stepList: unknown[]): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(stepList, null, 2)}\n`);
}
