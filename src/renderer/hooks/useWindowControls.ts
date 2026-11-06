import { getApi } from '@/lib/api';
import { callSafely } from '@/lib/callSafely';

const WINDOW_FAILED_MESSAGE = '창을 조작하지 못했습니다';

/**
 * [창 제어] 신호등 버튼의 window:* 호출 (spec 010) — 결과 봉투를 그대로 돌려준다(toast 는 호출한 컴포넌트가).
 * IPC 자체가 throw 해도 INTERNAL 실패 봉투로 바꾼다.
 */
export function useWindowControls() {
  return {
    minimize: () => callSafely(() => getApi().window.minimize(), WINDOW_FAILED_MESSAGE),
    toggleMaximize: () => callSafely(() => getApi().window.toggleMaximize(), WINDOW_FAILED_MESSAGE),
    close: () => callSafely(() => getApi().window.close(), WINDOW_FAILED_MESSAGE),
  };
}
