import { describe, expect, it, vi } from 'vitest';

import { IPC } from '@shared/ipc/channels';

import { ACCOUNT_MESSAGE, type IAccountService } from '../../account';
import { createAccountHandlers } from '../handlers/account';

const ACTIVATING = {
  state: 'activating',
  activationId: '0b9a3e7e-6c1f-4c55-9d4a-0e1f2a3b4c5d',
  expiresAt: '2026-11-05T10:15:00Z',
} as const;

function setup() {
  const service = {
    getStatus: vi.fn<IAccountService['getStatus']>(() => ({ state: 'inactive' })),
    startActivation: vi.fn<IAccountService['startActivation']>(async () => ({ ok: true, data: ACTIVATING })),
    cancelActivation: vi.fn<IAccountService['cancelActivation']>(() => ({ state: 'inactive' })),
    openManage: vi.fn<IAccountService['openManage']>(async () => ({ ok: true, data: null })),
    signOut: vi.fn<IAccountService['signOut']>(() => ({ state: 'inactive' })),
  };
  return { service, handlers: createAccountHandlers(service) };
}

describe('account 핸들러', () => {
  it('getStatus 는 상태를 성공 봉투로 돌려준다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.account.getStatus]()).toEqual({ ok: true, data: { state: 'inactive' } });
  });

  it('startActivation 성공이면 activating 상태 봉투다', async () => {
    const { handlers } = setup();
    expect(await handlers[IPC.account.startActivation]()).toEqual({ ok: true, data: ACTIVATING });
  });

  it('이미 연결돼 있으면 BUSY 봉투다', async () => {
    const { service, handlers } = setup();
    service.startActivation.mockResolvedValueOnce({ ok: false, code: 'BUSY', message: ACCOUNT_MESSAGE.alreadyActive });
    expect(await handlers[IPC.account.startActivation]()).toEqual({
      ok: false,
      error: { code: 'BUSY', message: '이미 연결돼 있습니다' },
    });
  });

  it('게이트웨이 실패면 AGENT_ERROR 봉투다', async () => {
    const { service, handlers } = setup();
    service.startActivation.mockResolvedValueOnce({
      ok: false,
      code: 'AGENT_ERROR',
      message: ACCOUNT_MESSAGE.gatewayFailed,
    });
    expect(await handlers[IPC.account.startActivation]()).toEqual({
      ok: false,
      error: { code: 'AGENT_ERROR', message: '구독 서버에 연결하지 못했습니다' },
    });
  });

  it('cancelActivation·signOut 은 inactive 성공 봉투다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.account.cancelActivation]()).toEqual({ ok: true, data: { state: 'inactive' } });
    expect(handlers[IPC.account.signOut]()).toEqual({ ok: true, data: { state: 'inactive' } });
  });

  it('openManage 성공이면 null 봉투, 실패면 서비스 문장의 봉투다', async () => {
    const { service, handlers } = setup();
    expect(await handlers[IPC.account.openManage]()).toEqual({ ok: true, data: null });
    service.openManage.mockResolvedValueOnce({ ok: false, code: 'AGENT_ERROR', message: ACCOUNT_MESSAGE.notRequired });
    expect(await handlers[IPC.account.openManage]()).toEqual({
      ok: false,
      error: { code: 'AGENT_ERROR', message: '이 실행 모드에서는 구독이 필요 없습니다' },
    });
  });

  it('상태에 계약 밖의 키(토큰 등)가 섞이면 응답 parse 가 throw 해 보내지 않는다', () => {
    const { service, handlers } = setup();
    service.getStatus.mockReturnValueOnce({ state: 'inactive', deviceToken: 'x' } as never);
    expect(() => handlers[IPC.account.getStatus]()).toThrow();
  });
});
