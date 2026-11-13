/**
 * [평가 세트] `pnpm eval` 진입점 — 인자 해석(cliArgs.ts) → playwright 평가 프로젝트 실행 → 결과 표·JSON (spec 005 FR-8, spec 020).
 * .ts 는 Node 의 type stripping 으로 그대로 불러 쓴다. 로직은 cliArgs.ts·report.ts·siteJudge.ts 에 두고 여기는 연결만 한다.
 *
 * 사용법:
 *   pnpm eval                                          로컬 픽스처 7개, 가짜 모델 (비용 없음)
 *   pnpm eval -- --real --yes-spend                    같은 픽스처를 실제 모델(dev 프로필)로 (비용 발생)
 *   pnpm eval -- --real --yes-spend --set sites        실제 사이트 세트 (spec 020, 비용 발생) — 시나리오당 3회
 *   pnpm eval -- --real --yes-spend --set sites --repeat 1 --grep naver   반복·시나리오 고르기
 * 결과: eval/results/{YYYYMMDD-HHmmss}/report.json (sites 세트는 + {id}-{n}.png 끝 화면, {id}-{n}.steps.json 단계 로그).
 * `--real` 이면 .env 의 ANTHROPIC_API_KEY·ANTHROPIC_BASE_URL 두 키만, 셸에 없을 때 앱에 넘긴다 (FR-8 — 값은 출력하지 않는다).
 * 실제 사이트 세트의 승인 창은 모두 [거부] 로 답한다 — 실제 예약·결제·주문은 일어나지 않는다 (SR-1).
 * 첫 화면 캡처 첨부(spec 022)는 기본 켬 — 끈 쪽과 비교하려면 `MYBROWSER_FIRST_SCREENSHOT=0 pnpm eval -- ...`. report.json 의 firstScreenshot 에 기록된다.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import { EVAL_REPEAT_ENV, EVAL_SET_ENV, pickModelEnv, resolveEvalCommand, SITE_SET_NAME } from './cliArgs.ts';
import {
  convertToMarkdown,
  getExitCode,
  getResultDirName,
  getSiteExitCode,
  parseResultLines,
  writeReportJson,
  writeSiteReportJson,
} from './report.ts';
import { convertSiteToMarkdown, parseSiteResultLines, summarizeSiteResults } from './siteJudge.ts';
import { SITE_SCENARIO_LIST } from './siteScenarios.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RESULT_ROOT = join(ROOT, 'eval', 'results');
const DOT_ENV_PATH = join(ROOT, '.env');
/** 러너가 시나리오마다 결과 1줄을 붙여 쓰는 파일 — eval/*.eval.ts 가 읽는다 */
const RESULT_FILE_ENV = 'MYBROWSER_EVAL_RESULT_FILE';
/** 러너가 스크린샷·단계 로그를 쓰는 결과 디렉터리 (spec 020 FR-4) */
const OUT_DIR_ENV = 'MYBROWSER_EVAL_OUT_DIR';
/** 평가 앱은 셸 env 를 물려받는다 — 첫 화면 캡처 켬/끔을 결과에 남긴다 (spec 022 FR-5) */
const isFirstScreenshot = process.env.MYBROWSER_FIRST_SCREENSHOT !== '0';

const command = resolveEvalCommand({
  argList: process.argv.slice(2),
  hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY) || existsSync(DOT_ENV_PATH),
});
if (command.kind === 'exit') {
  console.error(command.message);
  process.exit(command.code);
}

const createdAt = new Date();
const outDir = join(RESULT_ROOT, getResultDirName(createdAt));
mkdirSync(outDir, { recursive: true });
const modelEnv = command.isReal && existsSync(DOT_ENV_PATH) ? readModelEnv() : {};

const workDir = mkdtempSync(join(tmpdir(), 'mybrowser-eval-'));
const resultFile = join(workDir, 'results.jsonl');
const playwrightCli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const child = spawnSync(
  process.execPath,
  [playwrightCli, 'test', '-c', 'playwright.eval.config.ts', ...command.playwrightArgList],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...modelEnv, ...command.env, [RESULT_FILE_ENV]: resultFile, [OUT_DIR_ENV]: outDir },
  },
);

const resultText = existsSync(resultFile) ? readFileSync(resultFile, 'utf8') : '';
rmSync(workDir, { recursive: true, force: true });
const isSiteSet = command.env[EVAL_SET_ENV] === SITE_SET_NAME;
process.exit(isSiteSet ? reportSites(resultText) : reportFixtures(resultText, child.status));

/** .env 에서 모델 접속 키 2개만 고른다 — 셸 값 우선 (FR-8) */
function readModelEnv() {
  return pickModelEnv({ dotEnv: parseEnv(readFileSync(DOT_ENV_PATH, 'utf8')), processEnv: process.env });
}

/** 픽스처 세트 보고 — 기존 표 + report.json, 종료 코드는 playwright 와 기대 판정 중 나쁜 쪽 */
function reportFixtures(text, childStatus) {
  const resultList = parseResultLines(text);
  const reportPath = writeReportJson({
    dir: outDir,
    resultList,
    isReal: command.isReal,
    createdAt,
    firstScreenshot: isFirstScreenshot,
  });
  process.stdout.write(`\n${convertToMarkdown(resultList)}\n\n결과: ${reportPath}\n`);
  return Math.max(childStatus ?? 1, getExitCode(resultList));
}

/** 실제 사이트 세트 보고 — 집계 표 + report.json, 종료 코드는 결과 줄이 다 있는지만 본다 (FR-3) */
function reportSites(text) {
  const resultList = parseSiteResultLines(text);
  const summary = summarizeSiteResults(resultList);
  const exitCode = getSiteExitCode({
    lineCount: resultList.length,
    scenarioCount: SITE_SCENARIO_LIST.length,
    repeat: Number(command.env[EVAL_REPEAT_ENV]),
  });
  const reportPath = writeSiteReportJson({
    dir: outDir,
    resultList,
    summary,
    exitCode,
    createdAt,
    firstScreenshot: isFirstScreenshot,
  });
  process.stdout.write(
    `\n${convertSiteToMarkdown(summary)}\n첫 화면 캡처: ${isFirstScreenshot ? '켬' : '끔'}\n\n결과: ${reportPath}\n`,
  );
  return exitCode;
}
