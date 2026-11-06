import { fail, type TIpcResult } from '@shared/ipc/result';

import { getApi } from '@/lib/api';

const WINDOW_FAILED_MESSAGE = '창을 조작하지 못했습니다';

/**
 * [창 제어] 신호등 버튼의 window:* 호출 (spec 010) — 결과 봉투를 그대로 돌려준다(toast 는 호출한 컴포넌트가).
 * IPC 자체가 throw 해도 INTERNAL 실패 봉투로 바꾼다.
 */
export function useWindowControls() {
  return {
    minimize: () => callSafely(() => getApi().window.minimize()),
    toggleMaximize: () => callSafely(() => getApi().window.toggleMaximize()),
    close: () => callSafely(() => getApi().window.close()),
  };
}

/** IPC 호출이 throw 하면 실패 봉투로 */
async function callSafely(call: () => Promise<TIpcResult<null>>): Promise<TIpcResult<null>> {
  try {
    return await call();
  } catch {
    return fail('INTERNAL', WINDOW_FAILED_MESSAGE);
  }
}
