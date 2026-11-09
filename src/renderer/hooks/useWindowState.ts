import { useEffect, useState } from 'react';

import type { TWindowState } from '@shared/ipc/window';

import { getApi } from '@/lib/api';

const INITIAL_STATE: TWindowState = { isMaximized: false };

/**
 * [창 상태] window:stateChanged 를 구독한다 — 최대화·전체 화면이면 isMaximized (spec 014).
 * main 이 첫 로드 때 현재 상태를 1회 보내므로 기본값(false)은 그 전까지만 쓰인다.
 */
export function useWindowState(): TWindowState {
  const [state, setState] = useState<TWindowState>(INITIAL_STATE);
  useEffect(() => getApi().window.onStateChanged(setState), []);
  return state;
}
