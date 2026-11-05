/**
 * [테스트 도우미] 모든 메서드가 vi.fn 인 가짜 IBrowserDriver — 도구가 어떤 드라이버 메서드를 부르는지 확인한다.
 * 실제 브라우저 동작은 src/main/browser/__tests__ 가 headless chromium 으로 검증한다.
 */
import { vi } from 'vitest';

import type { IBrowserDriver, TActionResult } from '@shared/tools';

export const FAKE_RESULT: TActionResult = { ok: true, text: '가짜 결과' };

/** 행동 메서드는 FAKE_RESULT 를 돌려준다 */
export function createFakeDriver(): IBrowserDriver {
  const act = () => vi.fn(async () => FAKE_RESULT);
  return {
    snapshot: act(),
    readText: act(),
    navigate: act(),
    goBack: act(),
    click: act(),
    typeText: act(),
    selectOption: act(),
    pressKey: act(),
    scroll: act(),
    waitFor: act(),
    listTabs: act(),
    switchTab: act(),
    openTab: act(),
    resolveTarget: vi.fn(async () => null),
    getPageInfo: vi.fn(async () => ({ url: 'about:blank', title: '' })),
    takeScreenshot: vi.fn(async () => ({ ok: true as const, pngBase64: '', width: 1280, height: 800 })),
    clickAt: act(),
    typeRaw: act(),
    pressRaw: act(),
    scrollAt: act(),
    moveTo: act(),
    resolvePointTarget: vi.fn(async () => null),
    isInViewport: vi.fn(async () => true),
    showOverlay: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  };
}

/** 도구 설명의 `Example input: {...}` JSON */
export function getExampleInput(description: string): unknown {
  const matched = /Example input: (\{.*\})/.exec(description);
  if (!matched?.[1]) throw new Error('설명에 예시 입력이 없습니다');
  return JSON.parse(matched[1]);
}
