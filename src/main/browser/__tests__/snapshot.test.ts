import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { showCursor, showHighlight } from '../overlay';
import { takeSnapshot, TRUNCATED_MARK } from '../snapshot';
import { OPEN_DIALOG_MARK } from '../snapshotCompact';

import { findRef, getFixtureUrl } from './helpers';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

beforeEach(async () => {
  page = await browser.newPage();
});

afterEach(async () => {
  await page.close();
});

function getText(result: Awaited<ReturnType<typeof takeSnapshot>>): string {
  if (!result.ok) throw new Error(result.reason);
  return result.text;
}

describe('takeSnapshot', () => {
  it('첫 줄에 URL 과 제목을 둔다', async () => {
    await page.goto(getFixtureUrl('browser-form.html'));
    const text = getText(await takeSnapshot(page));
    expect(text.split('\n')[0]).toBe(`URL: ${getFixtureUrl('browser-form.html')} / 제목: 브라우저 폼 픽스처`);
  });

  it('요소마다 ref 를 붙인다', async () => {
    await page.goto(getFixtureUrl('browser-form.html'));
    const text = getText(await takeSnapshot(page));
    expect(text).toMatch(/- button "예약 확정" \[ref=e\d+\]/);
    expect(text).toMatch(/- link "두 번째 페이지" \[ref=e\d+\]/);
  });

  it('12,000 자를 넘으면 잘라서 잘림 표시를 붙인다', async () => {
    await page.goto(getFixtureUrl('browser-long.html'));
    const text = getText(await takeSnapshot(page));
    expect(text.endsWith(TRUNCATED_MARK)).toBe(true);
    expect(text.length).toBe(12_000 + TRUNCATED_MARK.length);
  });

  it('잘림 표시는 scroll 대신 ref 부분 보기·read_text 를 안내한다', () => {
    expect(TRUNCATED_MARK).toContain('snapshot 에 ref 를 주면');
    expect(TRUNCATED_MARK).not.toContain('scroll');
  });

  it('짧은 페이지는 자르지 않는다', async () => {
    await page.goto(getFixtureUrl('browser-second.html'));
    expect(getText(await takeSnapshot(page))).not.toContain('잘림');
  });

  it('maxLength 를 주면 그 길이로 자른다', async () => {
    await page.goto(getFixtureUrl('browser-form.html'));
    const text = getText(await takeSnapshot(page, { maxLength: 50 }));
    expect(text).toBe(`${text.slice(0, 50)}${TRUNCATED_MARK}`);
  });

  it('커서·강조 오버레이가 있어도 snapshot 에 나오지 않는다', async () => {
    await page.goto(getFixtureUrl('browser-pointer.html'));
    const before = getText(await takeSnapshot(page));
    await showCursor(page, { x: 80, y: 40 });
    await showHighlight(page, { x: 300, y: 100 });
    expect(getText(await takeSnapshot(page))).toBe(before);
  });
});

describe('takeSnapshot — 날짜 레이어 (spec 015 FR-2~4)', () => {
  /** 긴 본문 뒤에 붙는 날짜 레이어를 연다 */
  async function openLayer(): Promise<void> {
    await page.goto(getFixtureUrl('date-layer.html'));
    await page.getByRole('button', { name: '날짜 선택' }).click();
  }

  it('압축 전 트리는 12,000 자를 넘는 페이지다 (회귀 조건)', async () => {
    await openLayer();
    const raw = await page.ariaSnapshot({ mode: 'ai' });
    expect(raw.length).toBeGreaterThan(12_000);
    expect(raw.indexOf('dialog')).toBeGreaterThan(10_000);
  });

  it('레이어가 열리면 대화상자가 맨 앞에 와서 잘리지 않고 [적용] 버튼이 보인다', async () => {
    await openLayer();
    const text = getText(await takeSnapshot(page));
    expect(text.split('\n')[1]).toBe(OPEN_DIALOG_MARK);
    const applyIndex = text.indexOf('- button "적용"');
    expect(applyIndex).toBeGreaterThan(0);
    expect(applyIndex).toBeLessThan(12_000);
    expect(text).not.toContain('/url: "#none"');
  });

  it('ref 를 주면 그 요소 하위 트리만 돌려주고 그 ref 로 누를 수 있다', async () => {
    await openLayer();
    const full = getText(await takeSnapshot(page));
    const dialogRef = full.match(/- dialog "날짜 선택" \[ref=((?:f\d+)?e\d+)\]/)?.[1] ?? '';
    const part = getText(await takeSnapshot(page, { ref: dialogRef }));
    expect(part).not.toContain('역 안내');
    await page.locator(`aria-ref=${findRef(part, 'link', '17')}`).click();
    await expect(page.locator('#picked').innerText()).resolves.toBe('11월 17일');
  });

  it('부분 snapshot 뒤에는 그 밖의 이전 ref 를 찾지 못한다', async () => {
    await openLayer();
    const full = getText(await takeSnapshot(page));
    const outsideRef = findRef(full, 'button', '날짜 선택');
    const dialogRef = full.match(/- dialog "날짜 선택" \[ref=((?:f\d+)?e\d+)\]/)?.[1] ?? '';
    await takeSnapshot(page, { ref: dialogRef });
    await expect(page.locator(`aria-ref=${outsideRef}`).count()).resolves.toBe(0);
  });

  it('없는 ref 를 주면 snapshot 을 다시 찍으라는 사유로 실패한다', async () => {
    await page.goto(getFixtureUrl('browser-second.html'));
    await takeSnapshot(page);
    await expect(takeSnapshot(page, { ref: 'e999' })).resolves.toEqual({
      ok: false,
      reason: 'ref e999 를 찾을 수 없습니다. snapshot 을 다시 찍어라',
    });
  });
});
