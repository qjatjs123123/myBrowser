import { describe, expect, it } from 'vitest';

import type { IGuardInput } from '@shared/guard/types';
import type { IGuardTarget } from '@shared/tools';

import { checkGuard, GUARD_MESSAGE } from '../guard';

const PAGE_URL = 'https://shop.example.com/store';

/** 빈 필드로 채운 대상 — 테스트마다 필요한 필드만 덮어쓴다 */
function createTarget(patch: Partial<IGuardTarget> = {}): IGuardTarget {
  return {
    role: 'button',
    name: '',
    text: '',
    value: '',
    href: '',
    formAction: '',
    formSubmitText: '',
    inputType: '',
    autocomplete: '',
    fieldName: '',
    label: '',
    pageUrl: PAGE_URL,
    ...patch,
  };
}

function check(patch: Partial<IGuardInput> & Pick<IGuardInput, 'tool' | 'input'>) {
  return checkGuard({ target: null, pageUrl: PAGE_URL, allowedHostList: [], ...patch });
}

describe('checkGuard — 규칙 1 확정·결제 (click)', () => {
  it('“예약 확정” 버튼 클릭이면 실제 텍스트로 require_approval 을 낸다', () => {
    const verdict = check({ tool: 'click', input: { ref: 'e1' }, target: createTarget({ name: '예약 확정' }) });
    expect(verdict).toEqual({
      kind: 'require_approval',
      reason: expect.stringContaining('예약 확정'),
      display: { action: '클릭', target: '예약 확정' },
    });
  });

  it('“예약 조회” 버튼 클릭이면 allow 한다', () => {
    const verdict = check({ tool: 'click', input: { ref: 'e1' }, target: createTarget({ name: '예약 조회' }) });
    expect(verdict).toEqual({ kind: 'allow' });
  });

  it('href 가 /checkout 인 링크 클릭이면 href 를 붙인 display 로 require_approval 을 낸다', () => {
    const target = createTarget({ role: 'link', name: '다음', href: 'https://shop.example.com/checkout' });
    const verdict = check({ tool: 'click', input: { ref: 'e2' }, target });
    expect(verdict).toMatchObject({
      kind: 'require_approval',
      display: { action: '클릭', target: '다음 (https://shop.example.com/checkout)' },
    });
  });

  it('“payment history” 링크 클릭이면 allow 한다', () => {
    const target = createTarget({ role: 'link', text: 'payment history', href: 'https://shop.example.com/history' });
    expect(check({ tool: 'click', input: { ref: 'e3' }, target }).kind).toBe('allow');
  });

  it('“결제 내역” 클릭이면 require_approval 을 낸다 (한국어 부분 일치)', () => {
    const target = createTarget({ role: 'link', text: '결제 내역' });
    expect(check({ tool: 'click', input: { ref: 'e3' }, target }).kind).toBe('require_approval');
  });

  it('pageUrl 이 결제 페이지면 일반 버튼 클릭도 require_approval 을 낸다', () => {
    const pageUrl = 'https://shop.example.com/payment';
    const verdict = check({
      tool: 'click',
      input: { ref: 'e1' },
      target: createTarget({ name: '다음', pageUrl }),
      pageUrl,
    });
    expect(verdict.kind).toBe('require_approval');
  });

  it('form action 이 checkout 이면 require_approval 을 낸다', () => {
    const target = createTarget({ name: '다음', formAction: 'https://shop.example.com/checkout' });
    expect(check({ tool: 'click', input: { ref: 'e1' }, target }).kind).toBe('require_approval');
  });

  it('display.target 은 80자로 자른다', () => {
    const target = createTarget({ text: `결제 ${'가'.repeat(100)}` });
    const verdict = check({ tool: 'click', input: { ref: 'e1' }, target });
    expect(verdict.kind === 'require_approval' && verdict.display.target.length).toBe(80);
  });
});

