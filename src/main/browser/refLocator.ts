import type { Locator, Page } from 'playwright-core';

/**
 * snapshot 의 ref(`e12`)로 요소를 찾는다 — 없으면 null.
 * 같은 ref 가 여러 요소에 걸리면 첫 요소를 쓴다 (actions·target·overlay 공통).
 */
export async function findRefLocator(page: Page, ref: string): Promise<Locator | null> {
  const locator = page.locator(`aria-ref=${ref}`);
  if ((await locator.count()) === 0) return null;
  return locator.first();
}
