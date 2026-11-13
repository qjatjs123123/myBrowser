/**
 * [평가 세트] 결과 수집·보고 (spec 005 FR-8) — 앱을 닫은 뒤 `{userData}/mybrowser.db` 를 읽어 지표를 만들고,
 * 시나리오별 결과를 마크다운 표·JSON 으로 낸다. 새 IPC 없이 sqlite 를 직접 읽는다 (spec 005 「결정 사항」).
 *
 * `eval/cli.mjs` 가 Node type stripping 으로 이 파일을 그대로 불러 쓴다 — 지울 수 있는 TS 문법만 쓰고,
 * 경로 alias(@shared 등)·확장자 없는 로컬 import 를 쓰지 않는다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { z } from 'zod';

/** DB 파일 이름 — 기준: src/main/index.ts 의 `userData/mybrowser.db` */
export const DB_FILE_NAME = 'mybrowser.db';

/**
 * 읽는 컬럼 — 기준: src/main/store/migrations/001_runs_steps.sql, src/main/store/repos/runs.ts.
 * usage_json 은 agent/service.ts 가 쓰는 `{ inputTokens, outputTokens }`.
 */
const SQL = {
  selectLastRun: `SELECT id, status, summary, reason, usage_json, created_at, ended_at FROM runs ORDER BY created_at DESC LIMIT 1`,
  countSteps: `SELECT COUNT(*) AS count FROM steps WHERE run_id = ?`,
  selectSteps: `SELECT n, tool, status, summary FROM steps WHERE run_id = ? ORDER BY n`,
} as const;

const UsageSchema = z.object({ inputTokens: z.number(), outputTokens: z.number() });

/** 기대 결과 — 승인 수·도구 호출 수는 주면 검사한다 */
export const EvalExpectSchema = z.strictObject({
  status: z.string(),
  maxToolCalls: z.number().int().optional(),
  approvals: z.number().int().optional(),
});

/** 시나리오 1개의 결과 — status 가 null 이면 run 기록을 못 읽음(실행 오류) */
export const EvalResultSchema = z.strictObject({
  id: z.string(),
  expect: EvalExpectSchema,
  status: z.string().nullable(),
  toolCalls: z.number().int(),
  approvals: z.number().int(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  durationMs: z.number().nullable(),
  error: z.string().optional(),
});

export type TEvalExpect = z.infer<typeof EvalExpectSchema>;
export type TEvalResult = z.infer<typeof EvalResultSchema>;

/** DB 에서 읽은 run 1건의 지표 */
export interface IRunMetrics {
  status: string;
  /** 끝난 답 — 완료면 summary, 실패면 reason (spec 020 FR-4) */
  answer: string | null;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number | null;
}

/** 마지막 run 의 지표를 읽는다 — 평가는 앱 1회 실행 = run 1건. run 이 없으면 null */
export function readRunMetrics(dbPath: string): IRunMetrics | null {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const run = db.prepare(SQL.selectLastRun).get();
    if (!run) return null;
    const stepRow = db.prepare(SQL.countSteps).get(String(run['id']));
    const usage = parseUsage(run['usage_json']);
    return {
      status: String(run['status']),
      answer: toNullableText(run['summary']) ?? toNullableText(run['reason']),
      toolCalls: Number(stepRow?.['count'] ?? 0),
      ...usage,
      durationMs: getDurationMs(run['created_at'], run['ended_at']),
    };
  } finally {
    db.close();
  }
}

function toNullableText(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** 단계 로그 1줄 (spec 020 FR-4 — `{id}-{n}.steps.json`) */
export interface IStepLog {
  n: number;
  tool: string;
  status: string;
  summary: string;
}

/** 마지막 run 의 단계 목록 — run 이 없으면 빈 목록 */
export function readStepList(dbPath: string): IStepLog[] {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const run = db.prepare(SQL.selectLastRun).get();
    if (!run) return [];
    return db
      .prepare(SQL.selectSteps)
      .all(String(run['id']))
      .map((row) => ({
        n: Number(row['n']),
        tool: String(row['tool']),
        status: String(row['status']),
        summary: String(row['summary']),
      }));
  } finally {
    db.close();
  }
}

function parseUsage(value: unknown): { inputTokens: number; outputTokens: number } {
  if (typeof value !== 'string') return { inputTokens: 0, outputTokens: 0 };
  const parsed = UsageSchema.safeParse(JSON.parse(value));
  return parsed.success ? parsed.data : { inputTokens: 0, outputTokens: 0 };
}

function getDurationMs(createdAt: unknown, endedAt: unknown): number | null {
  if (typeof createdAt !== 'string' || typeof endedAt !== 'string') return null;
  return Date.parse(endedAt) - Date.parse(createdAt);
}

/** 기대와 같으면 true — 상태 일치 + 도구 호출 상한 + 승인 수 */
export function isPassed(result: TEvalResult): boolean {
  const { expect } = result;
  if (result.error !== undefined || result.status !== expect.status) return false;
  if (expect.maxToolCalls !== undefined && result.toolCalls > expect.maxToolCalls) return false;
  return expect.approvals === undefined || result.approvals === expect.approvals;
}

