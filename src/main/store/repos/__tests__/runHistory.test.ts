import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IRunStore, TStepUpsert } from '@shared/agent/run';
import type { IRunHistory } from '@shared/ipc/runs';

import { openDatabase } from '../../db';
import { createRunHistoryRepo } from '../runHistory';
import { createRunRepo } from '../runs';

const SECRET_INPUT = '{"ref":"e3","url":"https://secret.example/token=abc"}';
const SECRET_RESULT = '페이지 원문 — 카드번호 1234';

let db: DatabaseSync;
let runRepo: IRunStore;
let history: IRunHistory;

beforeEach(() => {
  db = openDatabase(':memory:');
  runRepo = createRunRepo(db);
  history = createRunHistoryRepo(db);
  runRepo.createRun({ id: 'run-1', task: '첫 번째 할 일', status: 'queued', createdAt: '2026-11-05T10:00:00.000Z' });
  runRepo.createRun({ id: 'run-3', task: '세 번째 할 일', status: 'queued', createdAt: '2026-11-05T12:00:00.000Z' });
  runRepo.createRun({ id: 'run-2', task: '두 번째 할 일', status: 'queued', createdAt: '2026-11-05T11:00:00.000Z' });
  runRepo.updateRun('run-1', {
    status: 'done',
    summary: '끝났습니다',
    endedAt: '2026-11-05T10:01:00.000Z',
    usageJson: '{"input_tokens":10}',
  });
});

afterEach(() => {
  db.close();
});

function createStep(overrides: Partial<TStepUpsert> = {}): TStepUpsert {
  return {
    n: 1,
    tool: 'click',
    summary: '버튼 누르기',
    status: 'ok',
    inputJson: SECRET_INPUT,
    resultText: SECRET_RESULT,
    createdAt: '2026-11-05T10:00:10.000Z',
    ...overrides,
  };
}

describe('createRunHistoryRepo — listRecent', () => {
  it('listRecent 하면 createdAt 내림차순으로 돌려준다', () => {
    expect(history.listRecent(50).map((run) => run.id)).toEqual(['run-3', 'run-2', 'run-1']);
  });

  it('listRecent 에 limit 을 주면 그 개수까지만 돌려준다', () => {
    expect(history.listRecent(2).map((run) => run.id)).toEqual(['run-3', 'run-2']);
  });

  it('listRecent 의 한 줄은 요약 필드만 담는다', () => {
    expect(history.listRecent(50).at(-1)).toEqual({
      id: 'run-1',
      task: '첫 번째 할 일',
      status: 'done',
      summary: '끝났습니다',
      reason: null,
      createdAt: '2026-11-05T10:00:00.000Z',
      endedAt: '2026-11-05T10:01:00.000Z',
    });
  });

  it('run 이 없으면 빈 배열을 돌려준다', () => {
    db.exec('DELETE FROM runs');
    expect(history.listRecent(50)).toEqual([]);
  });

  it('저장된 status 가 RunStatus 밖이면 throw 한다 (createRunRepo 와 같은 변환)', () => {
    db.prepare(`UPDATE runs SET status = 'weird' WHERE id = 'run-2'`).run();
    expect(() => history.listRecent(50)).toThrow();
  });
});

describe('createRunHistoryRepo — getDetail', () => {
  beforeEach(() => {
    runRepo.upsertStep('run-1', createStep({ n: 2, tool: 'type_text', summary: '이름 입력', status: 'denied' }));
    runRepo.upsertStep('run-1', createStep({ n: 1 }));
  });

  it('getDetail 하면 run 요약과 n 오름차순 단계를 돌려준다', () => {
    expect(history.getDetail('run-1')).toEqual({
      run: expect.objectContaining({ id: 'run-1', status: 'done' }),
      stepList: [
        { n: 1, tool: 'click', summary: '버튼 누르기', status: 'ok' },
        { n: 2, tool: 'type_text', summary: '이름 입력', status: 'denied' },
      ],
    });
  });

  it('getDetail 결과에는 도구 입력값·결과 원문·사용량이 없다', () => {
    const text = JSON.stringify(history.getDetail('run-1'));
    expect(text).not.toContain('secret.example');
    expect(text).not.toContain(SECRET_RESULT);
    expect(text).not.toContain('input_tokens');
  });

  it('단계가 없는 run 은 빈 stepList 를 돌려준다', () => {
    expect(history.getDetail('run-2')?.stepList).toEqual([]);
  });

  it('없는 run id 면 null 을 돌려준다', () => {
    expect(history.getDetail('none')).toBeNull();
  });
});
