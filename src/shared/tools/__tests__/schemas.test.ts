import type { ZodType } from 'zod';
import { describe, expect, it } from 'vitest';

import {
  ALL_TOOL_NAME_LIST,
  AskUserInputSchema,
  ClickInputSchema,
  HUMAN_TOOL_NAME_LIST,
  GoBackInputSchema,
  ListTabsInputSchema,
  NavigateInputSchema,
  OpenTabInputSchema,
  PressKeyInputSchema,
  ReadTextInputSchema,
  RefSchema,
  RequestApprovalInputSchema,
  ScrollInputSchema,
  SelectOptionInputSchema,
  SnapshotInputSchema,
  STATEFUL_TOOL_NAME_LIST,
  SwitchTabInputSchema,
  TOOL_NAME_LIST,
  TypeTextInputSchema,
  WaitForInputSchema,
} from '../index';

const CASE_LIST: { name: string; schema: ZodType; valid: unknown; invalid: unknown }[] = [
  { name: 'snapshot', schema: SnapshotInputSchema, valid: { ref: 'e3' }, invalid: { full: true } },
  { name: 'read_text', schema: ReadTextInputSchema, valid: { ref: 'e3' }, invalid: { ref: 'x1' } },
  { name: 'navigate', schema: NavigateInputSchema, valid: { url: 'https://example.com' }, invalid: { url: 'nope' } },
  { name: 'go_back', schema: GoBackInputSchema, valid: {}, invalid: { steps: 2 } },
  { name: 'click', schema: ClickInputSchema, valid: { ref: 'e12' }, invalid: { ref: 'x1' } },
  {
    name: 'type_text',
    schema: TypeTextInputSchema,
    valid: { ref: 'e4', text: '강남역', submit: true },
    invalid: { ref: 'e4', text: 'a'.repeat(1001) },
  },
  {
    name: 'select_option',
    schema: SelectOptionInputSchema,
    valid: { ref: 'e5', valueList: ['2'] },
    invalid: { ref: 'e5', valueList: [] },
  },
  { name: 'press_key', schema: PressKeyInputSchema, valid: { key: 'Enter' }, invalid: { key: 'F5' } },
  {
    name: 'scroll',
    schema: ScrollInputSchema,
    valid: { direction: 'down', amount: 'half' },
    invalid: { direction: 'left' },
  },
  { name: 'wait_for', schema: WaitForInputSchema, valid: { text: '가게 정보' }, invalid: {} },
  { name: 'list_tabs', schema: ListTabsInputSchema, valid: {}, invalid: { all: true } },
  { name: 'switch_tab', schema: SwitchTabInputSchema, valid: { tabId: 'tab-2' }, invalid: { tabId: '' } },
  { name: 'open_tab', schema: OpenTabInputSchema, valid: {}, invalid: { url: 'not a url' } },
  {
    name: 'ask_user',
    schema: AskUserInputSchema,
    valid: { question: '몇 명인가요?', optionList: ['2명', '4명'] },
    invalid: { question: '' },
  },
  {
    name: 'request_approval',
    schema: RequestApprovalInputSchema,
    valid: { action: '예약 확정', target: '7시 2명', reason: '최종 확인' },
    invalid: { action: '', target: '', reason: '확인' },
  },
];

