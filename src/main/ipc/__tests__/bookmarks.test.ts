import { describe, expect, it, vi } from 'vitest';

import { BOOKMARK_MESSAGE, type IBookmarkStore, type TBookmark } from '@shared/ipc/bookmarks';
import { IPC } from '@shared/ipc/channels';

import { createBookmarksHandlers } from '../handlers/bookmarks';

const BOOKMARK: TBookmark = { id: 'b1', url: 'https://a.com/', title: 'A', createdAt: '2026-11-13T00:00:00.000Z' };

function setup(overrides: Partial<IBookmarkStore> = {}) {
  const store: IBookmarkStore = {
    list: vi.fn(() => [BOOKMARK]),
    add: vi.fn(() => ({ ok: true as const, bookmarkList: [BOOKMARK] })),
    remove: vi.fn(() => []),
    ...overrides,
  };
  return { store, handlers: createBookmarksHandlers(store) };
}

describe('bookmarks 핸들러', () => {
  it('bookmarks:list 는 목록을 성공 봉투로 돌려준다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.bookmarks.list]()).toEqual({ ok: true, data: { bookmarkList: [BOOKMARK] } });
  });

  it('bookmarks:list 에 인자가 오면 INVALID_INPUT 이다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.bookmarks.list]({})).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('bookmarks:add 는 검증한 값을 저장소에 넘긴다', () => {
    const { handlers, store } = setup();
    expect(handlers[IPC.bookmarks.add]({ url: 'https://a.com/', title: ' A ' })).toMatchObject({ ok: true });
    expect(store.add).toHaveBeenCalledWith({ url: 'https://a.com/', title: 'A' });
  });

  it('bookmarks:add 의 url 이 file: 이면 INVALID_INPUT 이고 저장하지 않는다', () => {
    const { handlers, store } = setup();
    expect(handlers[IPC.bookmarks.add]({ url: 'file:///a', title: 'A' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    expect(store.add).not.toHaveBeenCalled();
  });

  it('저장소가 LIMIT 이면 LIMIT 봉투를 돌려준다', () => {
    const { handlers } = setup({
      add: vi.fn(() => ({ ok: false as const, code: 'LIMIT' as const, message: BOOKMARK_MESSAGE.tooMany })),
    });
    expect(handlers[IPC.bookmarks.add]({ url: 'https://b.com/', title: 'B' })).toEqual({
      ok: false,
      error: { code: 'LIMIT', message: BOOKMARK_MESSAGE.tooMany },
    });
  });

  it('bookmarks:remove 는 url 로 지우고 목록을 돌려준다', () => {
    const { handlers, store } = setup();
    expect(handlers[IPC.bookmarks.remove]({ url: 'https://a.com/' })).toEqual({ ok: true, data: { bookmarkList: [] } });
    expect(store.remove).toHaveBeenCalledWith('https://a.com/');
  });
});
