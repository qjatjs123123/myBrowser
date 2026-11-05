import { describe, expect, it } from 'vitest';

import type { IGuardTarget } from '@shared/tools';

import { summarizeStep } from '../summary';

function createTarget(patch: Partial<IGuardTarget>): IGuardTarget {
  return {
    role: '',
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
    pageUrl: '',
    ...patch,
  };
}

describe('summarizeStep', () => {
  it.each([
    ['snapshot', {}, '페이지 읽기'],
    ['read_text', {}, '글 읽기'],
    ['go_back', {}, '뒤로 가기'],
    ['scroll', { direction: 'down' }, '스크롤'],
    ['wait_for', { ms: 100 }, '기다리기'],
    ['list_tabs', {}, '탭 목록 보기'],
    ['switch_tab', { tabId: 't1' }, '탭 전환'],
    ['open_tab', {}, '새 탭 열기'],
    ['press_key', { key: 'Enter' }, 'Enter 키'],
    ['navigate', { url: 'https://www.naver.com/search?q=1' }, 'www.naver.com 열기'],
  ] as const)('%s 는 정해진 문구로 요약한다', (tool, input, expected) => {
    expect(summarizeStep(tool, input)).toBe(expected);
  });

  it('click 은 대상 이름을 따옴표로 감싼다', () => {
    const target = createTarget({ name: '두 번째 페이지' });
    expect(summarizeStep('click', { ref: 'e1' }, target)).toBe('‘두 번째 페이지’ 클릭');
  });

  it('click 은 이름이 없으면 text 를 40자로 잘라 쓴다', () => {
    const summary = summarizeStep('click', { ref: 'e1' }, createTarget({ text: '가'.repeat(50) }));
    expect(summary).toBe(`‘${'가'.repeat(40)}’ 클릭`);
  });

  it('click 은 대상이 없으면 동사만 쓴다', () => {
    expect(summarizeStep('click', { ref: 'e1' }, null)).toBe('클릭');
  });

  it('type_text 요약에는 입력값이 없다', () => {
    const summary = summarizeStep('type_text', { ref: 'e1', text: 'secret-value' }, createTarget({ name: '검색어' }));
    expect(summary).toBe('‘검색어’에 입력');
    expect(summary).not.toContain('secret-value');
  });

  it('select_option 은 대상 이름으로 요약한다', () => {
    const target = createTarget({ name: '인원' });
    expect(summarizeStep('select_option', { ref: 'e1', valueList: ['2'] }, target)).toBe('‘인원’ 선택');
  });

  it('ask_user 는 “질문: {question}” 을 40자로 자른다', () => {
    expect(summarizeStep('ask_user', { question: '몇 명으로 예약할까요?' })).toBe('질문: 몇 명으로 예약할까요?');
    expect(summarizeStep('ask_user', { question: '가'.repeat(50) })).toBe(`질문: ${'가'.repeat(40)}`);
  });

  it('request_approval 은 “확인 요청: {action}” 이다', () => {
    expect(summarizeStep('request_approval', { action: '4명으로 변경', target: '', reason: 'r' })).toBe(
      '확인 요청: 4명으로 변경',
    );
  });

  it.each([
    ['computer.screenshot', '화면 보기'],
    ['computer.left_click', '좌표 클릭'],
    ['computer.double_click', '좌표 더블클릭'],
    ['computer.scroll', '화면 스크롤'],
    ['computer.mouse_move', '커서 이동'],
    ['computer.wait', '기다리기'],
  ])('픽셀 멤버 %s 는 고정 문구 “%s” 로 요약한다', (tool, expected) => {
    expect(summarizeStep(tool, { coordinate: [10, 20] })).toBe(expected);
  });

  it('픽셀 key 는 “키 {text}” 로 요약한다', () => {
    expect(summarizeStep('computer.key', { text: 'ctrl+a' })).toBe('키 ctrl+a');
  });

  it('픽셀 type 요약에는 입력한 글자가 없다', () => {
    expect(summarizeStep('computer.type', { text: '비밀값123' })).toBe('글자 입력');
  });
});
