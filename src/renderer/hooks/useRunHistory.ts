import type { TIpcResult } from '@shared/ipc/result';
import type { TRunGetResponse, TRunListResponse } from '@shared/ipc/runs';

import { getApi } from '@/lib/api';
import { callSafely } from '@/lib/callSafely';

const HISTORY_FAILED_MESSAGE = '실행 기록을 불러오지 못했습니다';

/** 기록 조회 호출 묶음 — 상태가 없어 모듈에 한 번만 만든다 (effect 의존성으로 써도 매 렌더 바뀌지 않게) */
const RUN_HISTORY_API = {
  list: (): Promise<TIpcResult<TRunListResponse>> => callSafely(() => getApi().runs.list(), HISTORY_FAILED_MESSAGE),
  get: (runId: string): Promise<TIpcResult<TRunGetResponse>> =>
    callSafely(() => getApi().runs.get({ runId }), HISTORY_FAILED_MESSAGE),
};

/**
 * [실행 기록] runs:list·runs:get 호출 (spec 012 FR-2~4) — 조회만 한다 (SR-1).
 * 결과 봉투를 그대로 돌려주고(toast 는 호출한 컴포넌트가), IPC 자체가 throw 해도 INTERNAL 실패 봉투로 바꾼다.
 */
export function useRunHistory() {
  return RUN_HISTORY_API;
}
