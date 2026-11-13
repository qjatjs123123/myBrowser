import { fail, type TIpcResult } from '@shared/ipc/result';

/**
 * [IPC 안전 호출] window.api 호출 자체가 throw 해도(preload 미노출·채널 오류) INTERNAL 실패 봉투로 바꾼다.
 * 성공·실패 봉투는 그대로 돌려준다 — 훅은 throw 하지 않고, toast 는 봉투를 받은 쪽이 띄운다.
 */
export async function callSafely<T>(call: () => Promise<TIpcResult<T>>, failMessage: string): Promise<TIpcResult<T>> {
  try {
    return await call();
  } catch {
    return fail('INTERNAL', failMessage);
  }
}
