import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { MIGRATION_LIST, openDatabase } from '../db';

let tempDirList: string[] = [];

afterEach(() => {
  for (const dir of tempDirList) rmSync(dir, { recursive: true, force: true });
  tempDirList = [];
});

function createTempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mybrowser-db-'));
  tempDirList.push(dir);
  return join(dir, 'mybrowser.db');
}

describe('openDatabase', () => {
  it('?raw 로 읽은 마이그레이션 SQL 이 비어 있지 않으면 runs 생성문을 담는다', () => {
    expect(MIGRATION_LIST[0]?.sql).toContain('CREATE TABLE runs');
  });

  it(':memory: 로 열면 user_version 이 1 이 된다', () => {
    const db = openDatabase(':memory:');
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 });
    db.close();
  });

  it(':memory: 로 열면 runs·steps 테이블이 생긴다', () => {
    const db = openDatabase(':memory:');
    const tableList = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all()
      .map((row) => row['name']);
    expect(tableList).toEqual(['runs', 'steps']);
    db.close();
  });

  it('외래 키 검사가 켜져 있으면 없는 run 의 step 저장은 실패한다', () => {
    const db = openDatabase(':memory:');
    const insert = db.prepare(
      `INSERT INTO steps (run_id, n, tool, input_json, status, summary, created_at)
       VALUES ('none', 1, 'snapshot', '{}', 'ok', '페이지 읽기', '2026-11-05T00:00:00.000Z')`,
    );
    expect(() => insert.run()).toThrow();
    db.close();
  });

  it('파일 DB 를 열면 WAL 모드가 된다', () => {
    const db = openDatabase(createTempDbPath());
    expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    db.close();
  });

  it('같은 파일을 두 번 열어도 마이그레이션을 재적용하지 않고 데이터가 남는다', () => {
    const path = createTempDbPath();
    const firstDb = openDatabase(path);
    firstDb
      .prepare(`INSERT INTO runs (id, task, status, created_at) VALUES (?, ?, ?, ?)`)
      .run('run-1', '예약해줘', 'done', '2026-11-05T00:00:00.000Z');
    firstDb.close();

    const secondDb = openDatabase(path);
    expect(secondDb.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 });
    expect(secondDb.prepare('SELECT COUNT(*) AS count FROM runs').get()).toEqual({ count: 1 });
    secondDb.close();
  });
});
