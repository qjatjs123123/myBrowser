/**
 * [도구 계약] 에이전트 도구 입력 스키마의 진입점 — 이름 목록과 ref 형식의 단일 출처.
 * 규칙: .claude/rules/agent/tools.md
 */
export { RefSchema, type TRef } from './ref';
export * from './click';
export * from './goBack';
export * from './listTabs';
export * from './navigate';
export * from './openTab';
export * from './pressKey';
export * from './readText';
export * from './scroll';
export * from './selectOption';
export * from './snapshot';
export * from './switchTab';
export * from './typeText';
export * from './waitFor';
export type { IBrowserDriver, IGuardTarget, IResolveTargetRequest, TActionResult } from './driver';

/** 모델에 보이는 도구 이름 13개 */
export const TOOL_NAME_LIST = [
  'snapshot',
  'read_text',
  'navigate',
  'go_back',
  'click',
  'type_text',
  'select_option',
  'press_key',
  'scroll',
  'wait_for',
  'list_tabs',
  'switch_tab',
  'open_tab',
] as const;

export type TToolName = (typeof TOOL_NAME_LIST)[number];

/** 상태를 바꾸는 도구 — 루프 공통 래퍼가 실행 전에 반드시 checkGuard 를 거친다 (SR-4) */
export const STATEFUL_TOOL_NAME_LIST = [
  'navigate',
  'open_tab',
  'click',
  'type_text',
  'select_option',
  'press_key',
] as const satisfies readonly TToolName[];

export type TStatefulToolName = (typeof STATEFUL_TOOL_NAME_LIST)[number];
