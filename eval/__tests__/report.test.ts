import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase } from '@main/store/db';
import { createRunRepo } from '@main/store/repos/runs';

import {
  convertToMarkdown,
  getExitCode,
  getResultFileName,
  isPassed,
  parseResultLines,
  readRunMetrics,
  writeReportJson,
  type TEvalResult,
} from '../report';

function createResult(overrides: Partial<TEvalResult> = {}): TEvalResult {
  return {
    id: 'search-read',
    expect: { status: 'done', maxToolCalls: 3, approvals: 0 },
    status: 'done',
    toolCalls: 3,
    approvals: 0,
    inputTokens: 40,
    outputTokens: 40,
    durationMs: 1500,
    ...overrides,
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'eval-report-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('isPassed', () => {
  it('상태·도구 호출 상한·승인 수가 기대와 같으면 성공이다', () => {
    expect(isPassed(createResult())).toBe(true);
  });

  it('최종 상태가 다르면 실패다', () => {
    expect(isPassed(createResult({ status: 'failed' }))).toBe(false);
  });

  it('도구 호출 수가 상한을 넘으면 실패다', () => {
    expect(isPassed(createResult({ toolCalls: 4 }))).toBe(false);
  });

  it('승인 수가 다르면 실패다', () => {
    expect(isPassed(createResult({ approvals: 1 }))).toBe(false);
  });

  it('실행 오류가 있으면 상태가 같아도 실패다', () => {
    expect(isPassed(createResult({ error: '시간 초과' }))).toBe(false);
  });
});

describe('getExitCode', () => {
  it('모두 성공이면 0 이다', () => {
    expect(getExitCode([createResult(), createResult({ id: 'b' })])).toBe(0);
  });

  it('하나라도 실패면 1 이다', () => {
    expect(getExitCode([createResult(), createResult({ status: 'stopped' })])).toBe(1);
  });

  it('결과가 없으면 1 이다', () => {
    expect(getExitCode([])).toBe(1);
  });
});

describe('convertToMarkdown', () => {
  it('시나리오마다 성공·상태·도구 호출·승인·토큰·시간 열을 가진 표를 만든다', () => {
    const lineList = convertToMarkdown([createResult(), createResult({ id: 'x', status: null, error: 'a|b' })]).split(
      '\n',
    );
    expect(lineList[0]).toBe(
      '| 시나리오 | 성공 | 최종 상태 | 도구 호출 수 | 승인 대기 수 | 입력/출력 토큰 | 걸린 시간 |',
    );
    expect(lineList[2]).toBe('| search-read | ✅ | done | 3 | 0 | 40/40 | 1.5s |');
    expect(lineList[3]).toBe('| x | ❌ | 오류 (a\\|b) | 3 | 0 | 40/40 | 1.5s |');
  });
});

describe('writeReportJson', () => {
  it('YYYYMMDD-HHmmss.json 에 결과·모드·종료 코드를 쓴다', () => {
    const createdAt = new Date(2026, 10, 5, 9, 3, 7);
    const path = writeReportJson({ dir, resultList: [createResult()], isReal: false, createdAt });
    expect(path).toBe(join(dir, '20261105-090307.json'));
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
      mode: 'fake',
      exitCode: 0,
      resultList: [{ id: 'search-read', isPassed: true }],
    });
  });

  it('파일 이름은 두 자리로 채운다', () => {
    expect(getResultFileName(new Date(2026, 0, 2, 3, 4, 5))).toBe('20260102-030405.json');
  });
});

describe('parseResultLines', () => {
  it('JSONL 한 줄씩 결과로 읽고 빈 줄은 건너뛴다', () => {
    const text = `${JSON.stringify(createResult())}\n\n${JSON.stringify(createResult({ id: 'b' }))}\n`;
    expect(parseResultLines(text).map((result) => result.id)).toEqual(['search-read', 'b']);
  });

  it('형식이 틀린 줄이면 throw 한다', () => {
    expect(() => parseResultLines('{"id":1}')).toThrow();
  });
});

describe('readRunMetrics', () => {
  it('앱 저장소가 쓴 run 의 상태·step 수·usage·걸린 시간을 읽는다', () => {
    const dbPath = join(dir, 'mybrowser.db');
    const db = openDatabase(dbPath);
    const repo = createRunRepo(db);
    repo.createRun({ id: 'r1', task: 't', status: 'queued', createdAt: '2026-11-05T10:00:00.000Z' });
    for (const n of [1, 2]) {
      repo.upsertStep('r1', { n, tool: 'snapshot', summary: 's', status: 'ok', inputJson: '{}', createdAt: 'x' });
    }
    repo.updateRun('r1', {
      status: 'done',
      endedAt: '2026-11-05T10:00:02.500Z',
      usageJson: JSON.stringify({ inputTokens: 30, outputTokens: 20 }),
    });
    db.close();

    expect(readRunMetrics(dbPath)).toEqual({
      status: 'done',
      toolCalls: 2,
      inputTokens: 30,
      outputTokens: 20,
      durationMs: 2500,
    });
  });

  it('run 이 없으면 null 이다', () => {
    const dbPath = join(dir, 'empty.db');
    openDatabase(dbPath).close();
    expect(readRunMetrics(dbPath)).toBeNull();
  });

  it('usage·종료 시각이 없으면 토큰 0·시간 null 이다', () => {
    const dbPath = join(dir, 'running.db');
    const db = openDatabase(dbPath);
    createRunRepo(db).createRun({ id: 'r1', task: 't', status: 'running', createdAt: '2026-11-05T10:00:00.000Z' });
    db.close();
    expect(readRunMetrics(dbPath)).toMatchObject({ inputTokens: 0, outputTokens: 0, durationMs: null });
  });
});
