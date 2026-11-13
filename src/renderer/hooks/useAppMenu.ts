import type { TShowMenuRequest } from '@shared/ipc/app';
import type { TIpcResult } from '@shared/ipc/result';

import { getApi } from '@/lib/api';
import { callSafely } from '@/lib/callSafely';

const OPEN_FAILED_MESSAGE = '메뉴를 열지 못했습니다';

/**
 * [툴바 메뉴] app:showMenu (spec 023) — 위치만 보내고 항목·동작은 main 이 정한다.
 * 결과 봉투는 throw 하지 않고 돌려준다 (toast 는 호출한 쪽).
 */
export function useAppMenu() {
  const open = (point: TShowMenuRequest): Promise<TIpcResult<null>> =>
    callSafely(() => getApi().app.showMenu(point), OPEN_FAILED_MESSAGE);
  return { open };
}
