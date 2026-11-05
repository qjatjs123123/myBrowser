/**
 * [가드 규칙 데이터] rules/agent/guard.md 규칙 1~4 의 패턴 — 판정 로직은 src/main/agent/guard.ts.
 * 영어 확정·삭제 패턴은 단어 경계(“payment history” 는 안 걸림), 한국어는 부분 문자열(“결제 내역” 도 걸림 — 정지 쪽 오탐 허용).
 * 비밀 필드 이름은 영어도 부분 문자열 (`user_password` 같은 name 을 놓치지 않으려고 — 차단 쪽 오탐 허용).
 * 정규식에 g 플래그를 쓰지 않는다 (test() 가 lastIndex 상태를 갖지 않게).
 */
import type { IGuardPattern } from './types';

const CONFIRM_REASON = '확정·결제 행동';
const DESTRUCTIVE_REASON = '삭제·탈퇴 행동';
const SECRET_REASON = '민감 정보 입력칸';
const PRIVATE_HOST_REASON = '사설·루프백 주소';

/** 규칙 1 — 확정·결제. target 의 name·text·value·href·formAction(·formSubmitText) 에 검사 */
export const CONFIRM_PATTERN_LIST: IGuardPattern[] = [
  { pattern: /예약\s?확정/i, reason: `${CONFIRM_REASON}: 예약 확정` },
  { pattern: /예약하기/i, reason: `${CONFIRM_REASON}: 예약하기` },
  { pattern: /결제/i, reason: `${CONFIRM_REASON}: 결제` },
  { pattern: /주문/i, reason: `${CONFIRM_REASON}: 주문` },
  { pattern: /구매/i, reason: `${CONFIRM_REASON}: 구매` },
  { pattern: /송금/i, reason: `${CONFIRM_REASON}: 송금` },
  { pattern: /이체/i, reason: `${CONFIRM_REASON}: 이체` },
  { pattern: /전송/i, reason: `${CONFIRM_REASON}: 전송` },
  { pattern: /제출/i, reason: `${CONFIRM_REASON}: 제출` },
  { pattern: /\bconfirm\b/i, reason: `${CONFIRM_REASON}: confirm` },
  { pattern: /\bpay\b/i, reason: `${CONFIRM_REASON}: pay` },
  { pattern: /\bcheckout\b/i, reason: `${CONFIRM_REASON}: checkout` },
  { pattern: /\bpurchase\b/i, reason: `${CONFIRM_REASON}: purchase` },
  { pattern: /\bsubmit order\b/i, reason: `${CONFIRM_REASON}: submit order` },
  { pattern: /\bplace order\b/i, reason: `${CONFIRM_REASON}: place order` },
  { pattern: /\bbook now\b/i, reason: `${CONFIRM_REASON}: book now` },
  { pattern: /\breserve\b/i, reason: `${CONFIRM_REASON}: reserve` },
];

/** 규칙 1 (URL) — 현재 pageUrl 에만 쓰는 결제·주문확인 페이지 패턴 */
export const CONFIRM_URL_PATTERN_LIST: IGuardPattern[] = [
  { pattern: /\bcheckout\b/i, reason: `${CONFIRM_REASON}: checkout 페이지` },
  { pattern: /\bpayment\b/i, reason: `${CONFIRM_REASON}: payment 페이지` },
  { pattern: /\border\/confirm\b/i, reason: `${CONFIRM_REASON}: 주문 확인 페이지` },
];

/** 규칙 4 — 삭제·탈퇴. 확정 패턴과 같은 대상에 검사 */
export const DESTRUCTIVE_PATTERN_LIST: IGuardPattern[] = [
  { pattern: /삭제/i, reason: `${DESTRUCTIVE_REASON}: 삭제` },
  { pattern: /탈퇴/i, reason: `${DESTRUCTIVE_REASON}: 탈퇴` },
  { pattern: /해지/i, reason: `${DESTRUCTIVE_REASON}: 해지` },
  { pattern: /취소하기/i, reason: `${DESTRUCTIVE_REASON}: 취소하기` },
  { pattern: /\bdelete\b/i, reason: `${DESTRUCTIVE_REASON}: delete` },
  { pattern: /\bunsubscribe\b/i, reason: `${DESTRUCTIVE_REASON}: unsubscribe` },
  { pattern: /\bcancel subscription\b/i, reason: `${DESTRUCTIVE_REASON}: cancel subscription` },
];

/** 규칙 2 — 비밀 입력칸의 name·label. type=password 는 guard.ts 가 inputType 으로 따로 본다 */
export const SECRET_FIELD_PATTERN_LIST: IGuardPattern[] = [
  { pattern: /password/i, reason: `${SECRET_REASON}: 비밀번호` },
  { pattern: /비밀번호/i, reason: `${SECRET_REASON}: 비밀번호` },
  { pattern: /카드번호/i, reason: `${SECRET_REASON}: 카드번호` },
  { pattern: /cvc/i, reason: `${SECRET_REASON}: CVC` },
  { pattern: /cvv/i, reason: `${SECRET_REASON}: CVV` },
  { pattern: /주민/i, reason: `${SECRET_REASON}: 주민등록번호` },
];

/** 규칙 2 — autocomplete 토큰 (값은 공백 구분 토큰 목록일 수 있다: `billing cc-number`) */
export const SECRET_AUTOCOMPLETE_LIST: IGuardPattern[] = [
  { pattern: /(^|\s)cc-number(\s|$)/i, reason: `${SECRET_REASON}: 카드번호` },
  { pattern: /(^|\s)cc-csc(\s|$)/i, reason: `${SECRET_REASON}: 카드 보안코드` },
  { pattern: /(^|\s)one-time-code(\s|$)/i, reason: `${SECRET_REASON}: 일회용 인증번호` },
];

/** 규칙 3 — URL.hostname 에 검사. http(s) 가 아닌 스킴 차단은 guard.ts 가 한다 */
export const PRIVATE_HOST_PATTERN_LIST: IGuardPattern[] = [
  { pattern: /(^|\.)localhost$/i, reason: `${PRIVATE_HOST_REASON}: localhost` },
  { pattern: /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, reason: `${PRIVATE_HOST_REASON}: 127.*` },
  { pattern: /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, reason: `${PRIVATE_HOST_REASON}: 10.*` },
  { pattern: /^192\.168\.\d{1,3}\.\d{1,3}$/, reason: `${PRIVATE_HOST_REASON}: 192.168.*` },
  { pattern: /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, reason: `${PRIVATE_HOST_REASON}: 172.16-31.*` },
  { pattern: /^\[::1\]$/, reason: `${PRIVATE_HOST_REASON}: [::1]` },
];

/** 줄바꿈 없는 공백 — 소스에 문자 그대로 두지 않으려고 코드 값으로 만든다 */
const NBSP = String.fromCharCode(0xa0);

/** 검사 전 정규화 — NBSP→공백, 연속 공백 1개, 앞뒤 공백 제거 */
export function normalizeText(text: string): string {
  return text.replaceAll(NBSP, ' ').replace(/\s+/g, ' ').trim();
}

/** 정규화한 text 에 처음 걸리는 패턴 — 없으면 null */
export function findMatchedPattern(text: string, patternList: IGuardPattern[]): IGuardPattern | null {
  const normalized = normalizeText(text);
  if (normalized === '') return null;
  return patternList.find((item) => item.pattern.test(normalized)) ?? null;
}
