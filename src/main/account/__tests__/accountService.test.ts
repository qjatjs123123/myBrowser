import { describe, expect, it, vi } from 'vitest';

import type { TAccountInfo, TActivationCreated, TActivationPoll } from '@shared/account/gateway';
import type { TAccountStatus } from '@shared/ipc/account';

import type { ICredentialStore } from '../../app/credentialStore';
import type { TModelMode } from '../../env';
import { ACCOUNT_MESSAGE, createAccountService, sleepWithSignal } from '../accountService';
import { GatewayError } from '../gatewayClient';
import type { IGatewayClient } from '../types';

const BASE = 'http://127.0.0.1:4100';
const ACTIVATION_ID = '0b9a3e7e-6c1f-4c55-9d4a-0e1f2a3b4c5d';
const SECRET = 'poll-secret-' + 'x'.repeat(30);
const TOKEN = 'device-token-' + 'y'.repeat(40);
const START_MS = Date.parse('2026-11-05T10:00:00Z');

const CREATED: TActivationCreated = {
  activation_id: ACTIVATION_ID,
  poll_secret: SECRET,
  purchase_url: `${BASE}/purchase?activation_id=${ACTIVATION_ID}`,
  expires_at: '2026-11-05T10:01:00Z',
  poll_interval_sec: 3,
};

const ACCOUNT: TAccountInfo = {
  credits: 1000,
  plan: 'basic',
  subscription_status: 'active',
  renews_at: '2026-12-05T00:00:00Z',
  manage_url: `${BASE}/manage`,
};

const ACTIVE_1000: TAccountStatus = { state: 'active', credits: 1000, plan: 'basic', renewsAt: '2026-12-05T00:00:00Z' };

function createMemoryStore(initial: string | null = null): ICredentialStore & { token: string | null } {
  const store = {
    token: initial,
    read: vi.fn(() => store.token),
    write: vi.fn((token: string) => {
      store.token = token;
    }),
    clear: vi.fn(() => {
      store.token = null;
    }),
  };
  return store;
}

