/**
 * [결정적 가드] 상태를 바꾸는 도구 호출을 실행 전에 판정한다 — 순수 함수 (I/O 없음).
 * 규칙: .claude/rules/agent/guard.md (최우선), 데이터: src/shared/guard/rules.ts
 * 이번 spec 에서 require_approval 은 루프가 run 을 stopped_before_confirm 으로 끝낸다 (승인 UI 는 3단계).
 */
import {
  CONFIRM_PATTERN_LIST,
  CONFIRM_URL_PATTERN_LIST,
  DESTRUCTIVE_PATTERN_LIST,
  findMatchedPattern,
  normalizeText,
  PRIVATE_HOST_PATTERN_LIST,
  SECRET_AUTOCOMPLETE_LIST,
  SECRET_FIELD_PATTERN_LIST,
} from '@shared/guard/rules';
import type { IGuardInput, IGuardPattern, TGuardVerdict } from '@shared/guard/types';
import {
  NavigateInputSchema,
  OpenTabInputSchema,
  PressKeyInputSchema,
  TypeTextInputSchema,
  type IGuardTarget,
} from '@shared/tools';

/** 모델에 돌려주는 차단 이유 — 다음 행동을 알려 준다 */
export const GUARD_MESSAGE = {
  secretField: '민감 정보는 입력하지 않습니다. 사용자에게 직접 입력을 요청하라',
  unknownTarget: '대상을 확인할 수 없습니다. snapshot 을 다시 찍어라',
  invalidInput: '도구 입력 형식이 올바르지 않습니다',
  invalidUrl: '주소 형식이 올바르지 않습니다',
} as const;

/** display.action — 도구별 고정 문구 (모델이 만든 문장 금지) */
const DISPLAY_ACTION = {
  click: '클릭',
  selectOption: '선택',
  pressEnter: 'Enter 키',
  typeSubmit: '입력 후 제출',
} as const;

const DISPLAY_TARGET_MAX = 80;
const ALLOW: TGuardVerdict = { kind: 'allow' };
const CONFIRM_TARGET_PATTERN_LIST = [...CONFIRM_PATTERN_LIST, ...DESTRUCTIVE_PATTERN_LIST];

/** 도구 호출 하나를 판정한다 — 상태를 바꾸지 않는 도구는 allow */
export function checkGuard(guardInput: IGuardInput): TGuardVerdict {
  const { tool, input, target, pageUrl, allowedHostList } = guardInput;
  switch (tool) {
    case 'navigate':
      return checkNavigate(input, allowedHostList);
    case 'open_tab':
      return checkOpenTab(input, allowedHostList);
    case 'click':
      return checkConfirmTarget({ target, pageUrl, action: DISPLAY_ACTION.click });
    case 'select_option':
      return checkConfirmTarget({ target, pageUrl, action: DISPLAY_ACTION.selectOption });
    case 'type_text':
      return checkTypeText(input, target, pageUrl);
    case 'press_key':
      return checkPressKey(input, target, pageUrl);
    default:
      return ALLOW;
  }
}

function checkNavigate(input: unknown, allowedHostList: string[]): TGuardVerdict {
  const parsed = NavigateInputSchema.safeParse(input);
  if (!parsed.success) return block(GUARD_MESSAGE.invalidInput);
  return checkUrl(parsed.data.url, allowedHostList);
}

function checkOpenTab(input: unknown, allowedHostList: string[]): TGuardVerdict {
  const parsed = OpenTabInputSchema.safeParse(input);
  if (!parsed.success) return block(GUARD_MESSAGE.invalidInput);
  return parsed.data.url === undefined ? ALLOW : checkUrl(parsed.data.url, allowedHostList);
}

/** 규칙 3 — http(s) 만, 사설·루프백 host 차단 (allowedHostList 예외) */
function checkUrl(rawUrl: string, allowedHostList: string[]): TGuardVerdict {
  const url = toUrl(rawUrl);
  if (!url) return block(GUARD_MESSAGE.invalidUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return block(`열 수 없는 주소입니다 (${url.protocol} 스킴). http(s) 주소만 연다`);
  }
  if (allowedHostList.includes(url.hostname)) return ALLOW;
  const matched = PRIVATE_HOST_PATTERN_LIST.find((item) => item.pattern.test(url.hostname));
  return matched ? block(`열 수 없는 주소입니다 (${matched.reason}). 공개 주소만 연다`) : ALLOW;
}

