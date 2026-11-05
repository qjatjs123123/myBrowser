import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { getFitRatio, readPngSize, takeScreenshot } from '../screenshot';

import { getFixtureUrl } from './helpers';

let browser: Browser;
let context: BrowserContext | null = null;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

afterEach(async () => {
  await context?.close();
  context = null;
});

const PNG_SIGNATURE = '89504e470d0a1a0a';

async function openPage(viewport: { width: number; height: number }, deviceScaleFactor = 1): Promise<Page> {
  context = await browser.newContext({ viewport, deviceScaleFactor });
  const page = await context.newPage();
  await page.goto(getFixtureUrl('browser-pointer.html'));
  return page;
}

async function capture(page: Page) {
  const result = await takeScreenshot(page);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe('takeScreenshot', () => {
  it('상한 안의 뷰포트면 같은 크기 PNG 와 scale 1 을 돌려준다', async () => {
    const result = await capture(await openPage({ width: 800, height: 600 }));
    expect(Buffer.from(result.pngBase64, 'base64').subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
    expect(result).toMatchObject({ width: 800, height: 600, scale: 1 });
  });

  it('1600×1000 뷰포트면 1280×800 으로 줄이고 scale 1.25 를 돌려준다', async () => {
    const result = await capture(await openPage({ width: 1600, height: 1000 }));
    expect(result).toMatchObject({ width: 1280, height: 800, scale: 1.25 });
  });

  it('세로가 더 긴 비율이면 세로 800 에 맞춘다', async () => {
    const result = await capture(await openPage({ width: 1000, height: 1600 }));
    expect(result).toMatchObject({ width: 500, height: 800, scale: 2 });
  });

  it('devicePixelRatio 2 여도 CSS 크기 기준으로 상한 안에 든다', async () => {
    const result = await capture(await openPage({ width: 1600, height: 1000 }, 2));
    expect(result).toMatchObject({ width: 1280, height: 800, scale: 1.25 });
  });

  it('반환한 width·height 는 PNG 헤더의 실제 크기이고 상한 안이다', async () => {
    const result = await capture(await openPage({ width: 1700, height: 900 }));
    expect(readPngSize(result.pngBase64)).toEqual({ width: result.width, height: result.height });
    expect(result.width <= 1280 && result.height <= 800).toBe(true);
  });

  it('스크롤한 상태면 지금 보이는 영역을 찍는다', async () => {
    const page = await openPage({ width: 400, height: 300 });
    const top = await capture(page);
    await page.evaluate('window.scrollTo(0, 1000)');
    const scrolled = await capture(page);
    expect(scrolled.pngBase64).not.toBe(top.pngBase64);
  });

  it('페이지가 닫혔으면 throw 하지 않고 ok:false 를 돌려준다', async () => {
    const page = await openPage({ width: 400, height: 300 });
    await page.close();
    await expect(takeScreenshot(page)).resolves.toMatchObject({ ok: false });
  });
});

describe('getFitRatio', () => {
  it('상한 안이면 1, 넘으면 가로·세로 중 작은 비율이다', () => {
    expect([getFitRatio(1280, 800), getFitRatio(2560, 800), getFitRatio(1280, 1600)]).toEqual([1, 0.5, 0.5]);
  });
});
