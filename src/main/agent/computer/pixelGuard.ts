/**
 * [픽셀 → 가드 매핑] computer toolset 멤버 호출을 구조 가드가 읽는 모양으로 바꾼다 — 순수 함수 (spec 004 「픽셀 → 가드 도구 매핑」).
 * 가드(source='pixel')는 도구 입력 스키마를 parse 하지 않고 여기서 만든 `{ text, submit }`·`{ key: 'Enter' }`·`{}` 만 본다.
 * 판정 자체(확정 패턴·비밀 입력·요소 미상 → 승인)는 guard.ts 가 한다.
 */
import type { IGuardTarget } from '@shared/tools';

/** 이번 spec 에서 구현하는 픽셀 멤버 (나머지는 SDK 가 enabled:false) */
export type TPixelMember =
  'screenshot' | 'left_click' | 'double_click' | 'type' | 'key' | 'scroll' | 'mouse_move' | 'wait';

/** 가드에 넘길 호출 — target 은 가드가 판정할 대상(모르면 null → 픽셀 가드가 승인 요청) */
export interface IPixelGuardCall {
  tool: 'click' | 'type_text' | 'press_key';
  input: Record<string, unknown>;
  target: IGuardTarget | null;
}

/** Enter 와 같은 확정 키 — 조합(ctrl+Return)·대소문자 무시. space 는 포커스된 버튼을 누른다 */
const CONFIRM_KEY_LIST = ['return', 'enter', 'kp_enter', 'space'];
/** 글을 입력받지 않는 input type — 여기에 `type` 하면 클릭과 같다(버튼에 " ") */
const NON_TEXT_INPUT_TYPE_LIST = ['submit', 'button', 'image', 'reset', 'checkbox', 'radio', 'file'];
const TEXT_ROLE_LIST = ['textbox', 'searchbox'];

/**
 * 멤버 호출 → 가드 호출. 가드가 필요 없는 멤버(그 밖의 key·scroll·mouse_move·wait·screenshot)는 null.
 * target: 클릭이면 좌표의 요소, type·key 면 포커스 대상(`resolveTarget({ focused: true })`).
 */
export function toGuardCall(
  member: TPixelMember,
  input: unknown,
  target: IGuardTarget | null = null,
): IPixelGuardCall | null {
  switch (member) {
    case 'left_click':
    case 'double_click':
      return { tool: 'click', input: {}, target };
    case 'type':
      return toTypeGuardCall(readString(input, 'text'), target);
    case 'key':
      return isConfirmKey(readString(input, 'text')) ? { tool: 'press_key', input: { key: 'Enter' }, target } : null;
    default:
      return null;
  }
}

/** xdotool 식 키 문자열에 확정 키가 있는지 — 공백으로 이은 여러 키("ctrl+a Return")도 하나라도 걸리면 참 */
export function isConfirmKey(keyText: string): boolean {
  return keyText
    .split(/\s+/)
    .filter(Boolean)
    .some((combo) => CONFIRM_KEY_LIST.includes((combo.split('+').at(-1) ?? '').trim().toLowerCase()));
}

/** 포커스 대상이 글 입력칸(input text류·textarea·role textbox/searchbox)인지 */
export function isTextEntryTarget(target: IGuardTarget): boolean {
  if (target.inputType !== '') return !NON_TEXT_INPUT_TYPE_LIST.includes(target.inputType.toLowerCase());
  return TEXT_ROLE_LIST.includes(target.role);
}

/**
 * type 매핑 — 글 입력칸이면 type_text(줄바꿈이 있으면 submit — 가드가 그 칸의 formSubmitText 로 확정 검사), 아니면 click.
 * target 은 포커스된 요소 그 자체(`resolveTarget({ focused: 'element' })`)라 폼 안 비밀번호 칸도 비밀 입력으로 판정된다.
 */
function toTypeGuardCall(text: string, target: IGuardTarget | null): IPixelGuardCall {
  const typeInput = { text, submit: /[\n\r]/.test(text) };
  if (!target) return { tool: 'type_text', input: typeInput, target: null };
  if (isTextEntryTarget(target)) return { tool: 'type_text', input: typeInput, target };
  return { tool: 'click', input: {}, target };
}

function readString(input: unknown, key: string): string {
  if (typeof input !== 'object' || input === null) return '';
  const value: unknown = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}
