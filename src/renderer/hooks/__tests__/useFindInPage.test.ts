import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TFindUpdatedEvent } from '@shared/ipc/tabs';

import { type IFindTarget, useFindInPage } from '../useFindInPage';

const TAB_A: IFindTarget = { id: 'tab-1', url: 'https://a.com/' };

function renderOpen(target: IFindTarget | null = TAB_A) {
  const view = renderHook(({ current }) => useFindInPage(current), { initialProps: { current: target } });
  act(() => view.result.current.open());
  return view;
}

/** onFindUpdated 에 등록된 콜백으로 결과를 보낸다 */
function emitFindUpdated(event: TFindUpdatedEvent) {
  const callback = vi.mocked(window.api.tabs.onFindUpdated).mock.calls.at(-1)?.[0];
  act(() => callback?.(event));
}

describe('useFindInPage', () => {
  it('open 하면 열리고 포커스 신호가 오른다', () => {
    const { result } = renderOpen();
    expect(result.current.isOpen).toBe(true);
    expect(result.current.focusSignal).toBe(1);
  });

  it('대상 탭이 없으면 open 해도 열리지 않는다', () => {
    const { result } = renderOpen(null);
    expect(result.current.isOpen).toBe(false);
  });

  it('검색어를 넣으면 새 검색으로 찾는다', () => {
    const { result } = renderOpen();
    act(() => result.current.search('사과'));
    expect(window.api.tabs.find).toHaveBeenCalledWith({ tabId: 'tab-1', text: '사과', isForward: true, isNext: false });
  });

  it('next·prev 는 같은 검색어의 다음·이전 결과를 찾는다', () => {
    const { result } = renderOpen();
    act(() => result.current.search('사과'));
    act(() => result.current.next());
    act(() => result.current.prev());
    expect(vi.mocked(window.api.tabs.find).mock.calls.slice(1).map(([req]) => req)).toEqual([
      { tabId: 'tab-1', text: '사과', isForward: true, isNext: true },
      { tabId: 'tab-1', text: '사과', isForward: false, isNext: true },
    ]);
  });

  it('검색어를 지우면 찾기 강조를 지운다', () => {
    const { result } = renderOpen();
    act(() => result.current.search('사과'));
    act(() => result.current.search(''));
    expect(window.api.tabs.stopFind).toHaveBeenCalledWith({ tabId: 'tab-1' });
  });

  it('같은 탭의 결과가 오면 개수를 보인다', () => {
    const { result } = renderOpen();
    emitFindUpdated({ tabId: 'tab-1', activeMatch: 2, matchCount: 5 });
    expect(result.current.count).toEqual({ activeMatch: 2, matchCount: 5 });
  });

  it('다른 탭의 결과는 무시한다', () => {
    const { result } = renderOpen();
    emitFindUpdated({ tabId: 'tab-2', activeMatch: 1, matchCount: 1 });
    expect(result.current.count).toBeNull();
  });

  it('close 하면 닫고 찾기 강조를 지운다', () => {
    const { result } = renderOpen();
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    expect(window.api.tabs.stopFind).toHaveBeenCalledWith({ tabId: 'tab-1' });
  });

  it('탭이 바뀌면 닫고 앞 탭의 찾기 강조를 지운다', () => {
    const { result, rerender } = renderOpen();
    rerender({ current: { id: 'tab-2', url: 'https://b.com/' } });
    expect(result.current.isOpen).toBe(false);
    expect(window.api.tabs.stopFind).toHaveBeenCalledWith({ tabId: 'tab-1' });
  });

  it('같은 탭에서 url 이 바뀌면 닫고 검색어를 비운다', () => {
    const { result, rerender } = renderOpen();
    act(() => result.current.search('사과'));
    rerender({ current: { id: 'tab-1', url: 'https://a.com/next' } });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.text).toBe('');
    expect(window.api.tabs.stopFind).toHaveBeenCalledWith({ tabId: 'tab-1' });
  });
});
