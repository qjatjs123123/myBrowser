import { AccountStatusSchema, type TAccountStatus } from '@shared/ipc/account';
import { IPC } from '@shared/ipc/channels';
import { fail, ok, type TIpcResult } from '@shared/ipc/result';
import { EmptyResponseSchema } from '@shared/ipc/tabs';

import type { IAccountService, TAccountResult } from '../../account';

type TAccountHandlerService = Pick<
  IAccountService,
  'getStatus' | 'startActivation' | 'cancelActivation' | 'openManage' | 'signOut'
>;

/**
 * [account 핸들러] account:getStatus·startActivation·cancelActivation·openManage·signOut (spec 005 「IPC 계약」).
 * 요청 인자가 없어 입력 검증은 없고, 응답은 보내기 전에 parse — 상태에 토큰이 섞이면 strict 스키마가 막는다.
 * 규칙: .claude/rules/electron/ipc.md 「핸들러」 — BUSY·AGENT_ERROR 문장은 서비스가 정한다
 */
export function createAccountHandlers(service: TAccountHandlerService) {
  return {
    [IPC.account.getStatus]: () => toStatusResult(service.getStatus()),
    [IPC.account.startActivation]: async () => toResult(await service.startActivation()),
    [IPC.account.cancelActivation]: () => toStatusResult(service.cancelActivation()),
    [IPC.account.openManage]: async (): Promise<TIpcResult<null>> => {
      const result = await service.openManage();
      return result.ok ? ok(EmptyResponseSchema.parse(null)) : fail(result.code, result.message);
    },
    [IPC.account.signOut]: () => toStatusResult(service.signOut()),
  };
}

function toStatusResult(status: TAccountStatus): TIpcResult<TAccountStatus> {
  return ok(AccountStatusSchema.parse(status));
}

function toResult(result: TAccountResult<TAccountStatus>): TIpcResult<TAccountStatus> {
  return result.ok ? toStatusResult(result.data) : fail(result.code, result.message);
}