interface ISetupOptions {
  modelMode?: TModelMode;
  storedToken?: string | null;
  pollList?: Array<TActivationPoll | Error>;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** 가짜 게이트웨이·저장소·시계 — sleep 은 시계를 그만큼 앞으로 돌리고 바로 끝난다 */
function setup({ modelMode = 'gateway', storedToken = null, pollList = [], sleep }: ISetupOptions = {}) {
  let nowMs = START_MS;
  const queue = [...pollList];
  const gateway = {
    baseUrl: BASE,
    createActivation: vi.fn<IGatewayClient['createActivation']>(async () => CREATED),
    pollActivation: vi.fn<IGatewayClient['pollActivation']>(async () => {
      const next = queue.shift() ?? { status: 'pending' };
      if (next instanceof Error) throw next;
      return next;
    }),
    getAccount: vi.fn<IGatewayClient['getAccount']>(async () => ACCOUNT),
  } satisfies IGatewayClient;
  const store = createMemoryStore(storedToken);
  const emitList: TAccountStatus[] = [];
  const deps = {
    modelMode,
    gateway,
    store,
    openTab: vi.fn<(url: string) => unknown>(),
    emit: vi.fn((status: TAccountStatus) => {
      emitList.push(status);
    }),
    now: () => nowMs,
    sleep:
      sleep ??
      vi.fn(async (ms: number) => {
        nowMs += ms;
      }),
    deviceName: 'test-laptop',
    log: { info: vi.fn(), warn: vi.fn() },
  };
  return { service: createAccountService(deps), deps, gateway, store, emitList };
}

const lastEmit = (emitList: TAccountStatus[]) => emitList.at(-1);

describe('direct·fake 모드', () => {
  it.each(['direct', 'fake'] as const)('%s 모드면 상태는 not_required 다', (modelMode) => {
    const { service } = setup({ modelMode });
    expect(service.getStatus()).toEqual({ state: 'not_required' });
    expect(service.getDeviceToken()).toBeNull();
  });

  it('not_required 모드에서 startActivation 은 AGENT_ERROR 이고 게이트웨이를 부르지 않는다', async () => {
    const { service, gateway } = setup({ modelMode: 'direct' });
    expect(await service.startActivation()).toEqual({
      ok: false,
      code: 'AGENT_ERROR',
      message: '이 실행 모드에서는 구독이 필요 없습니다',
    });
    expect(gateway.createActivation).not.toHaveBeenCalled();
  });

  it('not_required 모드에서는 저장소를 읽지 않는다', () => {
    const { service, store } = setup({ modelMode: 'fake', storedToken: TOKEN });
    service.getStatus();
    expect(store.read).not.toHaveBeenCalled();
  });
});

describe('활성화', () => {
  it('토큰이 없으면 inactive 로 시작한다', () => {
    expect(setup().service.getStatus()).toEqual({ state: 'inactive' });
  });

  it('시작하면 activating 상태를 돌려주고 구매 URL 을 새 탭으로 연다', async () => {
    const { service, deps, gateway } = setup({ sleep: () => new Promise(() => {}) });
    const result = await service.startActivation();
    expect(result).toEqual({
      ok: true,
      data: { state: 'activating', activationId: ACTIVATION_ID, expiresAt: CREATED.expires_at },
    });
    expect(gateway.createActivation).toHaveBeenCalledWith('test-laptop');
    expect(deps.openTab).toHaveBeenCalledWith(CREATED.purchase_url);
  });

  it('pending → approved 면 토큰을 저장하고 active 이벤트 후 크레딧을 갱신한다', async () => {
    const { service, store, emitList } = setup({
      pollList: [{ status: 'pending' }, { status: 'approved', device_token: TOKEN }],
    });
    await service.startActivation();
    await vi.waitFor(() => expect(lastEmit(emitList)).toEqual(ACTIVE_1000));
    expect(store.write).toHaveBeenCalledWith(TOKEN);
    expect(emitList.map((status) => status.state)).toEqual(['activating', 'active', 'active']);
    expect(service.getDeviceToken()).toBe(TOKEN);
  });

  it('approved 뒤에는 더 이상 폴링하지 않는다', async () => {
    const { service, gateway, emitList } = setup({ pollList: [{ status: 'approved', device_token: TOKEN }] });
    await service.startActivation();
    await vi.waitFor(() => expect(lastEmit(emitList)).toEqual(ACTIVE_1000));
    expect(gateway.pollActivation).toHaveBeenCalledTimes(1);
  });

  it('expired 응답이면 만료 문장으로 inactive 가 된다', async () => {
    const { service, emitList } = setup({ pollList: [{ status: 'expired' }] });
    await service.startActivation();
    await vi.waitFor(() =>
      expect(lastEmit(emitList)).toEqual({
        state: 'inactive',
        message: '시간이 지나 연결을 취소했습니다 — 다시 시도해 주세요',
      }),
    );
  });

  it('expires_at 까지 pending 이면 만료 처리하고 폴링을 멈춘다', async () => {
    const { service, gateway, emitList } = setup();
    await service.startActivation();
    await vi.waitFor(() => expect(lastEmit(emitList)).toEqual({ state: 'inactive', message: ACCOUNT_MESSAGE.expired }));
    // 60초 / 3초 = 20 주기 중 마지막 주기는 만료 판정이라 호출하지 않는다
    expect(gateway.pollActivation).toHaveBeenCalledTimes(19);
  });

  it('토큰 없이 consumed 를 받으면 “연결 정보를 받지 못했습니다” 로 inactive 가 된다', async () => {
    const { service, store, emitList } = setup({ pollList: [{ status: 'consumed' }] });
    await service.startActivation();
    await vi.waitFor(() =>
      expect(lastEmit(emitList)).toEqual({
        state: 'inactive',
        message: '연결 정보를 받지 못했습니다 — 다시 시도해 주세요',
      }),
    );
    expect(store.write).not.toHaveBeenCalled();
  });

  it.each([
    ['429', new GatewayError(429, '요청이 많습니다')],
    ['5xx', new GatewayError(503, '구독 서버 요청이 실패했습니다')],
    ['네트워크 오류', new GatewayError(0, '구독 서버에 연결하지 못했습니다')],
  ])('폴링 중 %s 는 다음 주기에 재시도한다', async (_label, error) => {
    const { service, gateway, emitList } = setup({ pollList: [error, { status: 'approved', device_token: TOKEN }] });
    await service.startActivation();
    await vi.waitFor(() => expect(lastEmit(emitList)).toEqual(ACTIVE_1000));
    expect(gateway.pollActivation).toHaveBeenCalledTimes(2);
  });

  it('폴링 중 404(비밀 불일치) 는 재시도하지 않고 inactive 로 끝낸다', async () => {
    const { service, gateway, emitList } = setup({ pollList: [new GatewayError(404, '없음')] });
    await service.startActivation();
    await vi.waitFor(() =>
      expect(lastEmit(emitList)).toEqual({ state: 'inactive', message: ACCOUNT_MESSAGE.notReceived }),
    );
    expect(gateway.pollActivation).toHaveBeenCalledTimes(1);
  });

  it('취소하면 inactive 를 돌려주고 그 뒤 폴링하지 않는다', async () => {
    const sleep = vi.fn(
      (_ms: number, signal: AbortSignal) =>
        new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve())),
    );
    const { service, gateway } = setup({ sleep });
    await service.startActivation();
    expect(service.cancelActivation()).toEqual({ state: 'inactive' });
    await vi.waitFor(() => expect(sleep).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(gateway.pollActivation).not.toHaveBeenCalled();
  });

  it('응답을 기다리는 중 취소하면 늦게 온 approved 를 저장하지 않는다', async () => {
    let resolvePoll: (poll: TActivationPoll) => void = () => {};
    const { service, gateway, store } = setup();
    gateway.pollActivation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePoll = resolve;
        }),
    );
    await service.startActivation();
    await vi.waitFor(() => expect(gateway.pollActivation).toHaveBeenCalledTimes(1));
    service.cancelActivation();
    resolvePoll({ status: 'approved', device_token: TOKEN });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.write).not.toHaveBeenCalled();
    expect(service.getStatus()).toEqual({ state: 'inactive' });
  });

  it('activating 중 다시 시작하면 같은 상태를 돌려주고 활성화를 새로 만들지 않는다', async () => {
    const { service, gateway } = setup({ sleep: () => new Promise(() => {}) });
    const first = await service.startActivation();
    expect(await service.startActivation()).toEqual(first);
    expect(gateway.createActivation).toHaveBeenCalledTimes(1);
  });

  it('동시에 두 번 시작해도 활성화는 1번만 만든다', async () => {
    const { service, gateway } = setup({ sleep: () => new Promise(() => {}) });
    await Promise.all([service.startActivation(), service.startActivation()]);
    expect(gateway.createActivation).toHaveBeenCalledTimes(1);
  });

  it('active 면 startActivation 은 BUSY “이미 연결돼 있습니다” 다', async () => {
    const { service } = setup({ storedToken: TOKEN });
    expect(await service.startActivation()).toEqual({ ok: false, code: 'BUSY', message: '이미 연결돼 있습니다' });
  });

  it('활성화 생성이 실패하면 AGENT_ERROR “구독 서버에 연결하지 못했습니다” 이고 inactive 그대로다', async () => {
    const { service, gateway, deps } = setup();
    gateway.createActivation.mockRejectedValueOnce(new GatewayError(0, '구독 서버에 연결하지 못했습니다'));
    expect(await service.startActivation()).toEqual({
      ok: false,
      code: 'AGENT_ERROR',
      message: '구독 서버에 연결하지 못했습니다',
    });
    expect(service.getStatus()).toEqual({ state: 'inactive' });
    expect(deps.openTab).not.toHaveBeenCalled();
  });

  it('구매 탭을 열지 못하면 활성화를 버리고 AGENT_ERROR 다', async () => {
    const { service, deps, gateway } = setup();
    deps.openTab.mockImplementationOnce(() => {
      throw new Error('창 없음');
    });
    expect(await service.startActivation()).toMatchObject({ ok: false, code: 'AGENT_ERROR' });
    expect(service.getStatus()).toEqual({ state: 'inactive' });
    expect(gateway.pollActivation).not.toHaveBeenCalled();
  });
});

