import type { TToolName } from '../tools';
import type { IGuardTarget, IPoint } from '../tools/driver';

/**
 * 가드 판정 — require_approval 의 display 는 실제 요소 텍스트·URL 그대로 (rules/agent/guard.md).
 * require_approval 은 run 을 waiting_user 로 두고 사이드바 승인 창에서 사용자가 고른다 (spec 004).
 */
export type TGuardVerdict =
  | { kind: 'allow' }
  | { kind: 'require_approval'; reason: string; display: { action: string; target: string } }
  | { kind: 'block'; reason: string };

/** checkGuard 입력 — 순수 함수라 필요한 것을 전부 인자로 받는다 */
export interface IGuardInput {
  /** request_approval 은 승인 상한(SR-4)만 검사한다 */
  tool: TToolName | 'request_approval';
  /** 도구 입력 — betaZodTool 이 검증한 값이지만 가드는 도구별로 다시 좁혀 읽는다 */
  input: unknown;
  /** ref(또는 포커스) 대상 — 찾지 못하면 null (fail-closed) */
  target: IGuardTarget | null;
  pageUrl: string;
  /** 사설 host 차단의 예외 — 테스트 모드에서만 ['127.0.0.1'] */
  allowedHostList: string[];
  /** 호출 출처 — 기본 'structure'. 'pixel' 이면 입력 스키마 parse 없이 픽셀→가드 매핑 input 모양만 본다 (spec 004) */
  source?: 'structure' | 'pixel';
  /** 이번 호출 전까지 run 의 승인 요청 수 — 기본 0, 상한 넘으면 block(too_many_approvals) */
  approvalCount?: number;
  /** 픽셀 좌표 — target 을 모를 때 display 에 쓴다 */
  point?: IPoint;
}

/** 가드 패턴 한 항목 — rules.ts 의 데이터 */
export interface IGuardPattern {
  pattern: RegExp;
  reason: string;
}
