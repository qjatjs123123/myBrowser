/**
 * [결정적 가드] 상태를 바꾸는 도구 호출을 실행 전에 판정한다 — 순수 함수 (I/O 없음).
 * 규칙: .claude/rules/agent/guard.md (최우선), 데이터: src/shared/guard/rules.ts
 * require_approval 은 래퍼가 run 을 waiting_user 로 두고 사용자 결정을 기다린다 (spec 004 「승인 흐름」).
 * source='pixel' 이면 입력 스키마 parse 없이 픽셀 → 가드 매핑의 input 모양(`{ text, submit }`·`{ key }`·`{}`)만 본다.
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
  type IPoint,
} from '@shared/tools';

/** 모델에 돌려주는 차단 이유 — 다음 행동을 알려 준다 */
export const GUARD_MESSAGE = {
  secretField: '민감 정보는 입력하지 않습니다. 사용자에게 직접 입력을 요청하라',
  unknownTarget: '대상을 확인할 수 없습니다. snapshot 을 다시 찍어라',
  invalidInput: '도구 입력 형식이 올바르지 않습니다',
  invalidUrl: '주소 형식이 올바르지 않습니다',
  tooManyApprovals: 'too_many_approvals: 이번 작업의 승인 요청이 5회를 넘었습니다. 작업을 멈추고 사용자에게 상황을 알려라',
} as const;

/** run 당 승인 요청 상한 (SR-4, guard.md 규칙 5) — 이번 호출 전까지 이만큼 요청했으면 더 묻지 않고 block */
export const MAX_APPROVAL_COUNT = 5;

/** display.action — 도구별 고정 문구 (모델이 만든 문장 금지) */
const DISPLAY_ACTION = {
  click: '클릭',
  selectOption: '선택',
  pressEnter: 'Enter 키',
  type: '입력',
  typeSubmit: '입력 후 제출',
  modelRequest: '확인 요청',
} as const;

const UNKNOWN_ELEMENT_REASON = '좌표의 요소를 확인할 수 없음';
/** 이름·텍스트·값이 모두 빈 입력칸 — 픽셀 type 가드 호출에는 좌표가 없어 고정 문구로 보인다 (spec 008 FR-4) */
const NAMELESS_INPUT = '이름 없는 입력칸';
const MODEL_REQUEST_REASON = '에이전트가 확인을 요청함';

const DISPLAY_TARGET_MAX = 80;
const ALLOW: TGuardVerdict = { kind: 'allow' };
const CONFIRM_TARGET_PATTERN_LIST = [...CONFIRM_PATTERN_LIST, ...DESTRUCTIVE_PATTERN_LIST];

/** 도구 호출 하나를 판정한다 — 상태를 바꾸지 않는 도구는 allow. 승인 요청이 될 판정은 상한(SR-4)을 넘으면 block */
export function checkGuard(guardInput: IGuardInput): TGuardVerdict {
  const verdict = judge(guardInput);
  if (verdict.kind !== 'require_approval') return verdict;
  return (guardInput.approvalCount ?? 0) >= MAX_APPROVAL_COUNT ? block(GUARD_MESSAGE.tooManyApprovals) : verdict;
}

/** 두 승인 표시가 같은지 — [에이전트가 누르기] 재확인에서 승인한 대상과 지금 대상이 같을 때만 실행한다 */
export function isSameDisplay(a: TApprovalDisplay, b: TApprovalDisplay): boolean {
  return a.action === b.action && a.target === b.target;
}

type TApprovalDisplay = Extract<TGuardVerdict, { kind: 'require_approval' }>['display'];

function judge(guardInput: IGuardInput): TGuardVerdict {
  if (guardInput.tool === 'request_approval') return toModelApproval();
  if ((guardInput.source ?? 'structure') === 'pixel') return judgePixel(guardInput);
  return judgeStructure(guardInput);
}

function judgeStructure(guardInput: IGuardInput): TGuardVerdict {
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
      return checkTypeText(TypeTextInputSchema.safeParse(input), target, pageUrl);
    case 'press_key':
      return checkPressKey(PressKeyInputSchema.safeParse(input), target, pageUrl);
    default:
      return ALLOW;
  }
}

/**
 * 픽셀 멤버 판정 — 입력은 toGuardCall 이 만든 모양만 본다(스키마 parse 없음).
 * 요소를 알 수 없으면(null) 구조 도구처럼 block 이 아니라 require_approval (FR-7 fail-closed, 사용자 확인).
 * click 은 이름·텍스트·값이 모두 빈 요소(canvas 등)도 알 수 없는 요소로 본다.
 */
