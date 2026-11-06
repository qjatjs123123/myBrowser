import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { findRefLocator } from '../refLocator';

import { findRef, openWithSnapshot } from './helpers';

let browser: Browser;
let page: Page;
let snapshotText = '';

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  snapshotText = await openWithSnapshot(page, 'browser-form.html');
});

afterEach(async () => {
  await page.close();
});

describe('findRefLocator', () => {
  it('snapshot 의 ref 면 그 요소의 locator 를 돌려준다', async () => {
    const locator = await findRefLocator(page, findRef(snapshotText, 'button', '예약 확정'));
    expect(await locator?.textContent()).toBe('예약 확정');
  });

  it('없는 ref 면 null 이다', async () => {
    expect(await findRefLocator(page, 'e99999')).toBeNull();
  });
});
