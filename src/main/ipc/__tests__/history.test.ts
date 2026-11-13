import { describe, expect, it, vi } from 'vitest';

import { IPC } from '@shared/ipc/channels';
import { HISTORY_MESSAGE, type IHistoryStore, type THistoryEntry } from '@shared/ipc/history';

import { createHistoryHandlers } from '../handlers/history';

const ENTRY: THistoryEntry = { id: 'h1', url: 'https://a.com/', title: 'A', visitedAt: '2026-11-13T00:00:00.000Z' };

function setup(overrides: Partial<IHistoryStore> = {}) {
  const store: IHistoryStore = {
    record: vi.fn(),
    list: vi.fn(() => [ENTRY]),
    remove: vi.fn(() => true),
    clear: vi.fn(),
    ...overrides,
  };
  return { store, handlers: createHistoryHandlers(store) };
}

describe('history 핸들러', () => {
  it('history:list 인자가 없으면 기본 검색으로 목록을 돌려준다', () => {
    const { handlers, store } = setup();
    expect(handlers[IPC.history.list]()).toEqual({ ok: true, data: { entryList: [ENTRY] } });
    expect(store.list).toHaveBeenCalledWith({ query: '', limit: 30 });
  });

  it('history:list 는 검색어·개수를 넘긴다', () => {
    const { handlers, store } = setup();
    handlers[IPC.history.list]({ query: '사과', limit: 5 });
    expect(store.list).toHaveBeenCalledWith({ query: '사과', limit: 5 });
  });

  it('history:list 의 limit 이 0 이면 INVALID_INPUT 이다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.history.list]({ limit: 0 })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('history:remove 는 지우면 성공이다', () => {
    const { handlers, store } = setup();
    expect(handlers[IPC.history.remove]({ id: 'h1' })).toEqual({ ok: true, data: null });
    expect(store.remove).toHaveBeenCalledWith('h1');
  });

  it('history:remove 의 id 가 없으면 NOT_FOUND 다', () => {
    const { handlers } = setup({ remove: vi.fn(() => false) });
    expect(handlers[IPC.history.remove]({ id: 'h9' })).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: HISTORY_MESSAGE.notFound },
    });
  });

  it('history:clear 는 모두 지운다', () => {
    const { handlers, store } = setup();
    expect(handlers[IPC.history.clear]()).toEqual({ ok: true, data: null });
    expect(store.clear).toHaveBeenCalled();
  });

  it('history:clear 에 인자가 오면 INVALID_INPUT 이다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.history.clear]({ all: true })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });
});