describe('SR-1·SR-2 비밀 비노출', () => {
  it('토큰·poll_secret 이 emit·로그·결과 어디에도 나타나지 않는다', async () => {
    const { service, deps, emitList } = setup({
      pollList: [new GatewayError(503, 'x'), { status: 'approved', device_token: TOKEN }],
    });
    const result = await service.startActivation();
    await vi.waitFor(() => expect(lastEmit(emitList)).toEqual(ACTIVE_1000));
    const dump = JSON.stringify([emitList, result, deps.log.info.mock.calls, deps.log.warn.mock.calls]);
    expect(dump).not.toContain(TOKEN);
    expect(dump).not.toContain(SECRET);
  });

  it('openTab 인자에 poll_secret 이 없다', async () => {
    const { service, deps } = setup({ sleep: () => new Promise(() => {}) });
    await service.startActivation();
    expect(JSON.stringify(deps.openTab.mock.calls)).not.toContain(SECRET);
  });

  it('구매 URL 에 poll_secret 이 섞여 오면 탭을 열지 않고 AGENT_ERROR 다', async () => {
    const { service, deps, gateway } = setup();
    gateway.createActivation.mockResolvedValueOnce({ ...CREATED, purchase_url: `${BASE}/purchase?s=${SECRET}` });
    expect(await service.startActivation()).toMatchObject({ ok: false, code: 'AGENT_ERROR' });
    expect(deps.openTab).not.toHaveBeenCalled();
  });

  it('완료 뒤에는 pollActivation 을 다시 부르지 않는다', async () => {
    const { service, gateway, emitList } = setup({ pollList: [{ status: 'expired' }] });
    await service.startActivation();
    await vi.waitFor(() => expect(lastEmit(emitList)?.state).toBe('inactive'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(gateway.pollActivation).toHaveBeenCalledTimes(1);
  });
});

describe('재시작·크레딧', () => {
  it('저장된 토큰이 있으면 바로 active(크레딧 확인 중)로 시작한다', () => {
    const { service } = setup({ storedToken: TOKEN });
    expect(service.getStatus()).toEqual({ state: 'active', credits: null, plan: null, renewsAt: null });
  });

  it('active 에서 getStatus 하면 크레딧을 비동기로 갱신해 이벤트로 보낸다', async () => {
    const { service, gateway, emitList } = setup({ storedToken: TOKEN });
    service.getStatus();
    await vi.waitFor(() => expect(lastEmit(emitList)).toEqual(ACTIVE_1000));
    expect(gateway.getAccount).toHaveBeenCalledWith(TOKEN);
  });

  it('refreshCredits 가 401 이면 토큰을 지우고 해제 문장으로 inactive 가 된다', async () => {
    const { service, gateway, store, emitList } = setup({ storedToken: TOKEN });
    gateway.getAccount.mockRejectedValueOnce(new GatewayError(401, '인증 실패'));
    service.getStatus();
    await service.refreshCredits();
    await vi.waitFor(() =>
      expect(lastEmit(emitList)).toEqual({
        state: 'inactive',
        message: '기기 연결이 해제됐습니다 — 다시 구독 연결을 해 주세요',
      }),
    );
    expect(store.token).toBeNull();
  });

  it('refreshCredits 가 401 이 아닌 오류면 active 를 유지한다', async () => {
    const { service, gateway } = setup({ storedToken: TOKEN });
    gateway.getAccount.mockRejectedValueOnce(new GatewayError(503, '실패'));
    await service.refreshCredits();
    expect(service.getStatus().state).toBe('active');
  });

  it('토큰이 없으면 refreshCredits 는 게이트웨이를 부르지 않는다', async () => {
    const { service, gateway } = setup();
    await service.refreshCredits();
    expect(gateway.getAccount).not.toHaveBeenCalled();
  });
});

describe('연결 해제·인증 실패', () => {
  it('signOut 하면 저장 토큰을 지우고 inactive 를 돌려준다', () => {
    const { service, store, emitList } = setup({ storedToken: TOKEN });
    expect(service.signOut()).toEqual({ state: 'inactive' });
    expect(store.clear).toHaveBeenCalled();
    expect(lastEmit(emitList)).toEqual({ state: 'inactive' });
    expect(service.getDeviceToken()).toBeNull();
  });

  it('handleAuthFailure 하면 토큰을 지우고 해제 문장으로 inactive 이벤트를 보낸다', () => {
    const { service, store, emitList } = setup({ storedToken: TOKEN });
    service.getStatus();
    service.handleAuthFailure();
    expect(store.token).toBeNull();
    expect(lastEmit(emitList)).toEqual({ state: 'inactive', message: ACCOUNT_MESSAGE.authFailed });
  });

  it('signOut 직전에 시작된 크레딧 갱신 결과는 상태를 되살리지 않는다', async () => {
    const { service, gateway } = setup({ storedToken: TOKEN });
    let resolveAccount: (info: TAccountInfo) => void = () => {};
    gateway.getAccount.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAccount = resolve;
        }),
    );
    const refreshing = service.refreshCredits();
    service.signOut();
    resolveAccount(ACCOUNT);
    await refreshing;
    expect(service.getStatus()).toEqual({ state: 'inactive' });
  });
});

