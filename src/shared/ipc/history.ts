import { z } from 'zod';

/** [history] 저장하는 최대 줄 수 — 넘으면 오래된 것부터 지운다 (spec 021 FR-4) */
export const HISTORY_ROW_MAX = 5000;
/** [history] 검색어 최대 길이 */
export const HISTORY_QUERY_MAX = 200;
/** [history] 한 번에 돌려주는 최대 개수 */
export const HISTORY_LIST_LIMIT_MAX = 200;
/** [history] 기본 개수 — 새 탭 화면 목록 (FR-5) */
export const HISTORY_LIST_LIMIT_DEFAULT = 30;

/** [history] main 이 돌려주는 사용자 문장 */
export const HISTORY_MESSAGE = {
  notFound: '방문 기록을 찾을 수 없습니다',
} as const;

/** [history] 방문 기록 한 줄 — url·제목·시각만 (SR-2) */
export const HistoryEntrySchema = z.strictObject({
  id: z.string().min(1),
  url: z.string(),
  title: z.string(),
  visitedAt: z.string(),
});

/** [history:list] 요청 — 인자를 생략하면 검색어 없이 기본 개수 */
export const HistoryListRequestSchema = z
  .strictObject({
    query: z.string().trim().max(HISTORY_QUERY_MAX).default(''),
    limit: z.number().int().min(1).max(HISTORY_LIST_LIMIT_MAX).default(HISTORY_LIST_LIMIT_DEFAULT),
  })
  .default({ query: '', limit: HISTORY_LIST_LIMIT_DEFAULT });

/** [history:list] 응답 — 최근 방문 순 */
export const HistoryListResponseSchema = z.strictObject({
  entryList: z.array(HistoryEntrySchema).max(HISTORY_LIST_LIMIT_MAX),
});

/** [history:remove] 요청 — 응답은 EmptyResponseSchema(tabs.ts) */
export const HistoryRemoveRequestSchema = z.strictObject({ id: z.string().min(1) });

/** [history] main 저장소 계약 — 핸들러·탭 로드 기록이 이것만 안다 */
export interface IHistoryStore {
  record(input: { url: string; title: string }): void;
  list(input: { query: string; limit: number }): THistoryEntry[];
  /** 지웠으면 true, 없는 id 면 false */
  remove(id: string): boolean;
  clear(): void;
}

export type THistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type THistoryListRequest = z.input<typeof HistoryListRequestSchema>;
export type THistoryListResponse = z.infer<typeof HistoryListResponseSchema>;
export type THistoryRemoveRequest = z.infer<typeof HistoryRemoveRequestSchema>;
