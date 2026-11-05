/**
 * [account 모듈] 구독 계정의 공개 API — 다른 모듈은 이 파일로만 가져다 쓴다 (.claude/rules/architecture.md §2).
 */
export {
  ACCOUNT_MESSAGE,
  createAccountService,
  sleepWithSignal,
  type IAccountLog,
  type IAccountServiceDeps,
} from './accountService';
export { createGatewayClient, GATEWAY_MESSAGE, GatewayError, type IGatewayClientOptions } from './gatewayClient';
export type { IAccountService, IGatewayClient, TAccountResult, TFetch } from './types';
