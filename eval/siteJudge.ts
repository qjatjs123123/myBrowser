/**
 * [평가 세트] 실제 사이트 세트의 결과 형식·규칙 판정·집계 — 순수 함수 (spec 019 FR-4·FR-5·FR-6).
 * 규칙으로 확실한 것만 `성공`/`실패` 로 가르고, 애매하면 `확인 필요`(사람이 스크린샷·단계 로그로 판정)로 둔다.
 *
 * `eval/cli.mjs` 가 Node type stripping 으로 이 파일을 그대로 불러 쓴다 — 지울 수 있는 TS 문법만 쓰고,
 * 경로 alias(@shared 등)·확장자 없는 로컬 import 를 쓰지 않는다.
 */
import { z } from 'zod';

/** 판정 결과 — 확인 필요 = 상태는 맞지만 낱말·URL·승인 수 중 하나가 안 맞음 */
export const SITE_JUDGEMENT = { success: '성공', review: '확인 필요', fail: '실패' } as const;

export const SiteJudgementSchema = z.enum([SITE_JUDGEMENT.success, SITE_JUDGEMENT.review, SITE_JUDGEMENT.fail]);
export type TSiteJudgement = z.infer<typeof SiteJudgementSchema>;

/** 시나리오의 판정 규칙 (FR-2) */
export interface ISiteJudge {
  /** 허용 끝 상태 (runs.status) — 예: ['done', 'stopped_before_confirm'] */
  statusList: readonly string[];
  /** 답(summary/reason)에 하나라도 들어가야 할 낱말 — 대소문자 무시. 비어 있으면 검사 생략 */
  keywordList: readonly string[];
  /** 끝 URL 이 맞아야 할 패턴 — 없으면 검사 생략 */
  urlPattern?: RegExp;
  /** 최소 승인 창 수 — 없으면 검사 생략 */
  minApprovals?: number;
}

/** 실행 1회에서 관찰한 값 */
export interface ISiteObserved {
  status: string | null;
  answer: string | null;
  endUrl: string | null;
  approvals: number;
  error?: string;
}

/** 실행 1회의 결과 줄 (FR-4) — 러너가 JSONL 로 1줄씩 쓴다 */
export const SiteResultSchema = z.strictObject({
  id: z.string().min(1),
  /** 회차 — 1부터 */
  n: z.number().int().min(1),
  judgement: SiteJudgementSchema,
  status: z.string().nullable(),
  answer: z.string().nullable(),
  endUrl: z.string().nullable(),
  toolCalls: z.number().int().nonnegative(),
  approvals: z.number().int().nonnegative(),
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  durationMs: z.number().nullable(),
  error: z.string().optional(),
});
export type TSiteResult = z.infer<typeof SiteResultSchema>;

/** 규칙 판정 (FR-5) — 상태 불일치·오류면 실패, 나머지가 모두 맞으면 성공, 아니면 확인 필요 */
export function judgeSiteRun(judge: ISiteJudge, observed: ISiteObserved): TSiteJudgement {
  if (observed.error !== undefined) return SITE_JUDGEMENT.fail;
  if (observed.status === null || !judge.statusList.includes(observed.status)) return SITE_JUDGEMENT.fail;
  const isAllMatched = hasKeyword(judge, observed.answer) && isUrlMatched(judge, observed.endUrl);
  const isApprovalsMatched = judge.minApprovals === undefined || observed.approvals >= judge.minApprovals;
  return isAllMatched && isApprovalsMatched ? SITE_JUDGEMENT.success : SITE_JUDGEMENT.review;
}

function hasKeyword(judge: ISiteJudge, answer: string | null): boolean {
  if (judge.keywordList.length === 0) return true;
  const lowered = (answer ?? '').toLowerCase();
  return judge.keywordList.some((keyword) => lowered.includes(keyword.toLowerCase()));
}

function isUrlMatched(judge: ISiteJudge, endUrl: string | null): boolean {
  if (judge.urlPattern === undefined) return true;
  return endUrl !== null && judge.urlPattern.test(endUrl);
}

/** 러너가 쓴 JSONL → 결과 목록 (빈 줄은 건너뛰고, 형식이 틀린 줄은 버리지 않고 throw) */
export function parseSiteResultLines(text: string): TSiteResult[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => SiteResultSchema.parse(JSON.parse(line)));
}