/** 결과가 없거나 하나라도 기대와 다르면 1 */
export function getExitCode(resultList: TEvalResult[]): 0 | 1 {
  return resultList.length > 0 && resultList.every(isPassed) ? 0 : 1;
}

const TABLE_HEADER = [
  '| 시나리오 | 성공 | 최종 상태 | 도구 호출 수 | 승인 대기 수 | 입력/출력 토큰 | 걸린 시간 |',
  '|---|---|---|---|---|---|---|',
];

/** 결과 → 마크다운 표 (stdout 용) */
export function convertToMarkdown(resultList: TEvalResult[]): string {
  return [...TABLE_HEADER, ...resultList.map(toTableRow)].join('\n');
}

function toTableRow(result: TEvalResult): string {
  const cellList = [
    result.id,
    isPassed(result) ? '✅' : '❌',
    result.error ? `${result.status ?? '오류'} (${result.error})` : (result.status ?? '오류'),
    String(result.toolCalls),
    String(result.approvals),
    `${String(result.inputTokens)}/${String(result.outputTokens)}`,
    result.durationMs === null ? '-' : `${(result.durationMs / 1000).toFixed(1)}s`,
  ];
  return `| ${cellList.map((cell) => cell.replaceAll('|', '\\|')).join(' | ')} |`;
}

/** 결과 JSON 본문 */
export function convertToReportJson({
  resultList,
  isReal,
  createdAt,
  firstScreenshot,
}: {
  resultList: TEvalResult[];
  isReal: boolean;
  createdAt: Date;
  /** 첫 화면 캡처 첨부를 켰는가 (spec 022 FR-5) — 주면 기록한다 */
  firstScreenshot?: boolean;
}) {
  return {
    createdAt: createdAt.toISOString(),
    mode: isReal ? 'real' : 'fake',
    ...(firstScreenshot === undefined ? {} : { firstScreenshot }),
    exitCode: getExitCode(resultList),
    resultList: resultList.map((result) => ({ ...result, isPassed: isPassed(result) })),
  };
}

/** 결과 디렉터리 이름 — 로컬 시각 `YYYYMMDD-HHmmss` (spec 020 FR-4: 실행 1번 = 디렉터리 1개) */
export function getResultDirName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${String(date.getFullYear())}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `${day}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** 보고 파일 이름 — 결과 디렉터리 안 */
export const REPORT_FILE_NAME = 'report.json';

/** 결과 JSON 을 `{dir}/report.json` 에 쓰고 경로를 돌려준다 — dir 은 cli.mjs 가 실행 전에 만든 결과 디렉터리 */
export function writeReportJson({
  dir,
  resultList,
  isReal,
  createdAt,
  firstScreenshot,
}: {
  dir: string;
  resultList: TEvalResult[];
  isReal: boolean;
  createdAt: Date;
  firstScreenshot?: boolean;
}): string {
  return writeJson(dir, convertToReportJson({ resultList, isReal, createdAt, firstScreenshot }));
}

/** `{dir}/report.json` 에 JSON 을 쓴다 */
function writeJson(dir: string, body: unknown): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, REPORT_FILE_NAME);
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
  return path;
}

/** 실제 사이트 세트의 보고 JSON 을 `{dir}/report.json` 에 쓴다 (spec 020 FR-4·FR-6) — summary 는 siteJudge 의 집계 */
export function writeSiteReportJson({
  dir,
  resultList,
  summary,
  exitCode,
  createdAt,
  firstScreenshot,
}: {
  dir: string;
  resultList: unknown[];
  summary: unknown;
  exitCode: 0 | 1;
  createdAt: Date;
  /** 첫 화면 캡처 첨부를 켰는가 (spec 022 FR-5) — 주면 기록한다 */
  firstScreenshot?: boolean;
}): string {
  return writeJson(dir, {
    createdAt: createdAt.toISOString(),
    mode: 'real',
    set: 'sites',
    ...(firstScreenshot === undefined ? {} : { firstScreenshot }),
    exitCode,
    summary,
    resultList,
  });
}

/** 실제 사이트 세트 종료 코드 — 결과 줄이 시나리오 수 × 반복만큼 다 있으면 0 (판정과 무관, spec 020 FR-3) */
export function getSiteExitCode({
  lineCount,
  scenarioCount,
  repeat,
}: {
  lineCount: number;
  scenarioCount: number;
  repeat: number;
}): 0 | 1 {
  return lineCount === scenarioCount * repeat ? 0 : 1;
}

/** 러너가 시나리오마다 한 줄씩 쓴 JSONL → 결과 목록 (형식이 틀린 줄은 버리지 않고 throw) */
export function parseResultLines(text: string): TEvalResult[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => EvalResultSchema.parse(JSON.parse(line)));
}
