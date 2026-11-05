import type { ZodType } from 'zod';
import { describe, expect, it } from 'vitest';

import {
  ClickInputSchema,
  GoBackInputSchema,
  ListTabsInputSchema,
  NavigateInputSchema,
  OpenTabInputSchema,
  PressKeyInputSchema,
  ReadTextInputSchema,
  RefSchema,
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
  { name: 'snapshot', schema: SnapshotInputSchema, valid: {}, invalid: { full: true } },
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

  it('RefSchema 는 e+숫자만 받는다', () => {
    expect(RefSchema.safeParse('e0').success).toBe(true);
    expect(RefSchema.safeParse('e').success).toBe(false);
    expect(RefSchema.safeParse('E1').success).toBe(false);
    expect(RefSchema.safeParse('e1 ').success).toBe(false);
  });
});

describe('도구 이름 목록', () => {
  it('TOOL_NAME_LIST 는 중복 없는 13개다', () => {
    expect(TOOL_NAME_LIST).toHaveLength(13);
    expect(new Set(TOOL_NAME_LIST).size).toBe(13);
  });

  it('STATEFUL_TOOL_NAME_LIST 는 상태를 바꾸는 6개 도구다', () => {
    expect([...STATEFUL_TOOL_NAME_LIST].sort()).toEqual(
      ['click', 'navigate', 'open_tab', 'press_key', 'select_option', 'type_text'].sort(),
    );
  });
});