interface IConfirmCheck {
  target: IGuardTarget | null;
  pageUrl: string;
  action: string;
}

/** 규칙 1·4 — ref 대상 행동(click·select_option). 대상이 없으면 fail-closed */
function checkConfirmTarget({ target, pageUrl, action }: IConfirmCheck): TGuardVerdict {
  if (!target) return block(GUARD_MESSAGE.unknownTarget);
  const fieldList = [target.name, target.text, target.value, target.href, target.formAction];
  return toApproval(findConfirmMatch(fieldList, pageUrl), action, toDisplayTarget(target));
}

/** 규칙 2(입력 필드) → 규칙 1(submit 이면 폼의 submit 버튼·action·pageUrl) */
function checkTypeText(input: unknown, target: IGuardTarget | null, pageUrl: string): TGuardVerdict {
  const parsed = TypeTextInputSchema.safeParse(input);
  if (!parsed.success) return block(GUARD_MESSAGE.invalidInput);
  if (!target) return block(GUARD_MESSAGE.unknownTarget);
  if (isSecretField(target)) return block(GUARD_MESSAGE.secretField);
  if (!parsed.data.submit) return ALLOW;
  const matched = findConfirmMatch([target.formSubmitText, target.formAction], pageUrl);
  const displayTarget = target.formSubmitText ? truncate(target.formSubmitText) : toDisplayTarget(target);
  return toApproval(matched, DISPLAY_ACTION.typeSubmit, displayTarget);
}

/** 규칙 1 — Enter 만 검사. 포커스 대상이 없으면(body 등) pageUrl 만 본다 */
function checkPressKey(input: unknown, target: IGuardTarget | null, pageUrl: string): TGuardVerdict {
  const parsed = PressKeyInputSchema.safeParse(input);
  if (!parsed.success) return block(GUARD_MESSAGE.invalidInput);
  if (parsed.data.key !== 'Enter') return ALLOW;
  if (!target) return toApproval(findConfirmMatch([], pageUrl), DISPLAY_ACTION.pressEnter, truncate(pageUrl));
  const fieldList = [target.name, target.text, target.value, target.href, target.formAction, target.formSubmitText];
  return toApproval(findConfirmMatch(fieldList, pageUrl), DISPLAY_ACTION.pressEnter, toDisplayTarget(target));
}

function isSecretField(target: IGuardTarget): boolean {
  if (normalizeText(target.inputType).toLowerCase() === 'password') return true;
  if (findMatchedPattern(target.autocomplete, SECRET_AUTOCOMPLETE_LIST)) return true;
  return [target.fieldName, target.label, target.name].some(
    (text) => findMatchedPattern(text, SECRET_FIELD_PATTERN_LIST) !== null,
  );
}

/** 대상 필드에 확정·삭제 패턴, pageUrl 에 결제 URL 패턴 — 처음 걸린 것 */
function findConfirmMatch(fieldList: string[], pageUrl: string): IGuardPattern | null {
  for (const text of fieldList) {
    const matched = findMatchedPattern(text, CONFIRM_TARGET_PATTERN_LIST);
    if (matched) return matched;
  }
  return findMatchedPattern(pageUrl, CONFIRM_URL_PATTERN_LIST);
}

function toApproval(matched: IGuardPattern | null, action: string, target: string): TGuardVerdict {
  if (!matched) return ALLOW;
  return { kind: 'require_approval', reason: matched.reason, display: { action, target } };
}

/** 실제 요소 텍스트 — name || text || value (80자) + href */
function toDisplayTarget(target: IGuardTarget): string {
  const base = truncate(target.name || target.text || target.value);
  return target.href ? `${base} (${target.href})` : base;
}

function truncate(text: string): string {
  const normalized = normalizeText(text);
  return normalized.length > DISPLAY_TARGET_MAX ? normalized.slice(0, DISPLAY_TARGET_MAX) : normalized;
}

function toUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function block(reason: string): TGuardVerdict {
  return { kind: 'block', reason };
}
