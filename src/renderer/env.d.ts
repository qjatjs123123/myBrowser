/// <reference types="vite/client" />
import type { IApi } from '@shared/ipc/api';

declare global {
  interface Window {
    /** preload 가 노출한 API — 컴포넌트는 직접 쓰지 않고 hooks 를 거친다 */
    api: IApi;
  }
}
