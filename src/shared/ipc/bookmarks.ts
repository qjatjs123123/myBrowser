import { z } from 'zod';

import { HttpUrlSchema } from './tabs';

/** [bookmarks] 북마크 최대 개수 (spec 021 FR-2) */
export const BOOKMARK_COUNT_MAX = 500;
/** [bookmarks] 제목 최대 글자 수 */
export const BOOKMARK_TITLE_MAX = 300;
/** [bookmarks] url 최대 길이 — 삭제 요청은 저장된 값 그대로 받는다 */
export const BOOKMARK_URL_MAX = 2048;

/** [bookmarks] main 이 돌려주는 사용자 문장 */
export const BOOKMARK_MESSAGE = {
  tooMany: `북마크는 최대 ${String(BOOKMARK_COUNT_MAX)}개까지 저장할 수 있습니다`,
} as const;

/** [bookmarks] 저장된 북마크 한 건 — url 고유 */
export const BookmarkSchema = z.strictObject({
  id: z.string().min(1),
  url: z.string(),
  title: z.string(),
  createdAt: z.string(),
});

/** [bookmarks:list|add|remove] 응답 — 최신 추가 순 전체 목록 */
export const BookmarkListResponseSchema = z.strictObject({
  bookmarkList: z.array(BookmarkSchema).max(BOOKMARK_COUNT_MAX),
});

/** [bookmarks:add] 요청 — http(s) 만 (SR-3). 같은 url 이면 제목만 갱신, 빈 제목은 url 로 저장 */
export const BookmarkAddRequestSchema = z.strictObject({
  url: HttpUrlSchema.max(BOOKMARK_URL_MAX),
  title: z.string().trim().max(BOOKMARK_TITLE_MAX),
});

/** [bookmarks:remove] 요청 — 없는 url 이어도 성공 (멱등) */
export const BookmarkRemoveRequestSchema = z.strictObject({
  url: z.string().min(1).max(BOOKMARK_URL_MAX),
});

/** [bookmarks] 저장소 결과 — 상한 초과만 실패 */
export type TBookmarkStoreResult =
  | { ok: true; bookmarkList: TBookmark[] }
  | { ok: false; code: 'LIMIT'; message: string };

/** [bookmarks] main 저장소 계약 — 핸들러가 이것만 안다 */
export interface IBookmarkStore {
  list(): TBookmark[];
  add(input: TBookmarkAddRequest): TBookmarkStoreResult;
  remove(url: string): TBookmark[];
}

export type TBookmark = z.infer<typeof BookmarkSchema>;
export type TBookmarkListResponse = z.infer<typeof BookmarkListResponseSchema>;
export type TBookmarkAddRequest = z.infer<typeof BookmarkAddRequestSchema>;
export type TBookmarkRemoveRequest = z.infer<typeof BookmarkRemoveRequestSchema>;
