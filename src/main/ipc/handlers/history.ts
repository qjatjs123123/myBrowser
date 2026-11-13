import { z } from 'zod';

import { IPC } from '@shared/ipc/channels';
import {
  HISTORY_MESSAGE,
  HistoryListRequestSchema,
  HistoryListResponseSchema,
  HistoryRemoveRequestSchema,
  type IHistoryStore,
  type THistoryListResponse,
} from '@shared/ipc/history';
import { fail, ok, type TIpcResult } from '@shared/ipc/result';

/** history:clear 는 요청 인자가 없다 */
const HistoryClearRequestSchema = z.undefined();

const INVALID_MESSAGE = '요청 형식이 올바르지 않습니다';

/**
 * [history 핸들러] 방문 기록 3채널 (spec 021) — 조회·지우기만. 기록은 main 이 탭 로드 완료 때 직접 남긴다.
 * 규칙: .claude/rules/electron/ipc.md 「핸들러」
 */
export function createHistoryHandlers(store: IHistoryStore) {
  return {
    [IPC.history.list]: (raw?: unknown) => listHistory(store, raw),
    [IPC.history.remove]: (raw: unknown) => removeHistory(store, raw),
    [IPC.history.clear]: (raw?: unknown) => clearHistory(store, raw),
  };
}

function listHistory(store: IHistoryStore, raw: unknown): TIpcResult<THistoryListResponse> {
  const parsed = HistoryListRequestSchema.safeParse(raw);
  if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
  return ok(HistoryListResponseSchema.parse({ entryList: store.list(parsed.data) }));
}

function removeHistory(store: IHistoryStore, raw: unknown): TIpcResult<null> {
  const parsed = HistoryRemoveRequestSchema.safeParse(raw);
  if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
  return store.remove(parsed.data.id) ? ok(null) : fail('NOT_FOUND', HISTORY_MESSAGE.notFound);
}

function clearHistory(store: IHistoryStore, raw: unknown): TIpcResult<null> {
  const parsed = HistoryClearRequestSchema.safeParse(raw);
  if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
  store.clear();
  return ok(null);
}
