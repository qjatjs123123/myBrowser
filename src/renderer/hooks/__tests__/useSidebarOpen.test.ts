import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSidebarOpen } from '../useSidebarOpen';

const KEY = 'mybrowser:layout';

describe('useSidebarOpen (spec 011)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('저장값이 없으면 열림이다', () => {
    const { result } = renderHook(() => useSidebarOpen());
    expect(result.current[0]).toBe(true);
  });

  it('저장값이 닫힘이면 닫힘으로 시작한다', () => {
    localStorage.setItem(KEY, JSON.stringify({ isSidebarOpen: false }));
    const { result } = renderHook(() => useSidebarOpen());
    expect(result.current[0]).toBe(false);
  });

  it('바꾸면 상태가 바뀌고 mybrowser:layout 에 저장한다', () => {
    const { result } = renderHook(() => useSidebarOpen());
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({ isSidebarOpen: false });
  });

  it.each(['{깨짐', JSON.stringify({ isSidebarOpen: 'no' }), JSON.stringify([])])(
    '저장값이 깨졌거나 형식이 다르면 열림이다 (%s)',
    (raw) => {
      localStorage.setItem(KEY, raw);
      const { result } = renderHook(() => useSidebarOpen());
      expect(result.current[0]).toBe(true);
    },
  );

  it('localStorage 가 throw 해도 열림으로 동작하고 바꿀 수 있다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { result } = renderHook(() => useSidebarOpen());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});
