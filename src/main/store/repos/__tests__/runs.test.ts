import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IRunStore, TStepUpsert } from '@shared/agent/run';

import { openDatabase } from '../../db';
import { createRunRepo } from '../runs';

const CREATED_AT = '2026-11-05T10:00:00.000Z';
const ENDED_AT = '2026-11-05T10:01:00.000Z';

let db: DatabaseSync;
let repo: IRunStore;

beforeEach(() => {
  db = openDatabase(':memory:');
  repo = createRunRepo(db);
  repo.createRun({ id: 'run-1', task: '오늘 7시 2명 예약해줘', status: 'queued', createdAt: CREATED_AT });
});

afterEach(() => {
  db.close();
});

function createStep(overrides: Partial<TStepUpsert> = {}): TStepUpsert {
  return {
    n: 1,
    tool: 'snapshot',
    summary: '페이지 읽기',
    status: 'running',
    inputJson: '{}',
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe('createRunRepo — run', () => {
  it('createRun 한 run 을 getRun 하면 같은 값을 돌려준다', () => {
    expect(repo.getRun('run-1')).toEqual({
      id: 'run-1',
      task: '오늘 7시 2명 예약해줘',
      status: 'queued',
      summary: null,
      reason: null,
      createdAt: CREATED_AT,
      endedAt: null,
    });
  });

  it('없는 run 을 getRun 하면 null 을 돌려준다', () => {
    expect(repo.getRun('none')).toBeNull();
  });

  it('updateRun 하면 준 필드만 바뀐다', () => {
    repo.updateRun('run-1', { status: 'running' });
    repo.updateRun('run-1', { status: 'done', summary: '예약 페이지까지 왔습니다', endedAt: ENDED_AT });
    expect(repo.getRun('run-1')).toMatchObject({
      task: '오늘 7시 2명 예약해줘',
      status: 'done',
      summary: '예약 페이지까지 왔습니다',
      reason: null,
      endedAt: ENDED_AT,
    });
  });

  it('updateRun 에 usageJson 을 주면 runs.usage_json 에 저장된다', () => {
    repo.updateRun('run-1', { usageJson: '{"input_tokens":10}' });
    const row = db.prepare('SELECT usage_json FROM runs WHERE id = ?').get('run-1');
    expect(row).toEqual({ usage_json: '{"input_tokens":10}' });
  });
});

describe('createRunRepo — step', () => {
  it('같은 n 으로 upsertStep 하면 새 줄 대신 기존 줄을 갱신한다', () => {
    repo.upsertStep('run-1', createStep());
    repo.upsertStep('run-1', createStep({ status: 'ok', resultText: '- button "예약" [ref=e1]' }));
    expect(repo.listSteps('run-1')).toEqual([
      {
        n: 1,
        tool: 'snapshot',
        summary: '페이지 읽기',
        status: 'ok',
        inputJson: '{}',
        resultText: '- button "예약" [ref=e1]',
        createdAt: CREATED_AT,
      },
    ]);
  });

  it('listSteps 는 저장 순서와 상관없이 n 오름차순으로 돌려준다', () => {
    repo.upsertStep('run-1', createStep({ n: 3, tool: 'scroll', summary: '스크롤' }));
    repo.upsertStep('run-1', createStep({ n: 1 }));
    repo.upsertStep('run-1', createStep({ n: 2, tool: 'go_back', summary: '뒤로 가기' }));
    expect(repo.listSteps('run-1').map((step) => step.n)).toEqual([1, 2, 3]);
  });

  it('step 이 없는 run 을 listSteps 하면 빈 배열을 돌려준다', () => {
    expect(repo.listSteps('none')).toEqual([]);
  });

  it('type_text step 을 저장하면 input_json 의 입력값을 생략한다', () => {
    repo.upsertStep(
      'run-1',
      createStep({ tool: 'type_text', inputJson: '{"ref":"e3","text":"010-1234-5678","submit":true}' }),
    );
    const inputJson = repo.listSteps('run-1')[0]?.inputJson ?? '';
    expect(JSON.parse(inputJson)).toEqual({ ref: 'e3', text: '[입력값 생략]', submit: true });
  });

  it('없는 run 에 upsertStep 하면 외래 키 위반으로 throw 한다', () => {
    expect(() => repo.upsertStep('none', createStep())).toThrow();
  });
});
