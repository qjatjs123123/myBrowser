import { DatabaseSync } from 'node:sqlite';

import sql001 from './migrations/001_runs_steps.sql?raw';
import sql002 from './migrations/002_skills.sql?raw';
import sql003 from './migrations/003_bookmarks_history.sql?raw';

interface IMigration {
  version: number;
  sql: string;
}

/** 버전 오름차순 — 새 마이그레이션은 맨 끝에 추가한다 */
export const MIGRATION_LIST: readonly IMigration[] = [
  { version: 1, sql: sql001 },
  { version: 2, sql: sql002 },
  { version: 3, sql: sql003 },
];

function readUserVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get();
  const version = row?.['user_version'];
  return typeof version === 'number' ? version : 0;
}

/** user_version 보다 큰 마이그레이션을 하나씩 트랜잭션으로 적용 — 실패하면 그 버전만 되돌리고 throw */
function applyMigrationList(db: DatabaseSync, migrationList: readonly IMigration[]): void {
  const currentVersion = readUserVersion(db);
  for (const migration of migrationList) {
    if (migration.version <= currentVersion) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${String(migration.version)}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

/**
 * [저장] 실행 기록 DB 열기 — WAL·외래 키 켜고 마이그레이션까지 적용한 `DatabaseSync` 를 돌려준다.
 * 경로는 조립 코드가 `userData/mybrowser.db` 로 준다. 테스트는 `':memory:'`.
 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  applyMigrationList(db, MIGRATION_LIST);
  return db;
}
