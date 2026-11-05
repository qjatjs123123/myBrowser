import { useEffect, useRef, useState } from 'react';

import type { TAccountStatus } from '@shared/ipc/account';
import { fail, type TIpcResult } from '@shared/ipc/result';

import { getApi } from '@/lib/api';

const LOAD_FAILED_MESSAGE = '계정 상태를 불러오지 못했습니다';
const START_FAILED_MESSAGE = '구독 연결을 시작하지 못했습니다';
const CANCEL_FAILED_MESSAGE = '구독 연결을 취소하지 못했습니다';
const MANAGE_FAILED_MESSAGE = '구독 관리 페이지를 열지 못했습니다';
const SIGN_OUT_FAILED_MESSAGE = '연결을 해제하지 못했습니다';

type TStatusRequest = () => Promise<TIpcResult<TAccountStatus>>;

/**
 * [계정] 계정 카드 상태 — main 이 단일 출처. account:getStatus 로 처음 읽고 account:changed 로 갱신한다.
 * changed 가 첫 조회 응답보다 먼저 오면 더 최신이므로 조회 응답은 버린다.
 * 동작 결과는 throw 하지 않고 봉투로 돌려준다 (toast 는 호출한 컴포넌트가 — skills/desktop/error-toast).
 */
export function useAccount() {
  const [status, setStatus] = useState<TAccountStatus | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const hasEventRef = useRef(false);

  useEffect(
    () =>
      getApi().account.onChanged((next) => {
        hasEventRef.current = true;
        setStatus(next);
      }),
    [],
  );

  useEffect(() => {
    let isActive = true;
    void requestStatus(() => getApi().account.getStatus(), LOAD_FAILED_MESSAGE).then((result) => {
      if (!isActive || hasEventRef.current) return;
      if (result.ok) setStatus(result.data);
      else setLoadErrorMessage(result.error.message);
    });
    return () => {
      isActive = false;
    };
  }, []);

  /** 상태를 돌려주는 동작 — 성공하면 응답 상태를 바로 반영한다 */
  const runStatusAction = async (request: TStatusRequest, fallback: string): Promise<TIpcResult<TAccountStatus>> => {
    const result = await requestStatus(request, fallback);
    if (result.ok) setStatus(result.data);
    return result;
  };

  const startActivation = () => runStatusAction(() => getApi().account.startActivation(), START_FAILED_MESSAGE);
  const cancelActivation = () => runStatusAction(() => getApi().account.cancelActivation(), CANCEL_FAILED_MESSAGE);
  const signOut = () => runStatusAction(() => getApi().account.signOut(), SIGN_OUT_FAILED_MESSAGE);
  const openManage = () => requestOpenManage();

  return { status, loadErrorMessage, startActivation, cancelActivation, openManage, signOut };
}

/** 상태 IPC 호출 — IPC 자체가 실패해도 throw 하지 않고 실패 봉투로 바꾼다 */
async function requestStatus(request: TStatusRequest, fallback: string): Promise<TIpcResult<TAccountStatus>> {
  try {
    return await request();
  } catch {
    return fail('INTERNAL', fallback);
  }
}

/** account:openManage 호출 — IPC 자체가 실패하면 실패 봉투 */
async function requestOpenManage(): Promise<TIpcResult<null>> {
  try {
    return await getApi().account.openManage();
  } catch {
    return fail('INTERNAL', MANAGE_FAILED_MESSAGE);
  }
}
