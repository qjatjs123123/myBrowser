import { useState } from 'react';
import { z } from 'zod';

const STORAGE_KEY = 'mybrowser:layout';
const DEFAULT_IS_OPEN = true;

/** 사이드바 폭 범위·기본값(px) — 손잡이와 저장값 검증이 같은 범위를 본다 (spec 012 FR-5·6) */
export const SIDEBAR_WIDTH = { min: 300, max: 640, default: 360 } as const;

/** 저장 형식 — 키마다 따로 검증해, 한쪽이 없거나 깨져도 다른 쪽은 저장값을 쓴다 (이전 형식 `{ isSidebarOpen }` 도 읽힌다) */
const LayoutSchema = z.object({
  isSidebarOpen: z.boolean().catch(DEFAULT_IS_OPEN),
  sidebarWidth: z.number().min(SIDEBAR_WIDTH.min).max(SIDEBAR_WIDTH.max).catch(SIDEBAR_WIDTH.default),
});

type TLayout = z.infer<typeof LayoutSchema>;

const DEFAULT_LAYOUT: TLayout = { isSidebarOpen: DEFAULT_IS_OPEN, sidebarWidth: SIDEBAR_WIDTH.default };

/** useSidebarOpen 반환 — 열림 여부와 폭 */
export interface ISidebarLayout {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  width: number;
  setWidth: (width: number) => void;
}

/**
 * [사이드바 열림·폭] 에이전트 패널을 열어 둘지와 폭 — localStorage `mybrowser:layout` 에 함께 기억해 다음 실행에도 그대로
 * (spec 011 FR-7, spec 012 FR-6). 값이 없거나 깨졌거나 storage 를 쓸 수 없으면 열림·360px. 저장 실패는 무시한다(이번 실행 동안만 유지).
 */
export function useSidebarOpen(): ISidebarLayout {
  const [layout, setLayout] = useState(readLayout);

  const updateLayout = (nextLayout: TLayout) => {
    setLayout(nextLayout);
    writeLayout(nextLayout);
  };

  return {
    isOpen: layout.isSidebarOpen,
    setIsOpen: (isOpen) => updateLayout({ ...layout, isSidebarOpen: isOpen }),
    width: layout.sidebarWidth,
    setWidth: (width) => updateLayout({ ...layout, sidebarWidth: width }),
  };
}

/** 저장된 레이아웃 — 없거나 형식이 다르면 기본값 */
function readLayout(): TLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_LAYOUT;
    const parsed = LayoutSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/** 레이아웃 저장 — storage 를 쓸 수 없으면 조용히 넘어간다 */
function writeLayout(layout: TLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // 저장 못 해도 이번 실행 동안은 state 로 유지된다
  }
}
