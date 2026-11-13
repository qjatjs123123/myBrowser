import { useEffect, useEffectEvent, useState } from 'react';

import type { TFindUpdatedEvent } from '@shared/ipc/tabs';

import { getApi } from '@/lib/api';

/** 찾기 대상 탭 — 새 탭(시작 화면)이면 null */
export interface IFindTarget {
  id: string;
  url: string;
}

/** 열린 찾기 한 번 — 탭 id 와 url 이 바뀌면 끝난다 (spec 021 FR-9) */
interface IFindSession {
  tabId: string;
  url: string;
}

/** 찾기 결과 개수 — 아직 결과가 없으면 null */
export type TFindCount = Pick<TFindUpdatedEvent, 'activeMatch' | 'matchCount'>;

/**
 * [페이지 내 찾기] tabs:find|stopFind + tabs:findUpdated (spec 021 FR-7~9).
 * 탭을 바꾸거나 다른 페이지로 이동하면 찾기를 끝낸다 — 그 탭의 강조는 세션이 끝날 때 stopFind 로 지운다.
 */
export function useFindInPage(target: IFindTarget | null) {
  const [session, setSession] = useState<IFindSession | null>(null);
  const [text, setText] = useState('');
  const [count, setCount] = useState<TFindCount | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  if (session && (session.tabId !== target?.id || session.url !== target.url)) {
    setSession(null);
    setText('');
    setCount(null);
  }
  useStopFindOnEnd(session);
  useFindUpdated(session, setCount);

  const find = (value: string, options: { isForward: boolean; isNext: boolean }) => {
    if (session) void getApi().tabs.find({ tabId: session.tabId, text: value, ...options });
  };
  const search = (value: string) => {
    setText(value);
    setCount(null);
    if (value === '' && session) void getApi().tabs.stopFind({ tabId: session.tabId });
    else find(value, { isForward: true, isNext: false });
  };
  const step = (isForward: boolean) => {
    if (text !== '') find(text, { isForward, isNext: true });
  };
  const open = () => {
    if (!target) return;
    if (!session) setSession({ tabId: target.id, url: target.url });
    setFocusSignal((signal) => signal + 1);
  };
  const close = () => {
    setSession(null);
    setText('');
    setCount(null);
  };

  const next = () => step(true);
  const prev = () => step(false);
  return { isOpen: session !== null, text, count, focusSignal, open, close, search, next, prev };
}

/** 세션이 끝나거나 바뀌면 그 탭의 찾기 강조를 지운다 */
function useStopFindOnEnd(session: IFindSession | null): void {
  useEffect(() => {
    if (!session) return;
    const { tabId } = session;
    return () => void getApi().tabs.stopFind({ tabId });
  }, [session]);
}

/** 열린 세션 탭의 결과만 받는다 */
function useFindUpdated(session: IFindSession | null, onCount: (count: TFindCount) => void): void {
  const handleUpdated = useEffectEvent((event: TFindUpdatedEvent) => {
    if (session?.tabId === event.tabId) onCount({ activeMatch: event.activeMatch, matchCount: event.matchCount });
  });
  useEffect(() => getApi().tabs.onFindUpdated(handleUpdated), []);
}
