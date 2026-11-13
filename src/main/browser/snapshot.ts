import type { Frame, Page } from 'playwright-core';

import type { TActionResult } from '@shared/tools';

import { resolveRefLocator, toActionFailure } from './actions';
import { DEFAULT_TIMEOUT_MS } from './browserConstants';
import { compactSnapshot } from './snapshotCompact';
import { truncateWithActionables } from './snapshotTruncate';

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

/** 비교용 화면 텍스트 최대 길이 */
const SCREEN_TEXT_MAX_LENGTH = 60_000;
/** 비교용으로 읽을 최대 프레임 수 (메인 포함) */
const SCREEN_FRAME_MAX = 10;

/**
 * [화면 텍스트] 클릭 전후 비교용 — 보이는 글(innerText)이라 ref 표를 바꾸지 않는다 (spec 024 SR-1).
 * ariaSnapshot 은 기본 모드여도 aria-ref 표를 초기화해 모델이 들고 있는 ref 가 무효가 되므로 쓰지 않는다.
 * 메인 프레임 다음 하위 프레임(최대 10개)을 이어 붙인다. 메인 프레임을 못 읽으면 null, 하위 프레임 실패는 건너뛴다.
 */
export async function readScreenText(page: Page, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string | null> {
  const [mainFrame, ...childFrameList] = page.frames().slice(0, SCREEN_FRAME_MAX);
  if (!mainFrame) return null;
  const mainText = await readFrameText(mainFrame, timeoutMs);
  if (mainText === null) return null;
  const childTextList = await Promise.all(childFrameList.map((frame) => readFrameText(frame, timeoutMs)));
  const text = [mainText, ...childTextList.filter((item): item is string => item !== null)].join('\n');
  return text.slice(0, SCREEN_TEXT_MAX_LENGTH);
}

async function readFrameText(frame: Frame, timeoutMs: number): Promise<string | null> {
  try {
    return await frame.locator('body').innerText({ timeout: timeoutMs });
  } catch {
    return null;
  }
}

/** 상한을 넘으면 잘림 표시 + 잘린 부분의 누를 수 있는 요소 목록 (spec 025 FR-2) */
function truncate(text: string, maxLength: number): string {
  return truncateWithActionables(text, maxLength, TRUNCATED_MARK);
}
