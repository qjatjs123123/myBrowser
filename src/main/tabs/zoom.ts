import { DEFAULT_ZOOM_PERCENT, type TZoomDirection } from '@shared/ipc/tabs';

/** [확대/축소] Chromium 과 같은 배율 단계(%) — Ctrl+=/-/휠이 한 칸씩 움직인다 (spec 021 FR-10) */
export const ZOOM_PERCENT_LIST = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500] as const;

/**
 * [확대/축소] 현재 배율에서 한 단계 움직인 배율 — 목록 밖 값(예 105)이면 그보다 큰/작은 첫 단계로 간다.
 * 끝 단계에서는 그대로, reset 은 100.
 */
export function getNextZoomPercent(current: number, direction: TZoomDirection): number {
  if (direction === 'reset') return DEFAULT_ZOOM_PERCENT;
  if (direction === 'in') return ZOOM_PERCENT_LIST.find((step) => step > current) ?? current;
  return [...ZOOM_PERCENT_LIST].reverse().find((step) => step < current) ?? current;
}
