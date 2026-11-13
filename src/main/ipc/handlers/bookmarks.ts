import { z } from 'zod';

import {
  BookmarkAddRequestSchema,
  BookmarkListResponseSchema,
  BookmarkRemoveRequestSchema,
  type IBookmarkStore,
  type TBookmark,
  type TBookmarkListResponse,
} from '@shared/ipc/bookmarks';
import { IPC } from '@shared/ipc/channels';
import { fail, ok, type TIpcResult } from '@shared/ipc/result';

/** bookmarks:list 는 요청 인자가 없다 */
const BookmarkListRequestSchema = z.undefined();

const INVALID_MESSAGE = '요청 형식이 올바르지 않습니다';

/**
 * [bookmarks 핸들러] 북마크 3채널 (spec 021) — 검증 → 저장소 → 최신 목록 봉투. 응답은 보내기 전에 parse.
 * 규칙: .claude/rules/electron/ipc.md 「핸들러」
 */
export function createBookmarksHandlers(store: IBookmarkStore) {
  return {
    [IPC.bookmarks.list]: (raw?: unknown) => handleRequest(BookmarkListRequestSchema, raw, () => toOk(store.list())),
    [IPC.bookmarks.add]: (raw: unknown) =>
      handleRequest(BookmarkAddRequestSchema, raw, (input) => {
        const result = store.add(input);
        return result.ok ? toOk(result.bookmarkList) : fail(result.code, result.message);
      }),
    [IPC.bookmarks.remove]: (raw: unknown) =>
      handleRequest(BookmarkRemoveRequestSchema, raw, (input) => toOk(store.remove(input.url))),
  };
}

function handleRequest<TSchema extends z.ZodType>(
  schema: TSchema,
  raw: unknown,
  run: (input: z.infer<TSchema>) => TIpcResult<TBookmarkListResponse>,
): TIpcResult<TBookmarkListResponse> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
  return run(parsed.data);
}

function toOk(bookmarkList: TBookmark[]): TIpcResult<TBookmarkListResponse> {
  return ok(BookmarkListResponseSchema.parse({ bookmarkList }));
}