describe('도구 입력 스키마', () => {
  it.each(CASE_LIST)('$name 의 유효 입력은 통과한다', ({ schema, valid }) => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it.each(CASE_LIST)('$name 의 무효 입력은 실패한다', ({ schema, invalid }) => {
    expect(schema.safeParse(invalid).success).toBe(false);
  });

  it('ref 를 받는 도구에 추가 키가 있으면 실패한다', () => {
    expect(ClickInputSchema.safeParse({ ref: 'e1', force: true }).success).toBe(false);
  });

  it('wait_for 는 ms 만 있어도 통과하고 범위 밖 ms 는 실패한다', () => {
    expect(WaitForInputSchema.safeParse({ ms: 3000 }).success).toBe(true);
    expect(WaitForInputSchema.safeParse({ ms: 50 }).success).toBe(false);
    expect(WaitForInputSchema.safeParse({ ms: 10001 }).success).toBe(false);
  });

  it('select_option 은 값 11개면 실패한다', () => {
    const valueList = Array.from({ length: 11 }, (_, i) => String(i));
    expect(SelectOptionInputSchema.safeParse({ ref: 'e1', valueList }).success).toBe(false);
  });

  it('RefSchema 는 e·f-ref 만 받는다', () => {
    expect(RefSchema.safeParse('e0').success).toBe(true);
    expect(RefSchema.safeParse('f2e5').success).toBe(true);
    expect(RefSchema.safeParse('f2').success).toBe(false);
    expect(RefSchema.safeParse('x1').success).toBe(false);
    expect(RefSchema.safeParse('e').success).toBe(false);
    expect(RefSchema.safeParse('E1').success).toBe(false);
    expect(RefSchema.safeParse('e1 ').success).toBe(false);
  });
});

describe('사람 개입 도구 스키마', () => {
  it('ask_user 는 optionList 없이도 통과한다', () => {
    expect(AskUserInputSchema.safeParse({ question: '날짜를 알려주세요' }).success).toBe(true);
  });

  it('ask_user 는 질문이 301자면 실패한다', () => {
    expect(AskUserInputSchema.safeParse({ question: 'a'.repeat(301) }).success).toBe(false);
  });

  it('ask_user 는 선택지 7개·61자 선택지면 실패한다', () => {
    const optionList = Array.from({ length: 7 }, (_, i) => String(i));
    expect(AskUserInputSchema.safeParse({ question: '몇 명?', optionList }).success).toBe(false);
    expect(AskUserInputSchema.safeParse({ question: '몇 명?', optionList: ['a'.repeat(61)] }).success).toBe(false);
  });

  it('ask_user 에 옛 이름 options 를 쓰면 실패한다', () => {
    expect(AskUserInputSchema.safeParse({ question: '몇 명?', options: ['2명'] }).success).toBe(false);
  });

  it('request_approval 은 target 이 비어도 통과한다', () => {
    expect(RequestApprovalInputSchema.safeParse({ action: '확인', target: '', reason: '이유' }).success).toBe(true);
  });

  it('request_approval 은 action 101자·target 201자·reason 없음이면 실패한다', () => {
    const base = { action: '확인', target: '', reason: '이유' };
    expect(RequestApprovalInputSchema.safeParse({ ...base, action: 'a'.repeat(101) }).success).toBe(false);
    expect(RequestApprovalInputSchema.safeParse({ ...base, target: 'a'.repeat(201) }).success).toBe(false);
    expect(RequestApprovalInputSchema.safeParse({ action: '확인', target: '' }).success).toBe(false);
  });
});

describe('도구 이름 목록', () => {
  it('TOOL_NAME_LIST 는 중복 없는 13개다', () => {
    expect(TOOL_NAME_LIST).toHaveLength(13);
    expect(new Set(TOOL_NAME_LIST).size).toBe(13);
  });

  it('HUMAN_TOOL_NAME_LIST 는 사람 개입 도구 2개다', () => {
    expect(HUMAN_TOOL_NAME_LIST).toEqual(['ask_user', 'request_approval']);
  });

  it('ALL_TOOL_NAME_LIST 는 중복 없는 15개이고 브라우저 도구 13개 뒤에 사람 개입 도구가 온다', () => {
    expect(ALL_TOOL_NAME_LIST).toHaveLength(15);
    expect(new Set(ALL_TOOL_NAME_LIST).size).toBe(15);
    expect(ALL_TOOL_NAME_LIST).toEqual([...TOOL_NAME_LIST, ...HUMAN_TOOL_NAME_LIST]);
  });

  it('STATEFUL_TOOL_NAME_LIST 는 상태를 바꾸는 6개 도구다', () => {
    expect([...STATEFUL_TOOL_NAME_LIST].sort()).toEqual(
      ['click', 'navigate', 'open_tab', 'press_key', 'select_option', 'type_text'].sort(),
    );
  });
});
