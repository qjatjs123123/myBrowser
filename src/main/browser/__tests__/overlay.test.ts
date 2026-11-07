import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearHighlight, ensureOverlay, getRefCenter, showCursor, showHighlight } from '../overlay';

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
  await page.goto(getFixtureUrl('browser-pointer.html'));
});

afterEach(async () => {
  if (!page.isClosed()) await page.close();
});

// main tsconfig 은 DOM lib 이 없어 페이지 안 식은 문자열로 보낸다 (actions.test.ts 와 같은 방식)
const HOST = "document.querySelector('[data-mybrowser-overlay]')";

const countHosts = () => page.evaluate("document.querySelectorAll('[data-mybrowser-overlay]').length");

interface IPartStyle {
  display: string;
  left: string;
  top: string;
  width: string;
  height: string;
}

/** shadow root 안 부품의 인라인 스타일 */
const readPart = (part: string) =>
  page.evaluate(`(() => {
    const el = ${HOST}?.shadowRoot?.querySelector('[data-part=${part}]');
    if (!el) return null;
    const { display, left, top, width, height } = el.style;
    return { display, left, top, width, height };
  })()`) as Promise<IPartStyle | null>;

const readClickIdList = () => page.evaluate('window.__clickLog.map((item) => item.id)');

describe('ensureOverlay', () => {
  it('여러 번 불러도 호스트는 1개만 주입한다', async () => {
    await ensureOverlay(page);
    await ensureOverlay(page);
    await showCursor(page, { x: 10, y: 10 });
    expect(await countHosts()).toBe(1);
  });

  it('호스트는 shadow root 를 갖고 aria-hidden·pointer-events none 이다', async () => {
    await ensureOverlay(page);
    const info = await page.evaluate(`(() => {
      const host = ${HOST};
      return {
        hasShadow: host.shadowRoot !== null,
        ariaHidden: host.getAttribute('aria-hidden'),
        pointerEvents: getComputedStyle(host).pointerEvents,
      };
    })()`);
    expect(info).toEqual({ hasShadow: true, ariaHidden: 'true', pointerEvents: 'none' });
  });

  it('메인 프레임이 이동하면 새 문서에 다시 주입한다', async () => {
    await ensureOverlay(page);
    await page.goto(getFixtureUrl('browser-second.html'));
    await page.waitForSelector('[data-mybrowser-overlay]', { state: 'attached', timeout: 5000 });
    expect(await countHosts()).toBe(1);
  });
});

describe('showCursor', () => {
  it('커서를 처음엔 숨기고 showCursor 하면 그 좌표로 보인다', async () => {
    await ensureOverlay(page);
    expect(await readPart('cursor')).toMatchObject({ display: 'none' });
    await showCursor(page, { x: 80, y: 40 });
    expect(await readPart('cursor')).toMatchObject({ display: 'block', left: '80px', top: '40px' });
  });

  it('커서가 버튼 위에 있어도 그 좌표 클릭은 버튼에 간다', async () => {
    await showCursor(page, { x: 80, y: 40 });
    await page.mouse.click(80, 40);
    expect(await readClickIdList()).toEqual(['confirm']);
  });

  it('페이지가 닫혀 있어도 throw 하지 않는다', async () => {
    await page.close();
    await expect(showCursor(page, { x: 1, y: 1 })).resolves.toBeUndefined();
  });
});

describe('showHighlight / clearHighlight', () => {
  it('ref 를 주면 그 요소 영역(여백 4px)을 강조한다', async () => {
    const ref = findRef(await page.ariaSnapshot({ mode: 'ai' }), 'button', '예약 확정');
    await showHighlight(page, { ref });
    expect(await readPart('highlight')).toEqual({
      display: 'block',
      left: '16px',
      top: '16px',
      width: '128px',
      height: '48px',
    });
  });

  it('좌표를 주면 그 둘레 40px 상자(여백 4px)를 강조한다', async () => {
    await showHighlight(page, { x: 300, y: 100 });
    expect(await readPart('highlight')).toMatchObject({ display: 'block', left: '276px', top: '76px', width: '48px' });
  });

  it('clearHighlight 하면 강조가 사라지고 커서는 남는다', async () => {
    await showCursor(page, { x: 5, y: 5 });
    await showHighlight(page, { x: 300, y: 100 });
    await clearHighlight(page);
    expect(await readPart('highlight')).toMatchObject({ display: 'none' });
    expect(await readPart('cursor')).toMatchObject({ display: 'block' });
  });

  it('없는 ref 면 강조하지 않고 throw 하지 않는다', async () => {
    await expect(showHighlight(page, { ref: 'e999' })).resolves.toBeUndefined();
    expect(await countHosts()).toBe(0);
  });
});

describe('getRefCenter', () => {
  it('ref 요소의 중심 CSS 좌표를 돌려준다', async () => {
    const ref = findRef(await page.ariaSnapshot({ mode: 'ai' }), 'button', '예약 확정');
    await expect(getRefCenter(page, ref)).resolves.toEqual({ x: 80, y: 40 });
  });
});

describe('showHighlight 프레임 접두사 ref (spec 015 FR-1)', () => {
  it('iframe 안 버튼의 f-ref 면 메인 페이지 좌표로 그 버튼을 강조한다', async () => {
    await page.goto(getFixtureUrl('browser-frame.html'));
    const ref = findRef(await page.ariaSnapshot({ mode: 'ai' }), 'button', '다음');
    expect(ref).toMatch(/^f\d+e\d+$/);
    await showHighlight(page, { ref });
    // iframe left 100 + 버튼 left 160 − 여백 4, top 200 + 20 − 4, 120×40 + 8
    expect(await readPart('highlight')).toEqual({
      display: 'block',
      left: '256px',
      top: '216px',
      width: '128px',
      height: '48px',
    });
  });
});
