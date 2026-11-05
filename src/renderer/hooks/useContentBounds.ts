import { type RefObject, useEffect } from 'react';

import type { TSetBoundsRequest } from '@shared/ipc/tabs';

import { getApi } from '@/lib/api';

/**
 * [콘텐츠 영역] ref 요소의 창 기준 사각형을 main 에 알린다 — main 이 활성 탭 View 를 그 자리에 맞춘다.
 * 크기 변화(ResizeObserver)·창 크기 변화(resize) 때 다시 재고, 직전과 같은 값이면 보내지 않는다.
 */
export function useContentBounds(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const sendBounds = createBoundsSender(element);
    const observer = new ResizeObserver(sendBounds);
    observer.observe(element);
    window.addEventListener('resize', sendBounds);
    sendBounds();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sendBounds);
    };
  }, [ref]);
}

/** 요소의 사각형을 재서 바뀌었을 때만 tabs:setBounds 를 보내는 함수를 만든다 */
function createBoundsSender(element: HTMLElement): () => void {
  let lastBounds: TSetBoundsRequest | null = null;
  return () => {
    const bounds = toBoundsRequest(element.getBoundingClientRect());
    if (lastBounds !== null && isSameBounds(lastBounds, bounds)) return;
    lastBounds = bounds;
    void getApi().tabs.setBounds(bounds);
  };
}

/** DOMRect 를 요청 스키마(0 이상 정수)에 맞게 반올림한다 */
function toBoundsRequest(rect: DOMRect): TSetBoundsRequest {
  return {
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height)),
  };
}

/** 두 사각형이 같은지 */
function isSameBounds(a: TSetBoundsRequest, b: TSetBoundsRequest): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