describe('checkGuard — 규칙 4 삭제·탈퇴', () => {
  it('“회원 탈퇴” 클릭이면 require_approval 을 낸다', () => {
    const verdict = check({ tool: 'click', input: { ref: 'e1' }, target: createTarget({ name: '회원 탈퇴' }) });
    expect(verdict).toMatchObject({ kind: 'require_approval', display: { target: '회원 탈퇴' } });
  });
});

describe('checkGuard — select_option', () => {
  it('“주문” 이 붙은 select 선택이면 선택 display 로 require_approval 을 낸다', () => {
    const target = createTarget({ role: 'combobox', name: '주문 수량' });
    const verdict = check({ tool: 'select_option', input: { ref: 'e4', valueList: ['1'] }, target });
    expect(verdict).toMatchObject({ kind: 'require_approval', display: { action: '선택' } });
  });

  it('일반 select 선택이면 allow 한다', () => {
    const target = createTarget({ role: 'combobox', name: '인원' });
    expect(check({ tool: 'select_option', input: { ref: 'e4', valueList: ['2'] }, target }).kind).toBe('allow');
  });
});

describe('checkGuard — 규칙 2 비밀 입력 (type_text)', () => {
  const input = { ref: 'e5', text: 'abc' };

  it('type=password 이면 block 한다', () => {
    const target = createTarget({ role: 'textbox', inputType: 'password' });
    expect(check({ tool: 'type_text', input, target })).toEqual({ kind: 'block', reason: GUARD_MESSAGE.secretField });
  });

  it('autocomplete=cc-number 이면 block 한다', () => {
    const target = createTarget({ role: 'textbox', autocomplete: 'billing cc-number' });
    expect(check({ tool: 'type_text', input, target }).kind).toBe('block');
  });

  it('label 이 “카드번호” 면 block 한다', () => {
    const target = createTarget({ role: 'textbox', label: '카드번호' });
    expect(check({ tool: 'type_text', input, target }).kind).toBe('block');
  });

  it('name 속성이 user_password 면 block 한다', () => {
    const target = createTarget({ role: 'textbox', fieldName: 'user_password' });
    expect(check({ tool: 'type_text', input, target }).kind).toBe('block');
  });

  it('일반 검색창이면 allow 한다', () => {
    const target = createTarget({ role: 'searchbox', name: '검색어', fieldName: 'q', inputType: 'search' });
    expect(check({ tool: 'type_text', input, target }).kind).toBe('allow');
  });

  it('submit 이고 폼의 submit 버튼이 “결제하기” 면 require_approval 을 낸다', () => {
    const target = createTarget({ role: 'searchbox', name: '검색어', formSubmitText: '결제하기' });
    const verdict = check({ tool: 'type_text', input: { ...input, submit: true }, target });
    expect(verdict).toMatchObject({
      kind: 'require_approval',
      display: { action: '입력 후 제출', target: '결제하기' },
    });
  });

  it('submit 이 없으면 폼의 submit 버튼이 “결제하기” 여도 allow 한다', () => {
    const target = createTarget({ role: 'searchbox', name: '검색어', formSubmitText: '결제하기' });
    expect(check({ tool: 'type_text', input, target }).kind).toBe('allow');
  });
});

