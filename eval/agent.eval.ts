/**
 * [평가 세트] 시나리오마다 실제 앱(_electron)을 띄워 할 일을 실행하고, 승인·질문은 시나리오 지시대로 답한다 (spec 005 FR-8).
 * 결과는 앱을 닫은 뒤 sqlite 에서 읽어 MYBROWSER_EVAL_RESULT_FILE 에 1줄(JSON)씩 붙인다 — 표·JSON 은 eval/cli.mjs 가 만든다.
 * 새 IPC 없이 e2e 픽스처(e2e/fixtures.ts)와 e2e 와 같은 화면 조작만 쓴다. 페이지는 로컬 픽스처만.
 */
import { appendFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ElectronApplication, Locator, Page } from '@playwright/test';

import { expect, test, type TAppEnv } from '../e2e/fixtures';
import { EVAL_REAL_ENV } from './cliArgs';
import { DB_FILE_NAME, isPassed, readRunMetrics, type TEvalResult } from './report';
import { EVAL_SCENARIO_LIST, type IEvalScenario, type TApprovalAnswer } from './scenarios';

const isReal = process.env[EVAL_REAL_ENV] === '1';
const RESULT_FILE = process.env['MYBROWSER_EVAL_RESULT_FILE'];

/** 실제 모델 평가 — 가짜 모델·가짜 시나리오·게이트웨이를 빼서 dev 프로필(사내 GenAI 프록시: ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL)로 띄운다 (spec 007) */
const REAL_APP_ENV: TAppEnv = {
  MYBROWSER_FAKE_MODEL: '0',
  MYBROWSER_FAKE_SCENARIO: undefined,
  MYBROWSER_PROFILE: 'dev',
  MYBROWSER_GATEWAY_URL: undefined,
};

/** 상태 배지의 끝 상태 문구 — src/renderer/sidebar/AgentPanel/StatusBadge.tsx */
const FINAL_LABEL_LIST = ['완료', '실패', '중지됨', '확정 직전 정지'];
const POLL_MS = 200;

for (const scenario of EVAL_SCENARIO_LIST) {
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
    approvals = await driveUntilEnd(launched.win, scenario);
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

function getSidebar(win: Page): Locator {
  return win.getByRole('complementary', { name: '에이전트 사이드바' });
}

/** 주소창으로 활성 탭을 픽스처로 옮기고 탭 제목이 바뀔 때까지 기다린다 (e2e/agent-*.spec.ts 와 같은 순서) */
async function openInActiveTab(win: Page, url: string): Promise<void> {
  const title = await getPageTitle(win, url);
  const addressBar = win.getByRole('combobox', { name: '주소창' });
  await addressBar.click();
  await addressBar.fill(url);
  await expect(addressBar).toHaveValue(url);
  await addressBar.press('Enter');
  await expect(win.getByRole('tab', { name: title })).toBeVisible();
}

/** 픽스처의 <title> — 파일을 바꿔도 따라가게 서버에서 읽는다 */
async function getPageTitle(win: Page, url: string): Promise<string> {
  const response = await win.request.get(url);
  return /<title>([^<]+)<\/title>/.exec(await response.text())?.[1] ?? '';
}

async function runTask(win: Page, task: string): Promise<void> {
  const sidebar = getSidebar(win);
  await sidebar.getByRole('textbox', { name: '할 일' }).fill(task);
  await sidebar.getByRole('button', { name: '작업 실행' }).click();
}

/** 끝 상태가 될 때까지 승인 창·질문 카드에 답한다 — 답한 승인 창 수를 돌려준다 (시간 상한은 테스트 timeout) */
async function driveUntilEnd(win: Page, scenario: IEvalScenario): Promise<number> {
  const sidebar = getSidebar(win);
  const status = sidebar.getByRole('status', { name: '실행 상태' });
  const panel = sidebar.getByRole('alertdialog', { name: '승인 필요' });
  const card = sidebar.getByRole('dialog', { name: '에이전트 질문' });
  let approvals = 0;
  while (!FINAL_LABEL_LIST.includes((await status.textContent())?.trim() ?? '')) {
    if (await panel.isVisible()) {
      await answerApproval(panel, scenario.onApproval ?? 'denied');
      approvals += 1;
    } else if (await card.isVisible()) {
      await answerQuestion(card, scenario.onQuestion);
    } else {
      await win.waitForTimeout(POLL_MS);
    }
  }
  return approvals;
}

/** 가드 승인(세 버튼)과 모델 승인([승인]/[거부])을 구분해 답한다 */
async function answerApproval(panel: Locator, answer: TApprovalAnswer): Promise<void> {
  const isGuard = (await panel.getByRole('button', { name: '에이전트가 누르기' }).count()) > 0;
  if (answer === 'denied') await panel.getByRole('button', { name: '거부' }).click();
  else if (!isGuard) await panel.getByRole('button', { name: '승인' }).click();
  else if (answer === 'agent') await panel.getByRole('button', { name: '에이전트가 누르기' }).click();
  else {
    await panel.getByRole('button', { name: '직접 누를게요' }).click();
    await panel.getByRole('button', { name: '계속' }).click();
  }
  await expect(panel).toBeHidden();
}

/** 지정한 선택지(없으면 첫 선택지)를 누른다 */
async function answerQuestion(card: Locator, option: string | undefined): Promise<void> {
  const button = option ? card.getByRole('button', { name: option }) : card.getByRole('button').first();
  await button.click();
  await expect(card).toBeHidden();
}
