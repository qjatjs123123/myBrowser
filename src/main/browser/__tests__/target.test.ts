import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { showCursor } from '../overlay';
import { resolvePointTarget, resolveTarget } from '../target';

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

const resolveRef = (role: string, name: string) => resolveTarget(page, { ref: findRef(snapshotText, role, name) });

describe('resolveTarget ref', () => {
  it('버튼이면 role·name·text 와 page URL 을 읽는다', async () => {
    const target = await resolveRef('button', '예약 확정');
    expect(target).toMatchObject({
      role: 'button',
      name: '예약 확정',
      text: '예약 확정',
      pageUrl: getFixtureUrl('browser-form.html'),
    });
  });

  it('aria-label 이 있으면 name 은 aria-label, text 는 보이는 글자다', async () => {
    expect(await resolveRef('button', '예약 조회하기')).toMatchObject({ name: '예약 조회하기', text: '조회' });
  });

  it('링크면 해석된 href 를 읽는다', async () => {
    const target = await resolveRef('link', '두 번째 페이지');
    expect(target).toMatchObject({ role: 'link', href: getFixtureUrl('browser-second.html') });
  });

  it('폼 안 입력칸이면 form action 과 그 폼 submit 버튼 글자(formSubmitText)를 읽는다', async () => {
    const target = await resolveRef('searchbox', '검색어');
    expect(target).toMatchObject({
      role: 'searchbox',
      formAction: getFixtureUrl('checkout.html'),
      formSubmitText: '결제하기',
      inputType: 'search',
      fieldName: 'q',
      label: '검색어',
    });
  });

  it('password 입력칸이면 inputType password 와 label 을 읽고 값은 읽지 않는다', async () => {
    await page.locator('#password').fill('secret-value');
    const target = await resolveRef('textbox', '비밀번호');
    expect(target).toMatchObject({ inputType: 'password', label: '비밀번호', fieldName: 'pw', value: '' });
  });

  it('카드번호 입력칸이면 autocomplete 를 읽는다', async () => {
    expect(await resolveRef('textbox', '카드번호')).toMatchObject({ autocomplete: 'cc-number', label: '카드번호' });
  });

  it('폼 밖 요소면 formAction·formSubmitText 가 빈 문자열이다', async () => {
    expect(await resolveRef('button', '예약 확정')).toMatchObject({ formAction: '', formSubmitText: '' });
  });

  it('없는 ref 면 null 이다', async () => {
    await expect(resolveTarget(page, { ref: 'e999' })).resolves.toBeNull();
  });
});

describe('resolveTarget focused', () => {
  it('포커스가 폼 안 입력칸이면 그 폼의 submit 버튼을 돌려준다', async () => {
    await page.locator('#query').focus();
    const target = await resolveTarget(page, { focused: true });
    expect(target).toMatchObject({ role: 'button', name: '결제하기', formAction: getFixtureUrl('checkout.html') });
  });

  it('Tab 으로 포커스한 폼 밖 "예약 확정" 버튼이면 그 버튼 자체를 돌려준다', async () => {
    await page.locator('#pay-form button[type=submit]').focus();
    await page.keyboard.press('Tab');
    const target = await resolveTarget(page, { focused: true });
    expect(target).toMatchObject({ role: 'button', name: '예약 확정', formSubmitText: '' });
  });

  it('포커스된 요소가 없으면(body) null 이다', async () => {
    await expect(resolveTarget(page, { focused: true })).resolves.toBeNull();
  });
});

describe('resolvePointTarget', () => {
  beforeEach(async () => {
    await page.goto(getFixtureUrl('browser-pointer.html'));
  });

  it('좌표의 버튼이면 그 버튼의 role·name 을 읽는다', async () => {
    await expect(resolvePointTarget(page, { x: 80, y: 40 })).resolves.toMatchObject({
      role: 'button',
      name: '예약 확정',
    });
  });

  it('좌표가 canvas 면 name·text 가 빈 값이다', async () => {
    await expect(resolvePointTarget(page, { x: 300, y: 100 })).resolves.toMatchObject({
      role: 'canvas',
      name: '',
      text: '',
    });
  });

  it('오버레이 커서가 그 좌표에 있어도 아래 요소를 읽는다', async () => {
    await showCursor(page, { x: 80, y: 40 });
    await expect(resolvePointTarget(page, { x: 80, y: 40 })).resolves.toMatchObject({ name: '예약 확정' });
  });

  it('scale 을 곱한 CSS 좌표로 찾는다', async () => {
    await expect(resolvePointTarget(page, { x: 40, y: 20 }, 2)).resolves.toMatchObject({ name: '예약 확정' });
  });

  it('뷰포트 밖 좌표면 null 이다', async () => {
    await expect(resolvePointTarget(page, { x: 5000, y: 40 })).resolves.toBeNull();
    await expect(resolvePointTarget(page, { x: -1, y: 40 })).resolves.toBeNull();
  });
});
