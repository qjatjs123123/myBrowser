import { chromium, errors, type Browser, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  click,
  goBack,
  navigate,
  pressKey,
  readText,
  scroll,
  selectOption,
  TIMEOUT_REASON,
  toActionFailure,
  typeText,
  waitFor,
} from '../actions';

import { findRef, getFixtureUrl, openWithSnapshot } from './helpers';

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

const ref = (role: string, name: string) => findRef(snapshotText, role, name);
const readStatus = () => page.locator('#status').innerText();
const FAST = { timeoutMs: 1000 };

describe('click', () => {
  it('ref 버튼을 누르면 클릭함을 돌려주고 페이지에 반영된다', async () => {
    await expect(click(page, { ref: ref('button', '예약 확정') })).resolves.toEqual({ ok: true, text: '클릭함' });
    expect(await readStatus()).toBe('확정 눌림');
  });

  it('링크를 누르면 새 URL 을 덧붙인다', async () => {
    const result = await click(page, { ref: ref('link', '두 번째 페이지') });
    expect(result).toEqual({ ok: true, text: `클릭함 — 이동: ${getFixtureUrl('browser-second.html')}` });
  });

  it('없는 ref 면 snapshot 을 다시 찍으라는 사유로 실패한다', async () => {
    await expect(click(page, { ref: 'e999' }, FAST)).resolves.toEqual({
      ok: false,
      reason: 'ref e999 를 찾을 수 없습니다. snapshot 을 다시 찍어라',
    });
  });
});

describe('typeText', () => {
  it('입력칸을 채우고 입력함을 돌려준다', async () => {
    await expect(typeText(page, { ref: ref('searchbox', '검색어'), text: '강남역' })).resolves.toEqual({
      ok: true,
      text: '입력함',
    });
    expect(await page.locator('#query').inputValue()).toBe('강남역');
  });

  it('submit 이면 Enter 로 폼을 제출한다', async () => {
    const result = await typeText(page, { ref: ref('searchbox', '검색어'), text: '맛집', submit: true });
    expect(result.ok).toBe(true);
    expect(await readStatus()).toBe('제출됨: 맛집');
  });
});

describe('selectOption', () => {
  it('value 로 고르면 선택한 값을 돌려준다', async () => {
    await expect(selectOption(page, { ref: ref('combobox', '인원'), valueList: ['2'] })).resolves.toEqual({
      ok: true,
      text: '선택함: 2',
    });
    expect(await readStatus()).toBe('인원: 2');
  });

  it('보이는 글자로도 고른다', async () => {
    await selectOption(page, { ref: ref('combobox', '인원'), valueList: ['3명'] });
    expect(await readStatus()).toBe('인원: 3');
  });
});

describe('pressKey', () => {
  it('포커스된 버튼에서 Enter 를 누르면 그 버튼이 눌린다', async () => {
    await page.locator('#pay-form button[type=submit]').focus();
    await expect(pressKey(page, { key: 'Tab' })).resolves.toEqual({ ok: true, text: '눌렀음: Tab' });
    await pressKey(page, { key: 'Enter' });
    expect(await readStatus()).toBe('확정 눌림');
  });
});

describe('scroll', () => {
  it('아래로 한 화면 스크롤하면 scrollY 가 늘어난다', async () => {
    await page.goto(getFixtureUrl('browser-long.html'));
    await expect(scroll(page, { direction: 'down' })).resolves.toEqual({ ok: true, text: '스크롤함' });
    expect(await page.evaluate('window.scrollY')).toBeGreaterThan(0);
  });

  it('반 화면은 한 화면의 절반만큼 움직인다', async () => {
    await page.goto(getFixtureUrl('browser-long.html'));
    await scroll(page, { direction: 'down', amount: 'half' });
    const [scrollY, innerHeight] = (await page.evaluate('[window.scrollY, window.innerHeight]')) as number[];
    expect(scrollY).toBe(Math.round((innerHeight ?? 0) / 2));
  });
});

describe('waitFor', () => {
  it('글이 나타나면 나타남을 돌려준다', async () => {
    await page.getByRole('button', { name: '늦게 보이기' }).click();
    await expect(waitFor(page, { text: '늦게 나온 글' }, FAST)).resolves.toEqual({
      ok: true,
      text: '나타남: 늦게 나온 글',
    });
  });

  it('ms 안에 글이 안 나타나면 실패한다', async () => {
    await expect(waitFor(page, { text: '없는 글', ms: 300 })).resolves.toEqual({
      ok: false,
      reason: "'없는 글' 이(가) 0.3초 안에 나타나지 않았습니다",
    });
  });

  it('ms 만 주면 그만큼 기다린다', async () => {
    await expect(waitFor(page, { ms: 100 })).resolves.toEqual({ ok: true, text: '기다림: 100ms' });
  });
});

