import { z } from 'zod';

import { IPC } from '@shared/ipc/channels';
import { fail, ok, type TIpcResult } from '@shared/ipc/result';
import {
  RUN_HISTORY_LIMIT,
  RUN_NOT_FOUND_MESSAGE,
  RunGetRequestSchema,
  RunGetResponseSchema,
  RunListResponseSchema,
  type IRunHistory,
  type TRunGetResponse,
  type TRunListResponse,
} from '@shared/ipc/runs';

/** runs:list 는 요청 인자가 없다 */
const RunListRequestSchema = z.undefined();

const INVALID_MESSAGE = '요청 형식이 올바르지 않습니다';

/**
 * [runs 핸들러] 실행 기록 조회 2채널 (spec 012) — 조회만 한다 (SR-1). 응답은 보내기 전에 parse — 여분 키(입력값 등)가 끼면 throw → registry 가 INTERNAL 로 감싼다 (SR-2).
 * 규칙: .claude/rules/electron/ipc.md 「핸들러」
 */
export function createRunsHandlers(history: IRunHistory) {
  return {
    [IPC.runs.list]: (raw?: unknown) => listRuns(history, raw),
    [IPC.runs.get]: (raw: unknown) => getRun(history, raw),
  };
}

function listRuns(history: IRunHistory, raw: unknown): TIpcResult<TRunListResponse> {
  const parsed = RunListRequestSchema.safeParse(raw);
  if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
  return ok(RunListResponseSchema.parse({ runList: history.listRecent(RUN_HISTORY_LIMIT) }));
}

function getRun(history: IRunHistory, raw: unknown): TIpcResult<TRunGetResponse> {
  const parsed = RunGetRequestSchema.safeParse(raw);
  if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
  const detail = history.getDetail(parsed.data.runId);
  if (!detail) return fail('NOT_FOUND', RUN_NOT_FOUND_MESSAGE);
  return ok(RunGetResponseSchema.parse(detail));
}
