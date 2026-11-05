import { useEffect, useState } from 'react';

import type { TAppInfo } from '@shared/ipc/app';

import { getApi } from '@/lib/api';

export type TAppInfoState =
  { status: 'loading' } | { status: 'success'; info: TAppInfo } | { status: 'error'; message: string };

const FALLBACK_ERROR_MESSAGE = '앱 정보를 불러오지 못했습니다';

/** [앱 정보] app:getInfo 를 한 번 불러온다 — 실패는 throw 하지 않고 상태로 돌려준다 */
export function useAppInfo(): TAppInfoState {
  const [state, setState] = useState<TAppInfoState>({ status: 'loading' });

  useEffect(() => {
    let isActive = true;
    getApi()
      .app.getInfo()
      .then((result) => {
        if (!isActive) return;
        setState(
          result.ok ? { status: 'success', info: result.data } : { status: 'error', message: result.error.message },
        );
      })
      .catch(() => {
        if (isActive) setState({ status: 'error', message: FALLBACK_ERROR_MESSAGE });
      });
    return () => {
      isActive = false;
    };
  }, []);

  return state;
}