describe('openManage', () => {
  it('계정 정보를 읽기 전이면 {gw}/account 를 새 탭으로 연다', async () => {
    const { service, deps } = setup({ storedToken: TOKEN });
    expect(await service.openManage()).toEqual({ ok: true, data: null });
    expect(deps.openTab).toHaveBeenCalledWith(`${BASE}/account`);
  });

  it('마지막 /v1/account 의 manage_url 을 새 탭으로 연다', async () => {
    const { service, deps } = setup({ storedToken: TOKEN });
    service.getStatus();
    await service.refreshCredits();
    await vi.waitFor(() => expect(service.getStatus()).toEqual(ACTIVE_1000));
    await service.openManage();
    expect(deps.openTab).toHaveBeenLastCalledWith(ACCOUNT.manage_url);
  });

  it('not_required 모드면 AGENT_ERROR 다', async () => {
    const { service } = setup({ modelMode: 'direct' });
    expect(await service.openManage()).toMatchObject({ ok: false, code: 'AGENT_ERROR' });
  });
});

describe('shutdown', () => {
  it('종료하면 진행 중인 폴링을 멈춘다', async () => {
    const sleep = vi.fn(
      (_ms: number, signal: AbortSignal) =>
        new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve())),
    );
    const { service, gateway } = setup({ sleep });
    await service.startActivation();
    service.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(gateway.pollActivation).not.toHaveBeenCalled();
  });
});

describe('sleepWithSignal', () => {
  it('abort 되면 시간 전에 끝난다', async () => {
    const controller = new AbortController();
    const sleeping = sleepWithSignal(60_000, controller.signal);
    controller.abort();
    await expect(sleeping).resolves.toBeUndefined();
  });

  it('abort 되지 않으면 ms 뒤에 끝난다', async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    void sleepWithSignal(3000, new AbortController().signal).then(onDone);
    await vi.advanceTimersByTimeAsync(2999);
    expect(onDone).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onDone).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
