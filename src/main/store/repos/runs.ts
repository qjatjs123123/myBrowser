import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';

import {
  RunStatusSchema,
  StepStatusSchema,
  type IRunCreate,
  type IRunPatch,
  type IRunStore,
  type TRunRecord,
  type TStepRecord,
  type TStepUpsert,
} from '@shared/agent/run';

type TRow = Record<string, SQLOutputValue>;

const REDACTED_TEXT = '[입력값 생략]';

const SQL = {
  insertRun: `INSERT INTO runs (id, task, status, created_at) VALUES (?, ?, ?, ?)`,
  updateRun: `UPDATE runs SET
      status = COALESCE(?, status), summary = COALESCE(?, summary), reason = COALESCE(?, reason),
      ended_at = COALESCE(?, ended_at), usage_json = COALESCE(?, usage_json)
    WHERE id = ?`,
  upsertStep: `INSERT INTO steps (run_id, n, tool, input_json, result_text, status, summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (run_id, n) DO UPDATE SET
      tool = excluded.tool, input_json = excluded.input_json,
      result_text = COALESCE(excluded.result_text, steps.result_text),
      status = excluded.status, summary = excluded.summary`,
  selectRun: `SELECT id, task, status, summary, reason, created_at, ended_at FROM runs WHERE id = ?`,
  selectStepList: `SELECT n, tool, summary, status, input_json, result_text, created_at
    FROM steps WHERE run_id = ? ORDER BY n ASC`,
} as const;

/**
 * [저장] runs·steps 저장소 — agent 의 `IRunStore` 를 node:sqlite prepared statement 로 구현한다.
 * statement 는 생성 시 1회 준비하고, SQL 은 이 파일 안에만 둔다.
 */
export function createRunRepo(db: DatabaseSync): IRunStore {
  const insertRun = db.prepare(SQL.insertRun);
  const updateRun = db.prepare(SQL.updateRun);
  const upsertStep = db.prepare(SQL.upsertStep);
  const selectRun = db.prepare(SQL.selectRun);
  const selectStepList = db.prepare(SQL.selectStepList);
  return {
    createRun: (run: IRunCreate) => {
      insertRun.run(run.id, run.task, run.status, run.createdAt);
    },
    updateRun: (id: string, patch: IRunPatch) => {
      updateRun.run(...toPatchParamList(patch), id);
    },
    upsertStep: (runId: string, step: TStepUpsert) => {
      upsertStep.run(...toStepParamList(runId, step));
    },
    getRun: (id: string) => {
      const row = selectRun.get(id);
      return row ? toRunRecord(row) : null;
    },
    listSteps: (runId: string) => selectStepList.all(runId).map(toStepRecord),
  };
}

/** 패치에서 빠진 필드는 null — SQL 의 COALESCE 가 기존 값을 유지한다 */
function toPatchParamList(patch: IRunPatch): (string | null)[] {
  return [
    patch.status ?? null,
    patch.summary ?? null,
    patch.reason ?? null,
    patch.endedAt ?? null,
    patch.usageJson ?? null,
  ];
}

/** steps INSERT 인자 순서대로 — type_text 입력값은 저장 직전에 한 번 더 지운다 (SR-2·SR-6) */
function toStepParamList(runId: string, step: TStepUpsert): (string | number | null)[] {
  return [
    runId,
    step.n,
    step.tool,
    toStoredInputJson(step.tool, step.inputJson),
    step.resultText ?? null,
    step.status,
    step.summary,
    step.createdAt,
  ];
}

/** type_text 의 text 를 `[입력값 생략]` 으로 — 파싱할 수 없는 입력은 통째로 생략한다 */
function toStoredInputJson(tool: string, inputJson: string): string {
  if (tool !== 'type_text') return inputJson;
  try {
    const input: unknown = JSON.parse(inputJson);
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return JSON.stringify({ text: REDACTED_TEXT });
    }
    return JSON.stringify({ ...input, text: REDACTED_TEXT });
  } catch {
    return JSON.stringify({ text: REDACTED_TEXT });
  }
}

function toRunRecord(row: TRow): TRunRecord {
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

function toStepRecord(row: TRow): TStepRecord {
  return {
    n: Number(row['n']),
    tool: toText(row['tool']),
    summary: toText(row['summary']),
    status: StepStatusSchema.parse(row['status']),
    inputJson: toText(row['input_json']),
    resultText: toNullableText(row['result_text']),
    createdAt: toText(row['created_at']),
  };
}

function toText(value: SQLOutputValue | undefined): string {
  if (typeof value !== 'string') throw new Error('저장된 값이 문자열이 아닙니다');
  return value;
}

function toNullableText(value: SQLOutputValue | undefined): string | null {
  return value === null || value === undefined ? null : toText(value);
}
