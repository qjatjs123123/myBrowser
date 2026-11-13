import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSidebarOpen } from '../useSidebarOpen';

const KEY = 'mybrowser:layout';

describe('useSidebarOpen (spec 011·012)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('저장값이 없으면 열림이다', () => {
    const { result } = renderHook(() => useSidebarOpen());
    expect(result.current.isOpen).toBe(true);
  });

  it('저장값이 닫힘이면 닫힘으로 시작한다', () => {
    localStorage.setItem(KEY, JSON.stringify({ isSidebarOpen: false }));
    const { result } = renderHook(() => useSidebarOpen());
    expect(result.current.isOpen).toBe(false);
  });

  it('바꾸면 상태가 바뀌고 mybrowser:layout 에 저장한다', () => {
    const { result } = renderHook(() => useSidebarOpen());
    act(() => result.current.setIsOpen(false));
    expect(result.current.isOpen).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({ isSidebarOpen: false, sidebarWidth: 360 });
  });

  it.each(['{깨짐', JSON.stringify({ isSidebarOpen: 'no' }), JSON.stringify([])])(
    '저장값이 깨졌거나 형식이 다르면 열림이다 (%s)',
    (raw) => {
      localStorage.setItem(KEY, raw);
      const { result } = renderHook(() => useSidebarOpen());
      expect(result.current.isOpen).toBe(true);
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
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.setIsOpen(false));
    expect(result.current.isOpen).toBe(false);
  });

  describe('폭 (spec 012)', () => {
    it('저장값이 없으면 폭은 360 이다', () => {
      const { result } = renderHook(() => useSidebarOpen());
      expect(result.current.width).toBe(360);
    });

    it('저장된 폭으로 시작한다', () => {
      localStorage.setItem(KEY, JSON.stringify({ isSidebarOpen: true, sidebarWidth: 480 }));
      const { result } = renderHook(() => useSidebarOpen());
      expect(result.current.width).toBe(480);
    });

    it.each([299, 641, '400'])('저장된 폭이 범위 밖이거나 숫자가 아니면 폭만 360 이고 열림은 저장값이다 (%s)', (sidebarWidth) => {
      localStorage.setItem(KEY, JSON.stringify({ isSidebarOpen: false, sidebarWidth }));
      const { result } = renderHook(() => useSidebarOpen());
      expect(result.current.width).toBe(360);
      expect(result.current.isOpen).toBe(false);
    });

    it('이전 형식 { isSidebarOpen } 도 읽고 폭은 360 이다', () => {
      localStorage.setItem(KEY, JSON.stringify({ isSidebarOpen: false }));
      const { result } = renderHook(() => useSidebarOpen());
      expect(result.current.isOpen).toBe(false);
      expect(result.current.width).toBe(360);
    });

    it('폭을 바꾸면 상태가 바뀌고 열림 여부와 함께 저장한다', () => {
      const { result } = renderHook(() => useSidebarOpen());
      act(() => result.current.setWidth(512));
      expect(result.current.width).toBe(512);
      expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({ isSidebarOpen: true, sidebarWidth: 512 });
    });

    it('폭을 바꾼 뒤 닫아도 폭이 유지돼 저장된다', () => {
      const { result } = renderHook(() => useSidebarOpen());
      act(() => result.current.setWidth(400));
      act(() => result.current.setIsOpen(false));
      expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({ isSidebarOpen: false, sidebarWidth: 400 });
    });
  });
});
