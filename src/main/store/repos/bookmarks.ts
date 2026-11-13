import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';

import {
  BOOKMARK_COUNT_MAX,
  BOOKMARK_MESSAGE,
  type IBookmarkStore,
  type TBookmark,
  type TBookmarkAddRequest,
  type TBookmarkStoreResult,
} from '@shared/ipc/bookmarks';

type TRow = Record<string, SQLOutputValue>;

interface IBookmarkRepoDeps {
  now: () => Date;
  createId: () => string;
  /** 테스트에서 줄이는 상한 — 기본 BOOKMARK_COUNT_MAX */
  countMax?: number;
}

/** 같은 시각에 추가한 북마크도 나중 것이 앞에 오도록 rowid 로 한 번 더 정렬한다 */
const SQL = {
  selectList: `SELECT id, url, title, created_at FROM bookmarks ORDER BY created_at DESC, rowid DESC`,
  selectIdByUrl: `SELECT id FROM bookmarks WHERE url = ?`,
  selectCount: `SELECT COUNT(*) AS count FROM bookmarks`,
  insert: `INSERT INTO bookmarks (id, url, title, created_at) VALUES (?, ?, ?, ?)`,
  updateTitle: `UPDATE bookmarks SET title = ? WHERE url = ?`,
  remove: `DELETE FROM bookmarks WHERE url = ?`,
} as const;

/**
 * [저장] 북마크 저장소 — url 고유, 같은 url 이면 제목만 갱신하고 개수 상한은 새 url 에만 적용한다 (spec 021 FR-2).
 * 모든 변경은 최신 추가 순 전체 목록을 돌려준다.
 */
export function createBookmarkRepo(db: DatabaseSync, deps: IBookmarkRepoDeps): IBookmarkStore {
  const statementMap = prepareStatementMap(db);
  const countMax = deps.countMax ?? BOOKMARK_COUNT_MAX;
  const list = () => statementMap.selectList.all().map(toBookmark);
  return {
    list,
    add: (input) => addBookmark({ statementMap, deps, countMax, input, list }),
    remove: (url) => {
      statementMap.remove.run(url);
      return list();
    },
  };
}

function prepareStatementMap(db: DatabaseSync) {
  return {
    selectList: db.prepare(SQL.selectList),
    selectIdByUrl: db.prepare(SQL.selectIdByUrl),
    selectCount: db.prepare(SQL.selectCount),
    insert: db.prepare(SQL.insert),
    updateTitle: db.prepare(SQL.updateTitle),
    remove: db.prepare(SQL.remove),
  };
}

interface IAddBookmarkArgs {
  statementMap: ReturnType<typeof prepareStatementMap>;
  deps: IBookmarkRepoDeps;
  countMax: number;
  input: TBookmarkAddRequest;
  list: () => TBookmark[];
}

/** 빈 제목은 url 로 저장한다 — 이미 있으면 제목만 바꾼다 */
function addBookmark({ statementMap, deps, countMax, input, list }: IAddBookmarkArgs): TBookmarkStoreResult {
  const title = input.title === '' ? input.url : input.title;
  if (statementMap.selectIdByUrl.get(input.url)) {
    statementMap.updateTitle.run(title, input.url);
    return { ok: true, bookmarkList: list() };
  }
  if (Number(statementMap.selectCount.get()?.['count']) >= countMax) {
    return { ok: false, code: 'LIMIT', message: BOOKMARK_MESSAGE.tooMany };
  }
  statementMap.insert.run(deps.createId(), input.url, title, deps.now().toISOString());
  return { ok: true, bookmarkList: list() };
}

function toBookmark(row: TRow): TBookmark {
  return {
    id: toText(row['id']),
    url: toText(row['url']),
    title: toText(row['title']),
    createdAt: toText(row['created_at']),
  };
}

function toText(value: SQLOutputValue | undefined): string {
  if (typeof value !== 'string') throw new Error('저장된 값이 문자열이 아닙니다');
  return value;
}
