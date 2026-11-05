import type { TAppInfo } from './app';
import type { TIpcResult } from './result';

/**
 * [window.api] preload 가 노출하고 renderer 가 쓰는 API 의 타입 — 양쪽이 이 타입 하나를 공유한다.
 * 규칙: .claude/rules/electron/preload.md
 */
export interface IApi {
  app: {
    getInfo: () => Promise<TIpcResult<TAppInfo>>;
  };
}
