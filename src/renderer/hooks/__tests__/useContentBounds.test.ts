import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useContentBounds } from '../useContentBounds';

/** jsdom 에 없는 ResizeObserver 대역 — 콜백을 모아 두고 테스트가 직접 부른다 */
const observerCallbackList: Array<() => void> = [];
const disconnectMock = vi.fn();

class FakeResizeObserver {
  constructor(callback: () => void) {
    observerCallbackList.push(callback);
  }
  observe(): void {}
  disconnect(): void {
    disconnectMock();
  }
}

function createElement(rect: { x: number; y: number; width: number; height: number }): HTMLDivElement {
  const element = document.createElement('div');
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ ...rect, toJSON: () => rect } as DOMRect);
  return element;
}

function triggerResize(): void {
  observerCallbackList.forEach((callback) => callback());
}

describe('useContentBounds', () => {
  beforeEach(() => {
    observerCallbackList.length = 0;
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('마운트하면 반올림한 사각형을 tabs.setBounds 로 보낸다', () => {
    const element = createElement({ x: 0.4, y: 76.6, width: 800.2, height: 523.5 });
    renderHook(() => useContentBounds({ current: element }));
    expect(window.api.tabs.setBounds).toHaveBeenCalledWith({ x: 0, y: 77, width: 800, height: 524 });
  });

  it('크기 변화가 있어도 값이 같으면 다시 보내지 않는다', () => {
    const element = createElement({ x: 0, y: 76, width: 800, height: 524 });
    renderHook(() => useContentBounds({ current: element }));
    triggerResize();
    window.dispatchEvent(new Event('resize'));
    expect(window.api.tabs.setBounds).toHaveBeenCalledTimes(1);
  });

  it('사각형이 바뀌면 새 값을 보낸다', () => {
    const element = createElement({ x: 0, y: 76, width: 800, height: 524 });
    renderHook(() => useContentBounds({ current: element }));
    vi.mocked(element.getBoundingClientRect).mockReturnValue({ x: 0, y: 140, width: 800, height: 460 } as DOMRect);
    triggerResize();
    expect(window.api.tabs.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 140, width: 800, height: 460 });
  });

  it('창 크기가 바뀌면 다시 재서 보낸다', () => {
    const element = createElement({ x: 0, y: 76, width: 800, height: 524 });
    renderHook(() => useContentBounds({ current: element }));
    vi.mocked(element.getBoundingClientRect).mockReturnValue({ x: 0, y: 76, width: 1000, height: 524 } as DOMRect);
    window.dispatchEvent(new Event('resize'));
    expect(window.api.tabs.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 76, width: 1000, height: 524 });
  });

  it('언마운트하면 관찰을 끊고 resize 를 더 듣지 않는다', () => {
    const element = createElement({ x: 0, y: 76, width: 800, height: 524 });
    const { unmount } = renderHook(() => useContentBounds({ current: element }));
    unmount();
    vi.mocked(element.getBoundingClientRect).mockReturnValue({ x: 0, y: 76, width: 1000, height: 524 } as DOMRect);
    window.dispatchEvent(new Event('resize'));
    expect(disconnectMock).toHaveBeenCalled();
    expect(window.api.tabs.setBounds).toHaveBeenCalledTimes(1);
  });

  it('ref 가 비어 있으면 아무것도 보내지 않는다', () => {
    renderHook(() => useContentBounds({ current: null }));
    expect(window.api.tabs.setBounds).not.toHaveBeenCalled();
  });
});
