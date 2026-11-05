import type { TClickInput } from './click';
import type { TNavigateInput } from './navigate';
import type { TOpenTabInput } from './openTab';
import type { TPressKeyInput } from './pressKey';
import type { TReadTextInput } from './readText';
import type { TScrollInput } from './scroll';
import type { TSelectOptionInput } from './selectOption';
import type { TSwitchTabInput } from './switchTab';
import type { TTypeTextInput } from './typeText';
import type { TWaitForInput } from './waitFor';

/** 브라우저 행동 결과 — 실패는 throw 가 아니라 reason (루프가 is_error tool_result 로 바꾼다) */
export type TActionResult = { ok: true; text: string } | { ok: false; reason: string };

/**
 * 가드가 판정에 쓰는 대상 요소 정보 — 우리 코드가 정한 읽기 함수로만 채운다 (모델 입력을 실행하지 않음).
 * 값이 없으면 빈 문자열.
 */
export interface IGuardTarget {
  role: string;
  /** 접근 이름(aria-label 등) */
  name: string;
  /** innerText 200자 */
  text: string;
  value: string;
  href: string;
  /** 가장 가까운 form 의 action */
  formAction: string;
  /** 가장 가까운 form 의 submit 버튼 name/text, 없으면 '' */
  formSubmitText: string;
  inputType: string;
  autocomplete: string;
  /** input 의 name 속성 */
  fieldName: string;
  /** 연결된 label 텍스트 */
  label: string;
  pageUrl: string;
}

/** resolveTarget 요청 — ref 요소 또는 포커스된 요소(press_key 용) */
export interface IResolveTargetRequest {
  ref?: string;
  focused?: boolean;
}

/**
 * 에이전트 도구가 쓰는 브라우저 제어 포트 — main-browser 가 playwright-core 로 구현하고 agent-loop 는 이 타입만 안다.
 * electron·playwright 비의존 (타입만).
 */
export interface IBrowserDriver {
  snapshot(): Promise<TActionResult>;
  readText(input: TReadTextInput): Promise<TActionResult>;
  navigate(input: TNavigateInput): Promise<TActionResult>;
  goBack(): Promise<TActionResult>;
  click(input: TClickInput): Promise<TActionResult>;
  typeText(input: TTypeTextInput): Promise<TActionResult>;
  selectOption(input: TSelectOptionInput): Promise<TActionResult>;
  pressKey(input: TPressKeyInput): Promise<TActionResult>;
  scroll(input: TScrollInput): Promise<TActionResult>;
  waitFor(input: TWaitForInput): Promise<TActionResult>;
  listTabs(): Promise<TActionResult>;
  switchTab(input: TSwitchTabInput): Promise<TActionResult>;
  openTab(input: TOpenTabInput): Promise<TActionResult>;
  /** 가드용 대상 정보 — 찾을 수 없으면 null (fail-closed 판정은 가드가 한다) */
  resolveTarget(req: IResolveTargetRequest): Promise<IGuardTarget | null>;
  getPageInfo(): Promise<{ url: string; title: string }>;
  dispose(): Promise<void>;
}
