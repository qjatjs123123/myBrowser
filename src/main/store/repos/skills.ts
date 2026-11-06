import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';

import {
  SKILL_COUNT_MAX,
  SKILL_ENABLED_BODY_TOTAL_MAX,
  SKILL_MESSAGE,
  type ISkillStore,
  type TSkill,
  type TSkillCreateRequest,
  type TSkillStoreResult,
  type TSkillUpdateRequest,
} from '@shared/ipc/skills';

type TRow = Record<string, SQLOutputValue>;

type TStatement = ReturnType<DatabaseSync['prepare']>;

interface ISkillRepoDeps {
  now: () => Date;
  createId: () => string;
}

interface ISkillStatementMap {
  selectList: TStatement;
  selectById: TStatement;
  selectIdByNameKey: TStatement;
  selectCount: TStatement;
  selectEnabledBodyTotal: TStatement;
  insert: TStatement;
  update: TStatement;
  remove: TStatement;
}

const COLUMN_LIST = 'id, name, description, body, is_enabled, created_at, updated_at';

/** 같은 시각에 만든 스킬도 만든 순서를 지키도록 rowid 로 한 번 더 정렬한다 */
const SQL = {
  selectList: `SELECT ${COLUMN_LIST} FROM skills ORDER BY created_at ASC, rowid ASC`,
  selectById: `SELECT ${COLUMN_LIST} FROM skills WHERE id = ?`,
  selectIdByNameKey: `SELECT id FROM skills WHERE name_key = ?`,
  selectCount: `SELECT COUNT(*) AS count FROM skills`,
  selectEnabledBodyTotal: `SELECT body FROM skills WHERE is_enabled = 1 AND id <> ?`,
  insert: `INSERT INTO skills (id, name, name_key, description, body, is_enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  update: `UPDATE skills SET name = ?, name_key = ?, description = ?, body = ?, is_enabled = ?, updated_at = ?
    WHERE id = ?`,
  remove: `DELETE FROM skills WHERE id = ?`,
} as const;

/**
 * [저장] 스킬 저장소 — `ISkillStore` 를 node:sqlite 로 구현한다 (spec 013).
 * 이름 중복(FR-7)·개수·켜진 본문 합 상한(FR-8)은 트랜잭션 안에서 판정하고, 성공하면 최신 목록을 돌려준다.
 */
export function createSkillRepo(db: DatabaseSync, deps: ISkillRepoDeps): ISkillStore {
  const statementMap = prepareStatementMap(db);
  const list = () => statementMap.selectList.all().map(toSkill);
  const withList = (run: () => TSkillStoreResult | null) =>
    runInTransaction(db, () => run() ?? { ok: true, skillList: list() });
  return {
    list,
    listEnabled: () => list().filter((skill) => skill.isEnabled),
    create: (input) => withList(() => createSkill(statementMap, deps, input)),
    update: (input) => withList(() => updateSkill(statementMap, deps, input)),
    remove: (id) => withList(() => removeSkill(statementMap, id)),
  };
}

function prepareStatementMap(db: DatabaseSync): ISkillStatementMap {
  return {
    selectList: db.prepare(SQL.selectList),
    selectById: db.prepare(SQL.selectById),
    selectIdByNameKey: db.prepare(SQL.selectIdByNameKey),
    selectCount: db.prepare(SQL.selectCount),
    selectEnabledBodyTotal: db.prepare(SQL.selectEnabledBodyTotal),
    insert: db.prepare(SQL.insert),
    update: db.prepare(SQL.update),
    remove: db.prepare(SQL.remove),
  };
}

/** 실패 결과(ok:false)나 예외면 되돌리고, 아니면 커밋한다 */
function runInTransaction(db: DatabaseSync, run: () => TSkillStoreResult): TSkillStoreResult {
  db.exec('BEGIN');
  try {
    const result = run();
    db.exec(result.ok ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** 새 스킬은 켜진 상태로 만든다 — 실패면 결과, 성공이면 null */
function createSkill(
  statementMap: ISkillStatementMap,
  deps: ISkillRepoDeps,
  input: TSkillCreateRequest,
): TSkillStoreResult | null {
  const nameKey = toNameKey(input.name);
  if (statementMap.selectIdByNameKey.get(nameKey)) return toFailure('CONFLICT', SKILL_MESSAGE.duplicateName);
  if (Number(statementMap.selectCount.get()?.['count']) >= SKILL_COUNT_MAX) {
    return toFailure('LIMIT', SKILL_MESSAGE.tooMany);
  }
  if (isOverEnabledTotal(statementMap, '', input.body)) return toFailure('LIMIT', SKILL_MESSAGE.tooLong);
  const nowText = deps.now().toISOString();
  const name = input.name.trim();
  statementMap.insert.run(deps.createId(), name, nameKey, input.description, input.body, nowText, nowText);
  return null;
}

function updateSkill(
  statementMap: ISkillStatementMap,
  deps: ISkillRepoDeps,
  input: TSkillUpdateRequest,
): TSkillStoreResult | null {
  const row = statementMap.selectById.get(input.id);
  if (!row) return toFailure('NOT_FOUND', SKILL_MESSAGE.notFound);
  const next = { ...toSkill(row), ...dropUndefined(input) };
  const nameKey = toNameKey(next.name);
  const ownerId = statementMap.selectIdByNameKey.get(nameKey)?.['id'];
  if (ownerId !== undefined && ownerId !== input.id) return toFailure('CONFLICT', SKILL_MESSAGE.duplicateName);
  if (next.isEnabled && isOverEnabledTotal(statementMap, input.id, next.body)) {
    return toFailure('LIMIT', SKILL_MESSAGE.tooLong);
  }
  const updatedAt = deps.now().toISOString();
  const isEnabled = next.isEnabled ? 1 : 0;
  statementMap.update.run(next.name.trim(), nameKey, next.description, next.body, isEnabled, updatedAt, input.id);
  return null;
}

function removeSkill(statementMap: ISkillStatementMap, id: string): TSkillStoreResult | null {
  const { changes } = statementMap.remove.run(id);
  return Number(changes) === 0 ? toFailure('NOT_FOUND', SKILL_MESSAGE.notFound) : null;
}

/** 자기 자신(excludeId)을 뺀 켜진 본문 합 + 새 본문이 상한을 넘는지 */
function isOverEnabledTotal(statementMap: ISkillStatementMap, excludeId: string, body: string): boolean {
  const otherTotal = statementMap.selectEnabledBodyTotal
    .all(excludeId)
    .reduce((sum, row) => sum + toText(row['body']).length, 0);
  return otherTotal + body.length > SKILL_ENABLED_BODY_TOTAL_MAX;
}

function dropUndefined(input: TSkillUpdateRequest): Partial<TSkill> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

/** FR-7 — 대소문자·앞뒤 공백 무시 */
function toNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function toFailure(code: 'NOT_FOUND' | 'CONFLICT' | 'LIMIT', message: string): TSkillStoreResult {
  return { ok: false, code, message };
}

function toSkill(row: TRow): TSkill {
  return {
    id: toText(row['id']),
    name: toText(row['name']),
    description: toText(row['description']),
    body: toText(row['body']),
    isEnabled: Number(row['is_enabled']) === 1,
    createdAt: toText(row['created_at']),
    updatedAt: toText(row['updated_at']),
  };
}

function toText(value: SQLOutputValue | undefined): string {
  if (typeof value !== 'string') throw new Error('저장된 값이 문자열이 아닙니다');
  return value;
}
