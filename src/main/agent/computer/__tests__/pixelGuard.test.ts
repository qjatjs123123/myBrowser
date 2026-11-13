import { describe, expect, it } from 'vitest';

import type { IGuardTarget } from '@shared/tools';

import { isConfirmKey, isTextEntryTarget, toGuardCall } from '../pixelGuard';

function createTarget(patch: Partial<IGuardTarget> = {}): IGuardTarget {
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
    pageUrl: 'https://shop.example.com/',
    ...patch,
  };
}

const SEARCH_BOX = createTarget({ role: 'searchbox', name: '검색어', inputType: 'search' });
const CONFIRM_BUTTON = createTarget({ role: 'button', name: '예약 확정' });

describe('toGuardCall — 클릭', () => {
  it.each(['left_click', 'double_click'] as const)('%s 는 좌표의 요소를 대상으로 click 가드를 부른다', (member) => {
    expect(toGuardCall(member, { coordinate: [10, 20] }, CONFIRM_BUTTON)).toEqual({
      tool: 'click',
      input: {},
      target: CONFIRM_BUTTON,
    });
  });

  it('좌표의 요소를 모르면 대상 null 인 click 가드다 (가드가 승인으로 판정)', () => {
    expect(toGuardCall('left_click', { coordinate: [10, 20] }, null)).toEqual({
      tool: 'click',
      input: {},
      target: null,
    });
  });
});

describe('toGuardCall — type', () => {
  it('글 입력칸에 줄바꿈 없는 글은 submit:false 인 type_text 다', () => {
    expect(toGuardCall('type', { text: '강남' }, SEARCH_BOX)).toEqual({
      tool: 'type_text',
      input: { text: '강남', submit: false },
      target: SEARCH_BOX,
    });
  });

  it.each(['2명\n', '2명\r'])('글에 줄바꿈(%j)이 있으면 submit:true 다', (text) => {
    expect(toGuardCall('type', { text }, SEARCH_BOX)?.input).toEqual({ text, submit: true });
  });

  it('textarea(role textbox, inputType 없음)는 글 입력칸이다', () => {
    const textarea = createTarget({ role: 'textbox', name: '요청 사항' });
    expect(toGuardCall('type', { text: 'a' }, textarea)?.tool).toBe('type_text');
  });

  it('password 칸도 type_text 로 넘겨 가드가 비밀 입력을 막게 한다', () => {
    const password = createTarget({ role: 'textbox', inputType: 'password' });
    expect(toGuardCall('type', { text: 'x' }, password)).toMatchObject({ tool: 'type_text', target: password });
  });

  it('글 입력칸이 아닌 버튼에 type 하면 그 버튼의 click 가드다', () => {
    expect(toGuardCall('type', { text: ' ' }, CONFIRM_BUTTON)).toEqual({
      tool: 'click',
      input: {},
      target: CONFIRM_BUTTON,
    });
  });

  it('checkbox 에 type 하면 click 가드다', () => {
    const checkbox = createTarget({ role: 'checkbox', inputType: 'checkbox', name: '동의' });
    expect(toGuardCall('type', { text: ' ' }, checkbox)?.tool).toBe('click');
  });

  it('포커스된 요소가 폼의 submit 버튼 자체면 type 은 그 버튼의 click 판정이다 (포커스 요소 그대로 해석)', () => {
    const submit = createTarget({ role: 'button', name: '로그인', formSubmitText: '로그인' });
    expect(toGuardCall('type', { text: ' ' }, submit)).toEqual({ tool: 'click', input: {}, target: submit });
  });

  it('포커스 대상이 없으면 대상 null 인 type_text 다', () => {
    expect(toGuardCall('type', { text: 'a' }, null)).toMatchObject({ tool: 'type_text', target: null });
  });
});

describe('toGuardCall — key', () => {
  it.each(['Return', 'Enter', 'KP_Enter', 'space', 'ctrl+Return', 'RETURN', 'shift+Space', 'ctrl+a Return'])(
    '확정 키 %s 는 press_key Enter 가드다',
    (text) => {
      expect(toGuardCall('key', { text }, CONFIRM_BUTTON)).toEqual({
        tool: 'press_key',
        input: { key: 'Enter' },
        target: CONFIRM_BUTTON,
      });
    },
  );

  it.each(['Tab', 'Escape', 'ctrl+a', 'BackSpace', 'Down'])('그 밖의 키 %s 는 가드가 없다', (text) => {
    expect(toGuardCall('key', { text }, CONFIRM_BUTTON)).toBeNull();
  });
});

describe('toGuardCall — 가드 없는 멤버', () => {
  it.each(['screenshot', 'scroll', 'mouse_move', 'wait'] as const)('%s 는 가드가 없다', (member) => {
    expect(toGuardCall(member, {}, CONFIRM_BUTTON)).toBeNull();
  });
});

describe('isConfirmKey', () => {
  it('빈 문자열은 확정 키가 아니다', () => {
    expect(isConfirmKey('')).toBe(false);
  });

  it('Return 이 이름 일부인 다른 키는 확정 키가 아니다', () => {
    expect(isConfirmKey('Returnx')).toBe(false);
  });
});

describe('isTextEntryTarget', () => {
  it('input text 는 글 입력칸이다', () => {
    expect(isTextEntryTarget(createTarget({ role: 'textbox', inputType: 'text' }))).toBe(true);
  });

  it('input submit 은 글 입력칸이 아니다', () => {
    expect(isTextEntryTarget(createTarget({ role: 'button', inputType: 'submit' }))).toBe(false);
  });

  it('select(combobox) 는 글 입력칸이 아니다', () => {
    expect(isTextEntryTarget(createTarget({ role: 'combobox' }))).toBe(false);
  });
});