/** 시나리오 1개의 집계 */
export interface ISiteScenarioSummary {
  id: string;
  runs: number;
  success: number;
  review: number;
  fail: number;
  avgToolCalls: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  /** 시간이 있는 회차만 평균 — 하나도 없으면 null */
  avgDurationMs: number | null;
}

/** 전체 집계 (FR-6) */
export interface ISiteSummary {
  scenarioList: ISiteScenarioSummary[];
  total: {
    runs: number;
    success: number;
    review: number;
    fail: number;
    /** 성공 / 전체 회차 (0~1). 회차가 없으면 0 */
    successRate: number;
    inputTokens: number;
    outputTokens: number;
  };
}

/** 결과 목록 → 시나리오별(처음 나온 순서) + 전체 집계 */
export function summarizeSiteResults(resultList: readonly TSiteResult[]): ISiteSummary {
  const idList = [...new Set(resultList.map((result) => result.id))];
  const scenarioList = idList.map((id) =>
    summarizeScenario(
      id,
      resultList.filter((result) => result.id === id),
    ),
  );
  const success = countJudgement(resultList, SITE_JUDGEMENT.success);
  return {
    scenarioList,
    total: {
      runs: resultList.length,
      success,
      review: countJudgement(resultList, SITE_JUDGEMENT.review),
      fail: countJudgement(resultList, SITE_JUDGEMENT.fail),
      successRate: resultList.length === 0 ? 0 : success / resultList.length,
      inputTokens: sumOf(resultList.map((result) => result.inputTokens)),
      outputTokens: sumOf(resultList.map((result) => result.outputTokens)),
    },
  };
}

function summarizeScenario(id: string, resultList: readonly TSiteResult[]): ISiteScenarioSummary {
  const durationList = resultList.flatMap((result) => (result.durationMs === null ? [] : [result.durationMs]));
  return {
    id,
    runs: resultList.length,
    success: countJudgement(resultList, SITE_JUDGEMENT.success),
    review: countJudgement(resultList, SITE_JUDGEMENT.review),
    fail: countJudgement(resultList, SITE_JUDGEMENT.fail),
    avgToolCalls: averageOf(resultList.map((result) => result.toolCalls)) ?? 0,
    avgInputTokens: averageOf(resultList.map((result) => result.inputTokens)) ?? 0,
    avgOutputTokens: averageOf(resultList.map((result) => result.outputTokens)) ?? 0,
    avgDurationMs: averageOf(durationList),
  };
}

function countJudgement(resultList: readonly TSiteResult[], judgement: TSiteJudgement): number {
  return resultList.filter((result) => result.judgement === judgement).length;
}

function sumOf(valueList: readonly number[]): number {
  return valueList.reduce((sum, value) => sum + value, 0);
}

function averageOf(valueList: readonly number[]): number | null {
  return valueList.length === 0 ? null : sumOf(valueList) / valueList.length;
}

const SITE_TABLE_HEADER = [
  '| 시나리오 | 성공/확인 필요/실패 | 평균 도구 호출 수 | 평균 입력/출력 토큰 | 평균 시간 |',
  '|---|---|---|---|---|',
];

/** 집계 → 마크다운 표 + 전체 성공률·합계 토큰 줄 (stdout 용) */
export function convertSiteToMarkdown(summary: ISiteSummary): string {
  const { total } = summary;
  const totalLine = [
    `전체 성공률: ${(total.successRate * 100).toFixed(1)}% (${String(total.success)}/${String(total.runs)})`,
    `확인 필요 ${String(total.review)} · 실패 ${String(total.fail)}`,
    `합계 토큰 입력/출력: ${String(total.inputTokens)}/${String(total.outputTokens)}`,
  ].join(' · ');
  return [...SITE_TABLE_HEADER, ...summary.scenarioList.map(toSiteTableRow), '', totalLine].join('\n');
}

function toSiteTableRow(scenario: ISiteScenarioSummary): string {
  const cellList = [
    scenario.id,
    `${String(scenario.success)}/${String(scenario.review)}/${String(scenario.fail)}`,
    scenario.avgToolCalls.toFixed(1),
    `${String(Math.round(scenario.avgInputTokens))}/${String(Math.round(scenario.avgOutputTokens))}`,
    scenario.avgDurationMs === null ? '-' : `${(scenario.avgDurationMs / 1000).toFixed(1)}s`,
  ];
  return `| ${cellList.map((cell) => cell.replaceAll('|', '\\|')).join(' | ')} |`;
}
