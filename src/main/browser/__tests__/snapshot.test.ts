import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { takeSnapshot } from '../snapshot';

import { getFixtureUrl } from './helpers';

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
    expect(text.endsWith('\n[... 잘림, scroll 로 더 보기]')).toBe(true);
    expect(text.length).toBe(12_000 + '\n[... 잘림, scroll 로 더 보기]'.length);
  });

  it('짧은 페이지는 자르지 않는다', async () => {
    await page.goto(getFixtureUrl('browser-second.html'));
    expect(getText(await takeSnapshot(page))).not.toContain('잘림');
  });

  it('maxLength 를 주면 그 길이로 자른다', async () => {
    await page.goto(getFixtureUrl('browser-form.html'));
    const text = getText(await takeSnapshot(page, { maxLength: 50 }));
    expect(text).toBe(`${text.slice(0, 50)}\n[... 잘림, scroll 로 더 보기]`);
  });
});
