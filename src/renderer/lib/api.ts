import type { IApi } from '@shared/ipc/api';

/**
 * [api] preload 가 노출한 window.api 를 돌려준다 — 훅은 이 함수로만 main 에 접근한다.
 * 호출 시점에 읽어 테스트가 window.api 를 바꿔 끼울 수 있게 한다.
 */
export function getApi(): IApi {
  return window.api;
}
