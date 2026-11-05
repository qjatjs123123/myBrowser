import type { TToolName } from '../tools';
import type { IGuardTarget } from '../tools/driver';

/**
 * 가드 판정 — require_approval 의 display 는 실제 요소 텍스트·URL 그대로 (rules/agent/guard.md).
 * 이번 spec 에서 require_approval 은 run 을 stopped_before_confirm 으로 끝낸다 (승인 UI 는 3단계).
 */
export type TGuardVerdict =
  | { kind: 'allow' }
  | { kind: 'require_approval'; reason: string; display: { action: string; target: string } }
  | { kind: 'block'; reason: string };

/** checkGuard 입력 — 순수 함수라 필요한 것을 전부 인자로 받는다 */
export interface IGuardInput {
  tool: TToolName;
  /** 도구 입력 — betaZodTool 이 검증한 값이지만 가드는 도구별로 다시 좁혀 읽는다 */
  input: unknown;
  /** ref(또는 포커스) 대상 — 찾지 못하면 null (fail-closed) */
  target: IGuardTarget | null;
  pageUrl: string;
  /** 사설 host 차단의 예외 — 테스트 모드에서만 ['127.0.0.1'] */
  allowedHostList: string[];
}

/** 가드 패턴 한 항목 — rules.ts 의 데이터 */
export interface IGuardPattern {
  pattern: RegExp;
  reason: string;
}
