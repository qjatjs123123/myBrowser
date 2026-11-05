---
description: 안전 게이트(src/main/agent/guard.ts, src/shared/guard/**) 작성·수정 시 — 확정 직전 정지, 비밀 입력 차단, 승인 흐름. 이 파일은 다른 agent 규칙보다 우선한다
paths:
  - "src/main/agent/guard.ts"
  - "src/main/agent/guard/**"
  - "src/shared/guard/**"
---

# Guard 규칙 — 결정적 안전 게이트

**원칙: 모델의 판단과 무관하게, 하네스가 되돌리기 어려운 행동을 막는다.** 프롬프트는 1차, 가드는 2차이며 가드가 최종이다.

## 가드가 보는 것
상태를 바꾸는 모든 도구 호출(`click`, `type_text`, `select_option`, `navigate`, `press`)에 대해 루프 훅이 실행 **전에** `guard.check({ tool, input, target })` 를 부른다. `target` 은 ref 가 가리키는 요소의 role·name·text·href·form action 과 현재 URL (`browser/actions.resolveTarget`).

## 판정 결과
```ts
type TGuardVerdict =
  | { kind: 'allow' }
  | { kind: 'require_approval'; reason: string; display: { action: string; target: string } }
  | { kind: 'block'; reason: string };
```
- `require_approval` → 루프가 run 을 `waiting_user(approval)` 로 바꾸고 모달을 띄운다. **승인 전에는 도구가 실행되지 않는다.** 거부면 모델에 "denied" 결과.
- `block` → 실행하지 않고 모델에 이유를 tool_result(`is_error`)로. 사용자에게는 타임라인에 "차단됨" 표시.

## 규칙 (shared/guard/rules.ts 에 데이터로)
1. **확정·결제 패턴** — 클릭 대상의 텍스트·aria-label·value 또는 URL 이 패턴에 걸리면 `require_approval`:
   `예약 확정|예약하기|결제|결제하기|주문|주문하기|구매|송금|이체|전송|제출|confirm|pay|checkout|purchase|submit order|place order|book now|reserve`
   폼 `submit` 류 press(Enter)도 포커스된 폼의 submit 버튼 텍스트로 같은 검사.
2. **비밀 입력 차단** — `type_text` 대상이 `type=password`·`autocomplete=cc-number|cc-csc|one-time-code` 이거나 name/label 에 `password|비밀번호|카드번호|cvc|cvv|주민` 이 있으면 `block` (모델은 `ask_user` 로 사용자가 직접 입력하게 안내해야 한다).
3. **위험 URL** — `navigate` 대상이 `file:`·`chrome:`·`devtools:`·사설 IP(`127.0.0.1`, `localhost`, `10.`, `192.168.`) 이면 `block` (테스트 모드에서 픽스처 서버 host 는 allowlist).
4. **삭제·탈퇴 패턴** — `삭제|탈퇴|해지|취소하기|delete|unsubscribe|cancel subscription` 은 `require_approval`.
5. **연속 승인 요청 상한** — 같은 run 에서 승인 요청이 5회를 넘으면 `block('too_many_approvals')` 로 run 종료 유도.

패턴은 **정규식 상수 배열**로 두고 각 항목에 이유 문자열을 붙인다. 대소문자 무시, 공백·NBSP 정규화 후 검사.

## 불변 조건
- 가드는 **순수 함수**다 — 네트워크·DB·모델 호출 없음. 입력(도구·인자·target·run 통계) → 판정. 그래서 완전히 단위 테스트된다.
- 가드를 끄는 설정은 없다. "자동 승인" 모드도 만들지 않는다 (사용자가 매번 승인).
- 승인 모달의 `display.action`·`display.target` 은 **실제 요소 텍스트·URL** 을 그대로 쓴다 (모델이 만든 설명이 아님).
- 가드 규칙을 바꾸는 PR 은 spec 의 「안전 요구사항」에 근거가 있어야 하고, `guard/__tests__/rules.test.ts` 에 그 케이스가 추가돼야 한다.

## 테스트
- 규칙마다 걸리는 케이스·안 걸리는 케이스(부분 일치 오탐: "예약 조회" 는 allow) 각 1개 이상.
- e2e: 픽스처 예약 페이지에서 "예약 확정" 앞에서 멈추고, 거부 시 `window.__clickLog` 에 기록이 없음을 확인 (`skills/desktop/app-check`).

## 금지
- ❌ 가드 우회 플래그, 자동 승인, 승인 전 실행
- ❌ 모델이 만든 문자열로 승인 모달 채우기
- ❌ 가드 안에서 비동기 I/O
- ❌ 패턴을 테스트 없이 추가·삭제
