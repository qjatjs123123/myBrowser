/**
 * [평가 세트] `pnpm eval` 진입점 — 인자 해석(cliArgs.ts) → playwright 평가 프로젝트 실행 → 결과 표·JSON (spec 005 FR-8).
 * .ts 는 Node 의 type stripping 으로 그대로 불러 쓴다. 로직은 cliArgs.ts·report.ts 에 두고 여기는 연결만 한다.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveEvalCommand } from './cliArgs.ts';
import { convertToMarkdown, getExitCode, parseResultLines, writeReportJson } from './report.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RESULT_DIR = join(ROOT, 'eval', 'results');
/** 러너가 시나리오마다 결과 1줄을 붙여 쓰는 파일 — eval/agent.eval.ts 가 읽는다 */
const RESULT_FILE_ENV = 'MYBROWSER_EVAL_RESULT_FILE';

const command = resolveEvalCommand({
  argList: process.argv.slice(2),
  hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY) || existsSync(join(ROOT, '.env')),
});
if (command.kind === 'exit') {
  console.error(command.message);
  process.exit(command.code);
}

const workDir = mkdtempSync(join(tmpdir(), 'mybrowser-eval-'));
const resultFile = join(workDir, 'results.jsonl');
const playwrightCli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const child = spawnSync(
  process.execPath,
  [playwrightCli, 'test', '-c', 'playwright.eval.config.ts', ...command.playwrightArgList],
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...command.env, [RESULT_FILE_ENV]: resultFile } },
);

const resultList = existsSync(resultFile) ? parseResultLines(readFileSync(resultFile, 'utf8')) : [];
rmSync(workDir, { recursive: true, force: true });
const reportPath = writeReportJson({ dir: RESULT_DIR, resultList, isReal: command.isReal, createdAt: new Date() });
process.stdout.write(`\n${convertToMarkdown(resultList)}\n\n결과: ${reportPath}\n`);
process.exit(Math.max(child.status ?? 1, getExitCode(resultList)));
