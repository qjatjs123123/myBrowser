import { errors, type Locator, type Page } from 'playwright-core';

import type {
  TActionResult,
  TClickInput,
  TNavigateInput,
  TPressKeyInput,
  TReadTextInput,
  TScrollInput,
  TSelectOptionInput,
  TTypeTextInput,
  TWaitForInput,
} from '@shared/tools';

import { DEFAULT_TIMEOUT_MS } from './browserConstants';
import { findRefLocator } from './refLocator';

/** 행동 함수 기본 타임아웃 — driver 의 새 탭 대기도 같은 값을 쓴다 */
const READ_TEXT_MAX_LENGTH = 4000;
const HALF_SCROLL_RATIO = 0.5;

/** 행동 함수 공통 옵션 — 테스트가 타임아웃을 줄일 때만 쓴다 */
export interface IActionOptions {
  timeoutMs?: number;
}

/** 모델에 그대로 보여 줄 실패 사유 — playwright 오류 대신 이 문장을 reason 으로 쓴다 */
export class ActionError extends Error {}

/** [실패 결과] 행동 중 생긴 오류를 `{ ok:false, reason }` 으로 — 실패는 throw 하지 않는다 (rules/electron/main.md) */
export function toActionFailure(error: unknown): { ok: false; reason: string } {
  if (error instanceof ActionError) return { ok: false, reason: error.message };
  const firstLine = (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
  if (error instanceof errors.TimeoutError) return { ok: false, reason: `시간 초과: ${firstLine}` };
  return { ok: false, reason: firstLine };
}

/** [ref → locator] 마지막 snapshot 의 ref 로 요소를 찾는다 — 없으면 snapshot 을 다시 찍으라는 사유로 실패 */
export async function resolveRefLocator(page: Page, ref: string): Promise<Locator> {
  const locator = await findRefLocator(page, ref);
  if (!locator) throw new ActionError(`ref ${ref} 를 찾을 수 없습니다. snapshot 을 다시 찍어라`);
  return locator;
}

/** [read_text] ref 요소(없으면 본문) innerText — 4k 자 제한 */
export async function readText(
  page: Page,
  input: TReadTextInput,
  options: IActionOptions = {},
): Promise<TActionResult> {
  return runAction(async () => {
    const locator = input.ref === undefined ? page.locator('body') : await resolveRefLocator(page, input.ref);
    const text = await locator.innerText({ timeout: getTimeout(options) });
    return text.length > READ_TEXT_MAX_LENGTH ? `${text.slice(0, READ_TEXT_MAX_LENGTH)}\n[... 잘림]` : text;
  });
}

/** [navigate] 대상 탭을 url 로 이동 — domcontentloaded 까지 기다린다 */
export async function navigate(
  page: Page,
  input: TNavigateInput,
  options: IActionOptions = {},
): Promise<TActionResult> {
  return runAction(async () => {
    await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: getTimeout(options) });
    return `이동함: ${page.url()} — ${await page.title()}`;
  });
}

/** [go_back] 뒤로 가기 — 돌아갈 기록이 없으면 실패 */
export async function goBack(page: Page, options: IActionOptions = {}): Promise<TActionResult> {
  return runAction(async () => {
    const before = page.url();
    const response = await page.goBack({ waitUntil: 'domcontentloaded', timeout: getTimeout(options) });
    if (response === null && page.url() === before) throw new ActionError('뒤로 갈 페이지가 없습니다');
    return `뒤로 감: ${page.url()}`;
  });
}

/** [click] ref 요소 클릭 — 이동했으면 새 URL 을 덧붙인다 */
export async function click(page: Page, input: TClickInput, options: IActionOptions = {}): Promise<TActionResult> {
  return runAction(async () => {
    const locator = await resolveRefLocator(page, input.ref);
    const before = page.url();
    await locator.click({ timeout: getTimeout(options) });
    return `클릭함${await describeNavigation(page, before, options)}`;
  });
}

