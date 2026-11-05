import type { TAccountInfo, TActivationCreated, TActivationPoll } from '@shared/account/gateway';
import type { TAccountStatus } from '@shared/ipc/account';

import type { ICredentialStore } from '../app/credentialStore';
import type { TModelMode } from '../env';
import { GatewayError } from './gatewayClient';
import type { IAccountService, IGatewayClient, TAccountResult } from './types';

/** 계정 카드·IPC 실패 문장 (spec 005 FR-4·FR-6·「IPC 계약」) */
export const ACCOUNT_MESSAGE = {
  notRequired: '이 실행 모드에서는 구독이 필요 없습니다',
  alreadyActive: '이미 연결돼 있습니다',
  gatewayFailed: '구독 서버에 연결하지 못했습니다',
  openTabFailed: '구매 페이지를 열지 못했습니다',
  expired: '시간이 지나 연결을 취소했습니다 — 다시 시도해 주세요',
  notReceived: '연결 정보를 받지 못했습니다 — 다시 시도해 주세요',
  authFailed: '기기 연결이 해제됐습니다 — 다시 구독 연결을 해 주세요',
} as const;

/** 서비스가 쓰는 로그 — 인자에 토큰·poll_secret 을 넣지 않는다 (SR-1·SR-2) */
export interface IAccountLog {
  info: (scope: string, message: string, meta?: unknown) => void;
  warn: (scope: string, message: string, meta?: unknown) => void;
}

export interface IAccountServiceDeps {
  modelMode: TModelMode;
  gateway: IGatewayClient;
  store: ICredentialStore;
  /** 새 탭으로 연다 — index.ts 에서 tabManager.createTab(url) */
  openTab: (url: string) => unknown;
  /** account:changed 발신 — 상태가 바뀔 때마다 전체 */
  emit: (status: TAccountStatus) => void;
  now: () => number;
  /** signal 이 abort 되면 바로 끝나야 한다 — 테스트는 즉시 resolve 하는 가짜 */
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  deviceName: string;
  log: IAccountLog;
}

interface IActivation {
  id: string;
  secret: string;
  expiresAtMs: number;
  intervalMs: number;
  controller: AbortController;
}

const SCOPE = 'account';
/** 폴링 중 다음 주기에 재시도하는 상태 — 0 은 네트워크 오류·타임아웃 */
const RETRY_STATUS_LIST = [0, 429];
const INACTIVE: TAccountStatus = { state: 'inactive' };
const NOT_REQUIRED: TAccountStatus = { state: 'not_required' };

/** signal 로 끊을 수 있는 sleep — index.ts 가 deps.sleep 으로 넘긴다 */
export function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}

/**
 * [계정 서비스] 활성화(구매 탭 → 폴링 → 토큰 저장)·크레딧 갱신·연결 해제 (spec 005 FR-4·FR-5·FR-7).
 * gateway 가 아닌 모드는 not_required 고정. 저장 토큰은 첫 접근 때 읽는다(safeStorage 는 app ready 뒤에만 유효).
 */
export function createAccountService(deps: IAccountServiceDeps): IAccountService {
  const service = new AccountService(deps);
  return {
    getStatus: () => service.getStatus(),
    startActivation: () => service.startActivation(),
    cancelActivation: () => service.cancelActivation(),
    openManage: () => service.openManage(),
    signOut: () => service.signOut(),
    getDeviceToken: () => service.getDeviceToken(),
    refreshCredits: () => service.refreshCredits(),
    handleAuthFailure: () => service.handleAuthFailure(),
    shutdown: () => service.shutdown(),
  };
}

class AccountService {
  private status: TAccountStatus | null = null;
  private activation: IActivation | null = null;
  private starting: Promise<TAccountResult<TAccountStatus>> | null = null;
  private refreshing: Promise<void> | null = null;
  private manageUrl: string | null = null;

  constructor(private readonly deps: IAccountServiceDeps) {}

  private get isGateway(): boolean {
    return this.deps.modelMode === 'gateway';
  }

