import { useState } from 'react';
import { z } from 'zod';

const STORAGE_KEY = 'mybrowser:layout';
const DEFAULT_IS_OPEN = true;

const LayoutSchema = z.strictObject({ isSidebarOpen: z.boolean() });

/**
 * [사이드바 열림] 에이전트 패널을 열어 둘지 — localStorage `mybrowser:layout` 에 기억해 다음 실행에도 그대로 (spec 011 FR-7).
 * 값이 없거나 깨졌거나 storage 를 쓸 수 없으면 열림. 저장 실패는 무시한다(이번 실행 동안만 유지).
 */
export function useSidebarOpen(): [boolean, (isOpen: boolean) => void] {
  const [isOpen, setIsOpenState] = useState(readIsOpen);

  const setIsOpen = (nextIsOpen: boolean) => {
    setIsOpenState(nextIsOpen);
    writeIsOpen(nextIsOpen);
  };

  return [isOpen, setIsOpen];
}

/** 저장된 열림 여부 — 없거나 형식이 다르면 기본값 */
function readIsOpen(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_IS_OPEN;
    const parsed = LayoutSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.isSidebarOpen : DEFAULT_IS_OPEN;
  } catch {
    return DEFAULT_IS_OPEN;
  }
}

/** 열림 여부 저장 — storage 를 쓸 수 없으면 조용히 넘어간다 */
function writeIsOpen(isOpen: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ isSidebarOpen: isOpen }));
  } catch {
    // 저장 못 해도 이번 실행 동안은 state 로 유지된다
  }
}
