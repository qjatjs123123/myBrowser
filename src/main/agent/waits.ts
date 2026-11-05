/**
 * [대기 요청 레지스트리] run 하나의 승인·질문 대기를 requestId 로 묶는다 (spec 004 「대기 요청 레지스트리」).
 * 래퍼는 open() 의 Promise 를 await 하고, IPC(agent:approve·answer)가 resolve() 로 풀며,
 * 중지·종료는 cancelAll() 로 전부 풀어 기다리던 래퍼가 실행 없이 끝나게 한다 (SR-1).
 */
import type { TApprovalDecision, TModelApprovalDecision, TRequestId } from '@shared/agent/run';

/** 대기 종류 — guard = 가드 판정 승인, model = request_approval, question = ask_user */
export type TWaitKind = 'guard' | 'model' | 'question';

/** 대기 요청 한 건 — requestId 는 createRequestId() 로 받은 것 */
export interface IWaitRequest {
  requestId: TRequestId;
  kind: TWaitKind;
}

/** 취소 이유 — 중지(stop·run 종료) 또는 앱 종료 */
export type TCancelReason = 'stopped' | 'shutdown';

/** 대기의 답 — 사용자 결정, 질문 답, 또는 중지·종료로 취소 */
export type TWaitAnswer =
  | { type: 'decision'; decision: TApprovalDecision | TModelApprovalDecision }
  | { type: 'answer'; answer: string }
  | { type: 'cancelled'; reason: TCancelReason };

/** 사용자가 준 답 (취소 제외) */
export type TUserAnswer = Exclude<TWaitAnswer, { type: 'cancelled' }>;

export interface IWaitRegistry {
  /** run 안에서 다음 요청 id — `req-{n}` */
  createRequestId(): TRequestId;
  /** 대기를 연다 — 같은 id 로 두 번 열면 throw (우리 버그) */
  open(request: IWaitRequest): Promise<TWaitAnswer>;
  /** 열린 대기 — 없거나 이미 풀렸으면 null (IPC 의 NOT_FOUND·kind 검사용) */
  getPending(requestId: string): IWaitRequest | null;
  /** 대기를 푼다 — 없는 id·이미 풀린 id 면 false */
  resolve(requestId: string, answer: TUserAnswer): boolean;
  /** 열린 대기를 전부 취소한다 — 취소한 요청 목록 (이벤트 발신용) */
  cancelAll(reason: TCancelReason): IWaitRequest[];
}

interface IPendingEntry {
  request: IWaitRequest;
  settle: (answer: TWaitAnswer) => void;
}

/** run 마다 하나 만든다 */
export function createWaitRegistry(): IWaitRegistry {
  const pendingMap = new Map<string, IPendingEntry>();
  let requestCount = 0;

  const open = (request: IWaitRequest): Promise<TWaitAnswer> => {
    if (pendingMap.has(request.requestId)) throw new Error(`이미 열린 대기 요청: ${request.requestId}`);
    return new Promise<TWaitAnswer>((settle) => pendingMap.set(request.requestId, { request, settle }));
  };

  /** 대기 1건을 꺼내 푼다 — 없으면 null */
  const settleEntry = (requestId: string, answer: TWaitAnswer): IWaitRequest | null => {
    const entry = pendingMap.get(requestId);
    if (!entry) return null;
    pendingMap.delete(requestId);
    entry.settle(answer);
    return entry.request;
  };

  return {
    createRequestId: () => `req-${++requestCount}`,
    open,
    getPending: (requestId) => pendingMap.get(requestId)?.request ?? null,
    resolve: (requestId, answer) => settleEntry(requestId, answer) !== null,
    cancelAll: (reason) => [...pendingMap.keys()].flatMap((id) => settleEntry(id, { type: 'cancelled', reason }) ?? []),
  };
}
