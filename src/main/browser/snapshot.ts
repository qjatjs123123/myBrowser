import type { Page } from 'playwright-core';

import type { TActionResult } from '@shared/tools';

import { toActionFailure } from './actions';

const DEFAULT_MAX_LENGTH = 12_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const TRUNCATED_MARK = '\n[... 잘림, scroll 로 더 보기]';

export interface ITakeSnapshotOptions {
  maxLength?: number;
  timeoutMs?: number;
}

/**
 * [snapshot] 첫 줄 `URL: … / 제목: …` + ref 가 붙은 접근성 트리(`page.ariaSnapshot({ mode: 'ai' })`).
 * 이 호출이 ref(e2 …)를 새로 매기므로 이후 행동은 마지막 snapshot 의 ref 로 요소를 찾는다. maxLength 를 넘으면 잘라 표시.
 */
export async function takeSnapshot(
  page: Page,
  { maxLength = DEFAULT_MAX_LENGTH, timeoutMs = DEFAULT_TIMEOUT_MS }: ITakeSnapshotOptions = {},
): Promise<TActionResult> {
  try {
    const tree = await page.ariaSnapshot({ mode: 'ai', timeout: timeoutMs });
    const text = `URL: ${page.url()} / 제목: ${await page.title()}\n${tree}`;
    return { ok: true, text: truncate(text, maxLength) };
  } catch (error) {
    return toActionFailure(error);
  }
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}${TRUNCATED_MARK}` : text;
}
