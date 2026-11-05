import type { Page } from 'playwright-core';

import type { IPoint, TActionResult } from '@shared/tools';

import { ActionError, describeNavigation, runAction, type IActionOptions } from './actions';
import type { ICssPoint } from './overlay';

/** 마우스 클릭은 locator.click 과 달리 예정된 이동을 기다리지 않는다 — 이동이 시작되는지 이만큼 본다 */
const NAVIGATION_GRACE_MS = 300;
/** 스크롤 1칸(xdotool 휠 1회)의 px */
const SCROLL_STEP_PX = 100;

/** 좌표 행동 공통 옵션 — scale = CSS px / 스크린샷 px (스크린샷 전에는 1) */
export interface IPointerOptions extends IActionOptions {
  scale?: number;
}

export type TScrollDirection = 'up' | 'down' | 'left' | 'right';

/** 스크린샷 픽셀 좌표 → CSS px */
export function toCssPoint(point: IPoint, scale = 1): ICssPoint {
  return { x: point.x * scale, y: point.y * scale };
}

/** [픽셀 클릭] 좌표를 1번·2번 클릭 — 이동했으면 새 URL 을 덧붙인다 */
export async function clickAt(
  page: Page,
  input: IPoint & { count: 1 | 2 },
  options: IPointerOptions = {},
): Promise<TActionResult> {
  return runAction(async () => {
    const { x, y } = toCssPoint(input, options.scale);
    const before = page.url();
    await page.mouse.click(x, y, { clickCount: input.count });
    await waitForNavigationStart(page, before);
    const label = input.count === 2 ? '더블클릭함' : '클릭함';
    return `${label} (${input.x}, ${input.y})${await describeNavigation(page, before, options)}`;
  });
}

async function waitForNavigationStart(page: Page, before: string): Promise<void> {
  const isMoved = (url: URL) => url.href !== before;
  await page.waitForURL(isMoved, { waitUntil: 'commit', timeout: NAVIGATION_GRACE_MS }).catch(() => undefined);
}

/** [픽셀 입력] 포커스된 요소에 글자를 친다 — `\n` 은 Enter 로 눌린다 */
export async function typeRaw(page: Page, input: { text: string }): Promise<TActionResult> {
  return runAction(async () => {
    await page.keyboard.type(input.text);
    return `입력함 (${input.text.length}자)`;
  });
}

/** [픽셀 키] xdotool 식 키(공백으로 여러 개, `+` 로 조합)를 Playwright 키로 바꿔 차례로 누른다 */
export async function pressRaw(page: Page, input: { key: string }): Promise<TActionResult> {
  return runAction(async () => {
    const comboList = input.key.trim().split(/\s+/).filter(Boolean).map(convertXdotoolKey);
    if (comboList.length === 0) throw new ActionError('누를 키가 없습니다');
    for (const combo of comboList) await page.keyboard.press(combo);
    return `눌렀음: ${input.key}`;
  });
}

/** [픽셀 스크롤] 좌표로 커서를 옮긴 뒤 휠을 amount 칸 굴린다 */
export async function scrollAt(
  page: Page,
  input: IPoint & { direction: TScrollDirection; amount: number },
  options: IPointerOptions = {},
): Promise<TActionResult> {
  return runAction(async () => {
    const { x, y } = toCssPoint(input, options.scale);
    await page.mouse.move(x, y);
    const distance = input.amount * SCROLL_STEP_PX;
    const sign = input.direction === 'up' || input.direction === 'left' ? -1 : 1;
    const isVertical = input.direction === 'up' || input.direction === 'down';
    await page.mouse.wheel(isVertical ? 0 : sign * distance, isVertical ? sign * distance : 0);
    return `스크롤함: ${input.direction} ${input.amount}`;
  });
}

/** [픽셀 커서 이동] 마우스를 좌표로 옮긴다 (hover) */
export async function moveTo(page: Page, input: IPoint, options: IPointerOptions = {}): Promise<TActionResult> {
  return runAction(async () => {
    const { x, y } = toCssPoint(input, options.scale);
    await page.mouse.move(x, y);
    return `커서 이동함 (${input.x}, ${input.y})`;
  });
}

/** 좌표(×scale)가 현재 뷰포트 안인가 — 밖이면 픽셀 행동을 막는다 (SR-6). 읽기 실패면 false */
export async function isInViewport(page: Page, point: IPoint, scale = 1): Promise<boolean> {
  const { x, y } = toCssPoint(point, scale);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  try {
    const [width, height] = (await page.evaluate('[window.innerWidth, window.innerHeight]')) as [number, number];
    return x >= 0 && y >= 0 && x < width && y < height;
  } catch {
    return false;
  }
}

/** xdotool 키 이름(소문자 비교) → Playwright 키 */
const KEY_NAME_MAP: Readonly<Record<string, string>> = {
  ctrl: 'Control',
  control: 'Control',
  alt: 'Alt',
  shift: 'Shift',
  super: 'Meta',
  meta: 'Meta',
  cmd: 'Meta',
  win: 'Meta',
  return: 'Enter',
  enter: 'Enter',
  kp_enter: 'Enter',
  space: 'Space',
  tab: 'Tab',
  escape: 'Escape',
  esc: 'Escape',
  backspace: 'Backspace',
  delete: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  page_up: 'PageUp',
  prior: 'PageUp',
  page_down: 'PageDown',
  next: 'PageDown',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

/** `ctrl+a` → `Control+a`, `Return` → `Enter`, `F5` 그대로. 모르는 여러 글자 키면 ActionError */
export function convertXdotoolKey(combo: string): string {
  return combo.split('+').map(convertKeyPart).join('+');
}

function convertKeyPart(part: string): string {
  const mapped = KEY_NAME_MAP[part.toLowerCase()];
  if (mapped) return mapped;
  if (part.length === 1) return part;
  if (/^f([1-9]|1[0-2])$/i.test(part)) return part.toUpperCase();
  throw new ActionError(`알 수 없는 키: ${part}`);
}
