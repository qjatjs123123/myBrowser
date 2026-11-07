import type { Page } from 'playwright-core';

import type { TActionResult } from '@shared/tools';

import { resolveRefLocator, toActionFailure } from './actions';
import { DEFAULT_TIMEOUT_MS } from './browserConstants';
import { compactSnapshot } from './snapshotCompact';

const DEFAULT_MAX_LENGTH = 12_000;
/** 잘림 안내 — scroll 은 이미 트리에 있는 화면 밖 내용을 더 보여 주지 않는다 (spec 015 FR-4) */
export const TRUNCATED_MARK = '\n[... 잘림 — snapshot 에 ref 를 주면 그 부분만, read_text 로 글만 본다]';

export interface ITakeSnapshotOptions {
  /** 주면 그 요소 하위 트리만 — 이 호출로 그 밖의 이전 ref 는 무효가 된다 (Playwright 가 ref 표를 새로 만든다) */
  ref?: string;
  maxLength?: number;
  timeoutMs?: number;
}

/**
 * [snapshot] 첫 줄 `URL: … / 제목: …` + ref 가 붙은 접근성 트리(`ariaSnapshot({ mode: 'ai' })`)를 압축한 것.
 * 이 호출이 ref(e2 …)를 새로 매기므로 이후 행동은 마지막 snapshot 의 ref 로 요소를 찾는다.
 * 열린 대화상자가 있으면 맨 앞에 싣고, maxLength 를 넘으면 잘라 표시한다 (spec 015 FR-2~4).
 */
export async function takeSnapshot(
  page: Page,
  { ref, maxLength = DEFAULT_MAX_LENGTH, timeoutMs = DEFAULT_TIMEOUT_MS }: ITakeSnapshotOptions = {},
): Promise<TActionResult> {
  try {
    const source = ref === undefined ? page : await resolveRefLocator(page, ref);
    const tree = await source.ariaSnapshot({ mode: 'ai', timeout: timeoutMs });
    const text = `URL: ${page.url()} / 제목: ${await page.title()}\n${compactSnapshot(tree)}`;
    return { ok: true, text: truncate(text, maxLength) };
  } catch (error) {
    return toActionFailure(error);
  }
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}${TRUNCATED_MARK}` : text;
}