  getStatus(): TAccountStatus {
    const status = this.current();
    if (status.state === 'active') void this.refreshCredits();
    return status;
  }

  startActivation(): Promise<TAccountResult<TAccountStatus>> {
    const status = this.current();
    if (status.state === 'not_required') return resolved(failure('AGENT_ERROR', ACCOUNT_MESSAGE.notRequired));
    if (status.state === 'active') return resolved(failure('BUSY', ACCOUNT_MESSAGE.alreadyActive));
    if (status.state === 'activating') return resolved({ ok: true, data: status });
    this.starting ??= this.createActivation().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  cancelActivation(): TAccountStatus {
    if (this.current().state !== 'activating') return this.current();
    this.endActivation(INACTIVE);
    return this.current();
  }

  async openManage(): Promise<TAccountResult<null>> {
    if (!this.isGateway) return failure('AGENT_ERROR', ACCOUNT_MESSAGE.notRequired);
    await this.deps.openTab(this.manageUrl ?? `${this.deps.gateway.baseUrl}/account`);
    return { ok: true, data: null };
  }

  signOut(): TAccountStatus {
    if (!this.isGateway) return NOT_REQUIRED;
    this.abortActivation();
    this.deps.store.clear();
    this.manageUrl = null;
    this.setStatus(INACTIVE);
    return this.current();
  }

  getDeviceToken(): string | null {
    return this.isGateway ? this.deps.store.read() : null;
  }

  refreshCredits(): Promise<void> {
    const token = this.getDeviceToken();
    if (!token || this.current().state !== 'active') return Promise.resolve();
    this.refreshing ??= this.fetchAccount(token).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  handleAuthFailure(): void {
    if (!this.isGateway) return;
    this.deps.store.clear();
    this.manageUrl = null;
    if (this.current().state === 'activating') return;
    this.setStatus({ state: 'inactive', message: ACCOUNT_MESSAGE.authFailed });
  }

  shutdown(): void {
    this.abortActivation();
  }

  /** 첫 접근 때 모드·저장 토큰으로 초기 상태를 정한다 */
  private current(): TAccountStatus {
    this.status ??= this.getInitialStatus();
    return this.status;
  }

  private getInitialStatus(): TAccountStatus {
    if (!this.isGateway) return NOT_REQUIRED;
    return this.deps.store.read() ? toActiveStatus(null) : INACTIVE;
  }

  private setStatus(next: TAccountStatus): void {
    this.status = next;
    this.deps.emit(next);
  }

  private async createActivation(): Promise<TAccountResult<TAccountStatus>> {
    const created = await this.requestActivation();
    if (!created) return failure('AGENT_ERROR', ACCOUNT_MESSAGE.gatewayFailed);
    const activation = toActivation(created);
    this.activation = activation;
    this.setStatus({ state: 'activating', activationId: created.activation_id, expiresAt: created.expires_at });
    if (!(await this.openPurchaseTab(created.purchase_url))) {
      this.endActivation(INACTIVE);
      return failure('AGENT_ERROR', ACCOUNT_MESSAGE.openTabFailed);
    }
    void this.pollUntilDone(activation);
    return { ok: true, data: this.current() };
  }

  /** 활성화 생성 — 실패하거나 구매 URL 에 poll_secret 이 섞여 있으면 null (SR-2) */
  private async requestActivation(): Promise<TActivationCreated | null> {
    try {
      const created = await this.deps.gateway.createActivation(this.deps.deviceName);
      if (!created.purchase_url.includes(created.poll_secret)) return created;
      this.deps.log.warn(SCOPE, '구매 URL 에 폴링 비밀이 들어 있어 활성화를 중단합니다');
    } catch (error) {
      this.deps.log.warn(SCOPE, '활성화 생성 실패', { status: toStatusCode(error) });
    }
    return null;
  }

  private async openPurchaseTab(url: string): Promise<boolean> {
    try {
      await this.deps.openTab(url);
      return true;
    } catch {
      this.deps.log.warn(SCOPE, '구매 페이지 탭을 열지 못했습니다');
      return false;
    }
  }

  /** poll_interval 마다 확인 — 끝나면(승인·만료·실패·취소) 반복을 멈춘다 */
  private async pollUntilDone(activation: IActivation): Promise<void> {
    const { signal } = activation.controller;
    while (!signal.aborted) {
      await this.deps.sleep(activation.intervalMs, signal);
      if (signal.aborted) return;
      if (this.deps.now() >= activation.expiresAtMs) return this.endActivation(toInactive(ACCOUNT_MESSAGE.expired));
      const poll = await this.pollOnce(activation);
      if (signal.aborted) return;
      if (poll) this.applyPoll(poll);
    }
  }

  /** 한 번 확인 — 재시도할 오류면 null, 재시도하지 않을 오류면 실패로 끝낸다 */
  private async pollOnce(activation: IActivation): Promise<TActivationPoll | null> {
    try {
      return await this.deps.gateway.pollActivation(activation.id, activation.secret);
    } catch (error) {
      const status = toStatusCode(error);
      this.deps.log.warn(SCOPE, '활성화 확인 실패', { status });
      if (isRetryable(status)) return null;
      this.endActivation(toInactive(ACCOUNT_MESSAGE.notReceived));
      return null;
    }
  }

  private applyPoll(poll: TActivationPoll): void {
    if (poll.status === 'pending') return;
    if (poll.status === 'expired') return this.endActivation(toInactive(ACCOUNT_MESSAGE.expired));
    if (poll.status === 'consumed') return this.endActivation(toInactive(ACCOUNT_MESSAGE.notReceived));
    this.deps.store.write(poll.device_token);
    this.endActivation(toActiveStatus(null));
    this.deps.log.info(SCOPE, '기기 연결 완료');
    void this.refreshCredits();
  }

  /** 폴링을 멈추고 poll_secret 을 버린 뒤 다음 상태로 (SR-2) */
  private endActivation(next: TAccountStatus): void {
    this.abortActivation();
    this.setStatus(next);
  }

  private abortActivation(): void {
    this.activation?.controller.abort();
    this.activation = null;
  }

  private async fetchAccount(token: string): Promise<void> {
    let info: TAccountInfo;
    try {
      info = await this.deps.gateway.getAccount(token);
    } catch (error) {
      return this.handleRefreshError(error, token);
    }
    if (this.current().state !== 'active' || this.getDeviceToken() !== token) return;
    this.manageUrl = info.manage_url;
    this.setStatus(toActiveStatus(info));
  }

  private handleRefreshError(error: unknown, token: string): void {
    const status = toStatusCode(error);
    this.deps.log.warn(SCOPE, '크레딧 갱신 실패', { status });
    if (status === 401 && this.getDeviceToken() === token) this.handleAuthFailure();
  }
}

function toActivation(created: TActivationCreated): IActivation {
  return {
    id: created.activation_id,
    secret: created.poll_secret,
    expiresAtMs: Date.parse(created.expires_at),
    intervalMs: created.poll_interval_sec * 1000,
    controller: new AbortController(),
  };
}

function toActiveStatus(info: TAccountInfo | null): TAccountStatus {
  return {
    state: 'active',
    credits: info?.credits ?? null,
    plan: info?.plan ?? null,
    renewsAt: info?.renews_at ?? null,
  };
}

function toInactive(message: string): TAccountStatus {
  return { state: 'inactive', message };
}

/** GatewayError 면 HTTP 상태, 그 밖의 예외는 0(네트워크 오류로 본다) */
function toStatusCode(error: unknown): number {
  return error instanceof GatewayError ? error.status : 0;
}

function isRetryable(status: number): boolean {
  return RETRY_STATUS_LIST.includes(status) || status >= 500;
}

function failure(
  code: 'BUSY' | 'AGENT_ERROR',
  message: string,
): { ok: false; code: 'BUSY' | 'AGENT_ERROR'; message: string } {
  return { ok: false, code, message };
}

function resolved<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}
