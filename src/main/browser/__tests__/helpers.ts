// browser/ 단위 테스트 공용 — headless chromium 과 e2e/fixtures/pages 의 browser-*.html (file://)
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Page } from 'playwright-core';

const PAGES_DIR = resolve(import.meta.dirname, '../../../../e2e/fixtures/pages');

/** 픽스처 페이지의 file:// URL */
export function getFixtureUrl(name: string): string {
  return pathToFileURL(resolve(PAGES_DIR, name)).href;
}

/** snapshot 텍스트에서 `- {role} "{name}" … [ref=eN]` 줄의 ref 를 찾는다 */
export function findRef(snapshotText: string, role: string, name: string): string {
  const line = snapshotText.split('\n').find((item) => item.includes(`- ${role} "${name}"`));
  const ref = line?.match(/\[ref=((?:f\d+)?e\d+)\]/)?.[1];
  if (!ref) throw new Error(`snapshot 에 ${role} "${name}" 이 없습니다:\n${snapshotText}`);
  return ref;
}

/** ref 를 매기려면 snapshot 이 먼저 있어야 한다 — 페이지를 열고 ai 모드 snapshot 을 돌려준다 */
export async function openWithSnapshot(page: Page, name: string): Promise<string> {
  await page.goto(getFixtureUrl(name));
  return page.ariaSnapshot({ mode: 'ai' });
}