describe('readText', () => {
  it('ref 가 없으면 본문 글을 읽는다', async () => {
    const result = await readText(page, {});
    expect(result.ok && result.text).toContain('예약 페이지');
  });

  it('ref 요소의 글만 읽는다', async () => {
    const statusRef = snapshotText.match(/- paragraph \[ref=(e\d+)\]: 대기/)?.[1] ?? 'e0';
    await expect(readText(page, { ref: statusRef })).resolves.toEqual({ ok: true, text: '대기' });
  });

  it('4,000 자를 넘으면 자른다', async () => {
    await page.goto(getFixtureUrl('browser-long.html'));
    const result = await readText(page, {});
    expect(result.ok && result.text.endsWith('\n[... 잘림]')).toBe(true);
  });
});

describe('navigate·goBack', () => {
  it('navigate 는 이동한 URL 과 제목을 돌려준다', async () => {
    const url = getFixtureUrl('browser-second.html');
    await expect(navigate(page, { url })).resolves.toEqual({ ok: true, text: `이동함: ${url} — 두 번째` });
  });

  it('goBack 은 이전 페이지로 돌아간다', async () => {
    await navigate(page, { url: getFixtureUrl('browser-second.html') });
    await expect(goBack(page)).resolves.toEqual({ ok: true, text: `뒤로 감: ${getFixtureUrl('browser-form.html')}` });
  });

  it('돌아갈 기록이 없으면 실패한다', async () => {
    const fresh = await browser.newPage();
    await expect(goBack(fresh, FAST)).resolves.toEqual({ ok: false, reason: '뒤로 갈 페이지가 없습니다' });
    await fresh.close();
  });
});

describe('프레임 접두사 ref (spec 015 FR-1)', () => {
  const F_REF = /^f\d+e\d+$/;

  it('페이지를 다시 열어 f-ref 가 매겨져도 그 ref 로 링크를 누른다', async () => {
    await page.goto(getFixtureUrl('browser-frame.html'));
    const text = await page.ariaSnapshot({ mode: 'ai' });
    const linkRef = findRef(text, 'link', '다음 페이지');
    expect(linkRef).toMatch(F_REF);
    const result = await click(page, { ref: linkRef });
    expect(result).toEqual({ ok: true, text: `클릭함 — 이동: ${getFixtureUrl('browser-second.html')}` });
  });

  it('iframe(srcdoc) 안 버튼을 f-ref 로 누른다', async () => {
    await page.goto(getFixtureUrl('browser-frame.html'));
    const buttonRef = findRef(await page.ariaSnapshot({ mode: 'ai' }), 'button', '다음');
    expect(buttonRef).toMatch(F_REF);
    await expect(click(page, { ref: buttonRef })).resolves.toEqual({ ok: true, text: '클릭함' });
    const frame = page.frames().find((item) => item !== page.mainFrame());
    expect(await frame?.evaluate('window.__clickLog')).toEqual(['next']);
  });
});

describe('가려진·보이지 않는 요소 클릭 사유 (spec 025 FR-3)', () => {
  it('위에 겹친 link 가 가로막는 textbox 를 누르면 가로막힘 사유다', async () => {
    const tree = await openWithSnapshot(page, 'korail-layer.html');
    const result = await click(page, { ref: findRef(tree, 'textbox', '출발일') }, { timeoutMs: 1000 });
    expect(result).toEqual({ ok: false, reason: TIMEOUT_REASON.intercepted });
  });

  it('snapshot 뒤 숨겨진 버튼을 누르면 보이지 않는 요소 사유다', async () => {
    const tree = await openWithSnapshot(page, 'korail-layer.html');
    const ref = findRef(tree, 'button', '숨길 버튼');
    await page.locator('#hidden-target').evaluate((el) => {
      (el as { style: { visibility: string } }).style.visibility = 'hidden';
    });
    const result = await click(page, { ref }, { timeoutMs: 1000 });
    expect(result).toEqual({ ok: false, reason: TIMEOUT_REASON.notVisible });
  });

  it('원인이 없는 시간 초과는 첫 줄을 그대로 쓴다', () => {
    const error = new errors.TimeoutError('locator.click: Timeout 10000ms exceeded.\nCall log:\n  - waiting');
    expect(toActionFailure(error)).toEqual({ ok: false, reason: '시간 초과: locator.click: Timeout 10000ms exceeded.' });
  });
});
