import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clickAt, convertXdotoolKey, isInViewport, moveTo, pressRaw, scrollAt, typeRaw } from '../pointer';

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
  page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto(getFixtureUrl('browser-pointer.html'));
});

afterEach(async () => {
  await page.close();
});

interface IClickRecord {
  id: string;
  x: number;
  y: number;
  detail: number;
}

const readClickLog = () => page.evaluate('window.__clickLog') as Promise<IClickRecord[]>;

describe('clickAt', () => {
  it('좌표를 클릭하면 픽스처 클릭 기록에 그 요소가 남는다', async () => {
    await expect(clickAt(page, { x: 80, y: 40, count: 1 })).resolves.toEqual({ ok: true, text: '클릭함 (80, 40)' });
    expect(await readClickLog()).toEqual([{ id: 'confirm', x: 80, y: 40, detail: 1 }]);
  });

  it('count 2 면 더블클릭(dblclick 이벤트)한다', async () => {
    await clickAt(page, { x: 300, y: 100, count: 2 });
    expect(await page.evaluate('window.__dblclickLog')).toEqual([{ id: 'calendar' }]);
  });

  it('scale 을 곱한 CSS 좌표를 클릭한다', async () => {
    await clickAt(page, { x: 40, y: 20, count: 1 }, { scale: 2 });
    expect(await readClickLog()).toMatchObject([{ id: 'confirm', x: 80, y: 40 }]);
  });

  it('링크를 클릭해 이동하면 새 URL 을 덧붙인다', async () => {
    const box = await page.locator('#next').boundingBox();
    const result = await clickAt(page, { x: box!.x + 5, y: box!.y + 5, count: 1 });
    expect(result).toMatchObject({
      ok: true,
      text: expect.stringContaining(`이동: ${getFixtureUrl('browser-second.html')}`),
    });
  });
});

describe('typeRaw', () => {
  it('포커스된 입력칸에 글자를 친다', async () => {
    await page.locator('#query').focus();
    await expect(typeRaw(page, { text: '강남' })).resolves.toEqual({ ok: true, text: '입력함 (2자)' });
    expect(await page.locator('#query').inputValue()).toBe('강남');
  });
});

describe('pressRaw', () => {
  it('Return 은 Enter 로 누른다', async () => {
    await pressRaw(page, { key: 'Return' });
    expect(await page.evaluate('window.__keyLog')).toEqual(['Enter']);
  });

  it('ctrl+a 는 Control+a 조합으로 누른다', async () => {
    await pressRaw(page, { key: 'ctrl+a' });
    expect(await page.evaluate('window.__keyLog.at(-1)')).toBe('Control+a');
  });

  it('공백으로 나눈 여러 키를 차례로 누른다', async () => {
    await pressRaw(page, { key: 'Tab KP_Enter' });
    expect(await page.evaluate('window.__keyLog')).toEqual(['Tab', 'Enter']);
  });

  it('모르는 키면 누르지 않고 ok:false 다', async () => {
    await expect(pressRaw(page, { key: 'Hyper_Z' })).resolves.toEqual({ ok: false, reason: '알 수 없는 키: Hyper_Z' });
    expect(await page.evaluate('window.__keyLog')).toEqual([]);
  });
});

describe('convertXdotoolKey', () => {
  it('xdotool 이름을 Playwright 키로 바꾼다 (대소문자 무시)', () => {
    const keyList = ['Return', 'ctrl+shift+Tab', 'space', 'Page_Down', 'BackSpace', 'Up', 'f5', 'a', 'super+l'];
    expect(keyList.map(convertXdotoolKey)).toEqual([
      'Enter',
      'Control+Shift+Tab',
      'Space',
      'PageDown',
      'Backspace',
      'ArrowUp',
      'F5',
      'a',
      'Meta+l',
    ]);
  });
});

describe('scrollAt', () => {
  it('down 3 이면 300px 아래로 스크롤한다', async () => {
    await expect(scrollAt(page, { x: 400, y: 300, direction: 'down', amount: 3 })).resolves.toMatchObject({ ok: true });
    await expect.poll(() => page.evaluate('window.scrollY')).toBe(300);
  });

  it('up 이면 위로 스크롤한다', async () => {
    await page.evaluate('window.scrollTo(0, 500)');
    await scrollAt(page, { x: 400, y: 300, direction: 'up', amount: 2 });
    await expect.poll(() => page.evaluate('window.scrollY')).toBe(300);
  });
});

describe('moveTo', () => {
  it('마우스를 scale 을 곱한 좌표로 옮긴다', async () => {
    await page.evaluate(
      "window.__moveLog = []; document.addEventListener('mousemove', (e) => window.__moveLog.push([e.clientX, e.clientY]))",
    );
    await expect(moveTo(page, { x: 50, y: 30 }, { scale: 2 })).resolves.toEqual({
      ok: true,
      text: '커서 이동함 (50, 30)',
    });
    expect(await page.evaluate('window.__moveLog.at(-1)')).toEqual([100, 60]);
  });
});

describe('isInViewport', () => {
  it('뷰포트 안이면 true, 밖·음수·NaN 이면 false 다', async () => {
    const resultList = await Promise.all([
      isInViewport(page, { x: 799, y: 599 }),
      isInViewport(page, { x: 800, y: 10 }),
      isInViewport(page, { x: -1, y: 10 }),
      isInViewport(page, { x: Number.NaN, y: 10 }),
    ]);
    expect(resultList).toEqual([true, false, false, false]);
  });

  it('scale 을 곱해 판정한다', async () => {
    await expect(isInViewport(page, { x: 500, y: 100 }, 2)).resolves.toBe(false);
  });
});
