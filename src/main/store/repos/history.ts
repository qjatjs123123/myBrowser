import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';

import { HISTORY_ROW_MAX, type IHistoryStore, type THistoryEntry } from '@shared/ipc/history';

type TRow = Record<string, SQLOutputValue>;

interface IHistoryRepoDeps {
  now: () => Date;
  createId: () => string;
  /** 테스트에서 줄이는 상한 — 기본 HISTORY_ROW_MAX */
  rowMax?: number;
}

const COLUMN_LIST = 'id, url, title, visited_at';

/** LIKE 의 % · _ · \ 를 글자 그대로 찾도록 \ 로 이스케이프한다 */
const SQL = {
  selectLatest: `SELECT id, url FROM history ORDER BY visited_at DESC, rowid DESC LIMIT 1`,
  selectList: `SELECT ${COLUMN_LIST} FROM history
    WHERE lower(title) LIKE ? ESCAPE '\\' OR lower(url) LIKE ? ESCAPE '\\'
    ORDER BY visited_at DESC, rowid DESC LIMIT ?`,
  insert: `INSERT INTO history (id, url, title, visited_at) VALUES (?, ?, ?, ?)`,
  touch: `UPDATE history SET title = ?, visited_at = ? WHERE id = ?`,
  trim: `DELETE FROM history WHERE rowid NOT IN
    (SELECT rowid FROM history ORDER BY visited_at DESC, rowid DESC LIMIT ?)`,
  remove: `DELETE FROM history WHERE id = ?`,
  clear: `DELETE FROM history`,
} as const;

/**
 * [저장] 방문 기록 저장소 — url·제목·시각만 (spec 021 SR-2).
 * 가장 최근 줄과 url 이 같으면(새로 고침) 그 줄을 갱신하고, 상한을 넘으면 오래된 줄부터 지운다 (FR-4).
 */
export function createHistoryRepo(db: DatabaseSync, deps: IHistoryRepoDeps): IHistoryStore {
  const statementMap = prepareStatementMap(db);
  const rowMax = deps.rowMax ?? HISTORY_ROW_MAX;
  return {
    record: (input) => recordVisit({ statementMap, deps, rowMax, input }),
    list: ({ query, limit }) => {
      const pattern = toLikePattern(query);
      return statementMap.selectList.all(pattern, pattern, limit).map(toEntry);
    },
    remove: (id) => Number(statementMap.remove.run(id).changes) > 0,
    clear: () => void statementMap.clear.run(),
  };
}

function prepareStatementMap(db: DatabaseSync) {
  return {
    selectLatest: db.prepare(SQL.selectLatest),
    selectList: db.prepare(SQL.selectList),
    insert: db.prepare(SQL.insert),
    touch: db.prepare(SQL.touch),
    trim: db.prepare(SQL.trim),
    remove: db.prepare(SQL.remove),
    clear: db.prepare(SQL.clear),
  };
}

interface IRecordVisitArgs {
  statementMap: ReturnType<typeof prepareStatementMap>;
  deps: IHistoryRepoDeps;
  rowMax: number;
  input: { url: string; title: string };
}

/** 새로 고침이면 갱신, 아니면 새 줄 + 상한 정리. 빈 제목은 url */
function recordVisit({ statementMap, deps, rowMax, input }: IRecordVisitArgs): void {
  const title = input.title === '' ? input.url : input.title;
  const visitedAt = deps.now().toISOString();
  const latest = statementMap.selectLatest.get();
  if (latest && latest['url'] === input.url) {
    statementMap.touch.run(title, visitedAt, toText(latest['id']));
    return;
  }
  statementMap.insert.run(deps.createId(), input.url, title, visitedAt);
  statementMap.trim.run(rowMax);
}

/** 대소문자 무시 부분 일치 — 빈 검색어는 전부 */
function toLikePattern(query: string): string {
  const escaped = query.toLowerCase().replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

function toEntry(row: TRow): THistoryEntry {
  return {
    id: toText(row['id']),
    url: toText(row['url']),
    title: toText(row['title']),
    visitedAt: toText(row['visited_at']),
  };
}

function toText(value: SQLOutputValue | undefined): string {
  if (typeof value !== 'string') throw new Error('저장된 값이 문자열이 아닙니다');
  return value;
}