function judgePixel(guardInput: IGuardInput): TGuardVerdict {
  const { tool, input, target, pageUrl, point } = guardInput;
  if (!target || (tool === 'click' && isNamelessTarget(target))) return toUnknownApproval(tool, point);
  switch (tool) {
    case 'click':
      return checkConfirmTarget({ target, pageUrl, action: DISPLAY_ACTION.click });
    case 'type_text':
      return checkPixelTypeText(input, target, pageUrl);
    case 'press_key':
      return checkPressKey(readPixelKeyInput(input), target, pageUrl);
    default:
      return ALLOW;
  }
}

/**
 * 픽셀 type — 비밀 칸 block·확정 승인이 먼저(checkTypeText), 그다음 이름 없는 칸이면 칸마다 승인 (spec 008 FR-4·FR-5).
 * 무엇을 채우는지 사용자가 알 수 없는 칸이라 allow 를 require_approval 로만 바꾼다 (강화만, SR-1).
 */
function checkPixelTypeText(input: unknown, target: IGuardTarget, pageUrl: string): TGuardVerdict {
  const parsed = readPixelTypeInput(input);
  const verdict = checkTypeText(parsed, target, pageUrl);
  if (verdict.kind !== 'allow' || !parsed.success || !isNamelessTarget(target)) return verdict;
  const action = parsed.data.submit ? DISPLAY_ACTION.typeSubmit : DISPLAY_ACTION.type;
  return { kind: 'require_approval', reason: NAMELESS_INPUT, display: { action, target: NAMELESS_INPUT } };
}

function isNamelessTarget(target: IGuardTarget): boolean {
  return [target.name, target.text, target.value].every((text) => normalizeText(text) === '');
}

/** 요소를 모르는 픽셀 행동 — display 는 실제 좌표 (SR-3) */
function toUnknownApproval(tool: IGuardInput['tool'], point: IPoint | undefined): TGuardVerdict {
  const action = tool === 'type_text' ? DISPLAY_ACTION.typeSubmit : tool === 'press_key' ? DISPLAY_ACTION.pressEnter : DISPLAY_ACTION.click;
  const target = point ? `좌표 (${point.x}, ${point.y}) — 요소를 확인할 수 없음` : '요소를 확인할 수 없음';
  return { kind: 'require_approval', reason: UNKNOWN_ELEMENT_REASON, display: { action, target } };
}

/** request_approval — 모델 문장은 display 에 넣지 않는다 (SR-3, 모델 문장은 승인 창의 “에이전트 설명”) */
function toModelApproval(): TGuardVerdict {
  return { kind: 'require_approval', reason: MODEL_REQUEST_REASON, display: { action: DISPLAY_ACTION.modelRequest, target: '' } };
}

type TParsed<T> = { success: true; data: T } | { success: false };

/** 픽셀 type 매핑 `{ text, submit }` — 모양이 다르면 실패 (block) */
function readPixelTypeInput(input: unknown): TParsed<{ text: string; submit: boolean }> {
  const record = toRecord(input);
  if (typeof record.text !== 'string' || typeof record.submit !== 'boolean') return { success: false };
  return { success: true, data: { text: record.text, submit: record.submit } };
}

/** 픽셀 key 매핑 `{ key }` */
function readPixelKeyInput(input: unknown): TParsed<{ key: string }> {
  const record = toRecord(input);
  return typeof record.key === 'string' ? { success: true, data: { key: record.key } } : { success: false };
}

function toRecord(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
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
function checkTypeText(
  parsed: TParsed<{ submit?: boolean }>,
  target: IGuardTarget | null,
  pageUrl: string,
): TGuardVerdict {
  if (!parsed.success) return block(GUARD_MESSAGE.invalidInput);
  if (!target) return block(GUARD_MESSAGE.unknownTarget);
  if (isSecretField(target)) return block(GUARD_MESSAGE.secretField);
  if (!parsed.data.submit) return ALLOW;
  const matched = findConfirmMatch([target.formSubmitText, target.formAction], pageUrl);
  const displayTarget = target.formSubmitText ? truncate(target.formSubmitText) : toDisplayTarget(target);
  return toApproval(matched, DISPLAY_ACTION.typeSubmit, displayTarget);
}

/** 규칙 1 — Enter 만 검사. 포커스 대상이 없으면(body 등) pageUrl 만 본다 */
function checkPressKey(parsed: TParsed<{ key: string }>, target: IGuardTarget | null, pageUrl: string): TGuardVerdict {
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
