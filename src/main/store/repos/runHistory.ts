import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';

import { RunStatusSchema, StepStatusSchema, type TStep } from '@shared/agent/run';
import type { IRunHistory, TRunGetResponse, TRunSummary } from '@shared/ipc/runs';

type TRow = Record<string, SQLOutputValue>;

/**
 * 조회 전용 SQL — steps 의 input_json·result_text, runs 의 usage_json 은 SELECT 하지 않는다 (spec 012 SR-2).
 * 같은 시각이면 나중에 넣은 행이 먼저 오도록 rowid 로 한 번 더 정렬한다.
 */
const SQL = {
  selectRecentRunList: `SELECT id, task, status, summary, reason, created_at, ended_at
    FROM runs ORDER BY created_at DESC, rowid DESC LIMIT ?`,
  selectRun: `SELECT id, task, status, summary, reason, created_at, ended_at FROM runs WHERE id = ?`,
  selectStepList: `SELECT n, tool, summary, status FROM steps WHERE run_id = ? ORDER BY n ASC`,
} as const;

/**
 * [저장] 실행 기록 조회 저장소 — `IRunHistory` 를 node:sqlite prepared statement 로 구현한다 (spec 012).
 * 읽기만 한다 (SR-1). statement 는 생성 시 1회 준비한다.
 */
export function createRunHistoryRepo(db: DatabaseSync): IRunHistory {
  const selectRecentRunList = db.prepare(SQL.selectRecentRunList);
  const selectRun = db.prepare(SQL.selectRun);
  const selectStepList = db.prepare(SQL.selectStepList);
  return {
    listRecent: (limit: number) => selectRecentRunList.all(limit).map(toRunSummary),
    getDetail: (runId: string): TRunGetResponse | null => {
      const row = selectRun.get(runId);
      if (!row) return null;
      return { run: toRunSummary(row), stepList: selectStepList.all(runId).map(toStep) };
    },
  };
}

function toRunSummary(row: TRow): TRunSummary {
  return {
    id: toText(row['id']),
    task: toText(row['task']),
    status: RunStatusSchema.parse(row['status']),
    summary: toNullableText(row['summary']),
    reason: toNullableText(row['reason']),
    createdAt: toText(row['created_at']),
    endedAt: toNullableText(row['ended_at']),
  };
}

function toStep(row: TRow): TStep {
  return {
    n: Number(row['n']),
    tool: toText(row['tool']),
    summary: toText(row['summary']),
    status: StepStatusSchema.parse(row['status']),
  };
}

function toText(value: SQLOutputValue | undefined): string {
  if (typeof value !== 'string') throw new Error('저장된 값이 문자열이 아닙니다');
  return value;
}

function toNullableText(value: SQLOutputValue | undefined): string | null {
  return value === null || value === undefined ? null : toText(value);
}