/** [type_text] ref 입력칸을 text 로 채운다 — submit 이면 그 칸에서 Enter */
export async function typeText(
  page: Page,
  input: TTypeTextInput,
  options: IActionOptions = {},
): Promise<TActionResult> {
  return runAction(async () => {
    const locator = await resolveRefLocator(page, input.ref);
    const before = page.url();
    await locator.fill(input.text, { timeout: getTimeout(options) });
    if (!input.submit) return '입력함';
    await locator.press('Enter', { timeout: getTimeout(options) });
    return `입력함 (제출)${await describeNavigation(page, before, options)}`;
  });
}

/** [select_option] ref select 에서 value 또는 보이는 글자로 선택 */
export async function selectOption(
  page: Page,
  input: TSelectOptionInput,
  options: IActionOptions = {},
): Promise<TActionResult> {
  return runAction(async () => {
    const locator = await resolveRefLocator(page, input.ref);
    const selectedList = await locator.selectOption(input.valueList, { timeout: getTimeout(options) });
    return `선택함: ${selectedList.join(', ')}`;
  });
}

/** [press_key] 포커스된 요소에 키 입력 — Enter 는 이동을 기다린다 */
export async function pressKey(
  page: Page,
  input: TPressKeyInput,
  options: IActionOptions = {},
): Promise<TActionResult> {
  return runAction(async () => {
    const before = page.url();
    await page.keyboard.press(input.key);
    const navigation = input.key === 'Enter' ? await describeNavigation(page, before, options) : '';
    return `눌렀음: ${input.key}${navigation}`;
  });
}

/** [scroll] 한 화면(page) 또는 반 화면(half) 위·아래로 */
export async function scroll(page: Page, input: TScrollInput): Promise<TActionResult> {
  return runAction(async () => {
    const ratio = (input.amount === 'half' ? HALF_SCROLL_RATIO : 1) * (input.direction === 'up' ? -1 : 1);
    await page.evaluate(scrollByViewport, ratio);
    return '스크롤함';
  });
}

/** [wait_for] text 가 보일 때까지(ms 가 있으면 그만큼, 없으면 기본 타임아웃) 또는 ms 만큼 기다린다 */
export async function waitFor(page: Page, input: TWaitForInput, options: IActionOptions = {}): Promise<TActionResult> {
  return runAction(async () => {
    if (input.text === undefined) {
      await page.waitForTimeout(input.ms ?? 0);
      return `기다림: ${input.ms}ms`;
    }
    const timeout = input.ms ?? getTimeout(options);
    await waitForText(page, input.text, timeout);
    return `나타남: ${input.text}`;
  });
}

async function waitForText(page: Page, text: string, timeout: number): Promise<void> {
  try {
    await page.getByText(text).first().waitFor({ state: 'visible', timeout });
  } catch (error) {
    if (!(error instanceof errors.TimeoutError)) throw error;
    throw new ActionError(`'${text}' 이(가) ${timeout / 1000}초 안에 나타나지 않았습니다`);
  }
}

/** 행동 본문을 감싸 성공 문장은 `{ ok:true }`, 오류는 `{ ok:false, reason }` 으로 — pointer.ts 도 쓴다 */
export async function runAction(work: () => Promise<string>): Promise<TActionResult> {
  try {
    return { ok: true, text: await work() };
  } catch (error) {
    return toActionFailure(error);
  }
}

/** 행동이 이동을 일으켰으면 문서가 뜰 때까지 기다리고 ` — 이동: {url}` 을, 아니면 '' */
export async function describeNavigation(page: Page, before: string, options: IActionOptions): Promise<string> {
  await page.waitForLoadState('domcontentloaded', { timeout: getTimeout(options) }).catch(() => undefined);
  return page.url() === before ? '' : ` — 이동: ${page.url()}`;
}

function getTimeout(options: IActionOptions): number {
  return options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}

/** 페이지 안에서 실행 — 직렬화되므로 바깥을 참조하지 않는다 */
function scrollByViewport(ratio: number): void {
  const view = globalThis as unknown as { innerHeight: number; scrollBy(x: number, y: number): void };
  view.scrollBy(0, Math.round(view.innerHeight * ratio));
}
