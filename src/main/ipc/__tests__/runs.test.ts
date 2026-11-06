import { describe, expect, it, vi } from 'vitest';

import { IPC } from '@shared/ipc/channels';
import {
  RUN_HISTORY_LIMIT,
  RUN_NOT_FOUND_MESSAGE,
  type IRunHistory,
  type TRunGetResponse,
  type TRunSummary,
} from '@shared/ipc/runs';

import { createRunsHandlers } from '../handlers/runs';

const RUN: TRunSummary = {
  id: 'run-1',
  task: '오늘 7시 2명 예약해줘',
  status: 'done',
  summary: '예약 페이지까지 왔습니다',
  reason: null,
  createdAt: '2026-11-05T10:00:00.000Z',
  endedAt: '2026-11-05T10:01:00.000Z',
};

const DETAIL: TRunGetResponse = {
  run: RUN,
  stepList: [{ n: 1, tool: 'click', summary: '버튼 누르기', status: 'ok' }],
};

function setup(overrides: Partial<IRunHistory> = {}) {
  const history = {
    listRecent: vi.fn(() => [RUN]),
    getDetail: vi.fn((runId: string) => (runId === 'run-1' ? DETAIL : null)),
    ...overrides,
  } satisfies IRunHistory;
  return { history, handlers: createRunsHandlers(history) };
}

describe('runs 핸들러 runs:list', () => {
  it('runs:list 는 최근 기록을 성공 봉투로 돌려준다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.runs.list]()).toEqual({ ok: true, data: { runList: [RUN] } });
  });

  it('runs:list 는 RUN_HISTORY_LIMIT 개까지 요청한다', () => {
    const { history, handlers } = setup();
    handlers[IPC.runs.list]();
    expect(history.listRecent).toHaveBeenCalledWith(RUN_HISTORY_LIMIT);
  });

  it('runs:list 에 인자가 오면 INVALID_INPUT 이다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.runs.list]({ x: 1 })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('runs:list 응답에 여분 키가 끼면 보내기 전 parse 가 throw 한다', () => {
    const { handlers } = setup({ listRecent: () => [{ ...RUN, inputJson: '{}' } as TRunSummary] });
    expect(() => handlers[IPC.runs.list]()).toThrow();
  });
});

describe('runs 핸들러 runs:get', () => {
  it('runs:get 에 있는 runId 를 주면 상세를 성공 봉투로 돌려준다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.runs.get]({ runId: 'run-1' })).toEqual({ ok: true, data: DETAIL });
  });

  it('runs:get 요청 형식이 틀리면 INVALID_INPUT 이고 저장소를 부르지 않는다', () => {
    const { history, handlers } = setup();
    expect(handlers[IPC.runs.get]({ runId: '' })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(history.getDetail).not.toHaveBeenCalled();
  });

  it('runs:get 에 여분 키가 오면 INVALID_INPUT 이다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.runs.get]({ runId: 'run-1', extra: true })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
  });

  it('runs:get 에 없는 runId 를 주면 NOT_FOUND 문장을 돌려준다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.runs.get]({ runId: 'none' })).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: RUN_NOT_FOUND_MESSAGE },
    });
  });
});