describe('checkGuard — press_key', () => {
  it('Enter + 포커스 폼의 submit “주문하기” 면 require_approval 을 낸다', () => {
    const target = createTarget({ name: '주문하기', formSubmitText: '주문하기' });
    const verdict = check({ tool: 'press_key', input: { key: 'Enter' }, target });
    expect(verdict).toMatchObject({ kind: 'require_approval', display: { action: 'Enter 키', target: '주문하기' } });
  });

  it('Enter + 포커스된 폼 밖 버튼 “예약 확정” 이면 require_approval 을 낸다', () => {
    const verdict = check({ tool: 'press_key', input: { key: 'Enter' }, target: createTarget({ name: '예약 확정' }) });
    expect(verdict).toMatchObject({ kind: 'require_approval', display: { target: '예약 확정' } });
  });

  it('Enter + 포커스 대상이 없으면 pageUrl 만 보고 allow 한다', () => {
    expect(check({ tool: 'press_key', input: { key: 'Enter' }, target: null }).kind).toBe('allow');
  });

  it('Enter + 포커스 대상이 없어도 결제 페이지면 require_approval 을 낸다', () => {
    const pageUrl = 'https://shop.example.com/checkout';
    expect(check({ tool: 'press_key', input: { key: 'Enter' }, target: null, pageUrl }).kind).toBe('require_approval');
  });

  it('Tab 이면 포커스 대상이 “예약 확정” 이어도 allow 한다', () => {
    const verdict = check({ tool: 'press_key', input: { key: 'Tab' }, target: createTarget({ name: '예약 확정' }) });
    expect(verdict.kind).toBe('allow');
  });
});

describe('checkGuard — fail-closed', () => {
  it.each([
    ['click', { ref: 'e1' }],
    ['type_text', { ref: 'e1', text: 'a' }],
    ['select_option', { ref: 'e1', valueList: ['a'] }],
  ] as const)('%s 의 target 이 null 이면 block 한다', (tool, input) => {
    expect(check({ tool, input, target: null })).toEqual({ kind: 'block', reason: GUARD_MESSAGE.unknownTarget });
  });

  it('입력 형식이 틀리면 block 한다', () => {
    expect(check({ tool: 'navigate', input: { url: 1 } }).kind).toBe('block');
  });
});

describe('checkGuard — 규칙 3 위험 URL', () => {
  it.each([
    'file:///etc/passwd',
    'chrome://settings',
    'devtools://devtools/bundled/inspector.html',
    'javascript:alert(1)',
    'data:text/html,hi',
    'http://localhost:3000/',
    'http://127.0.0.1:8080/',
    'http://10.0.0.1/',
    'http://192.168.0.1/',
    'http://172.16.0.5/',
    'http://[::1]/',
  ])('navigate %s 는 block 한다', (url) => {
    expect(check({ tool: 'navigate', input: { url } }).kind).toBe('block');
  });

  it('공개 https 주소는 allow 한다', () => {
    expect(check({ tool: 'navigate', input: { url: 'https://www.naver.com/' } }).kind).toBe('allow');
  });

  it('172.32.* 는 사설 대역이 아니라 allow 한다', () => {
    expect(check({ tool: 'navigate', input: { url: 'http://172.32.0.1/' } }).kind).toBe('allow');
  });

  it('allowedHostList 의 127.0.0.1 은 allow 한다', () => {
    const input = { url: 'http://127.0.0.1:4321/a.html' };
    expect(check({ tool: 'navigate', input, allowedHostList: ['127.0.0.1'] }).kind).toBe('allow');
  });

  it('allowedHostList 가 있어도 file: 은 block 한다', () => {
    const input = { url: 'file:///tmp/a.html' };
    expect(check({ tool: 'navigate', input, allowedHostList: ['127.0.0.1'] }).kind).toBe('block');
  });

  it('open_tab 의 url 이 localhost 면 block 한다', () => {
    expect(check({ tool: 'open_tab', input: { url: 'http://localhost/' } }).kind).toBe('block');
  });

  it('url 없는 open_tab 은 allow 한다', () => {
    expect(check({ tool: 'open_tab', input: {} }).kind).toBe('allow');
  });
});

describe('checkGuard — 읽기 도구', () => {
  it.each([
    ['snapshot', {}],
    ['read_text', { ref: 'e1' }],
    ['go_back', {}],
    ['scroll', { direction: 'down' }],
    ['wait_for', { ms: 100 }],
    ['list_tabs', {}],
    ['switch_tab', { tabId: 't1' }],
  ] as const)('%s 는 allow 한다', (tool, input) => {
    expect(check({ tool, input }).kind).toBe('allow');
  });
});
