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
상태를 바꾸는 모든 도구 호출(`click`, `type_text`, `select_option`, `navigate`, `open_tab`, `press_key`)과 픽셀 멤버(`computer.left_click|double_click|type|key`)에 대해 공통 파이프라인 `runGuardedAction`(`agent/tools/index.ts`)이 실행 **전에** `checkGuard({ tool, source, input, target, pageUrl, approvalCount, point })` 를 부른다. `target` 은 ref·좌표·포커스 요소의 role·name·text·href·form action·formSubmitText 와 현재 URL (`browser/target.ts`). `request_approval` 도 승인 상한 검사를 위해 가드를 거친다.

## 판정 결과
```ts
type TGuardVerdict =
  | { kind: 'allow' }
  | { kind: 'require_approval'; reason: string; display: { action: string; target: string } }
  | { kind: 'block'; reason: string };
```
- `require_approval` → run 을 `waiting_user` 로 바꾸고 **사이드바 안 승인 창**(`role="alertdialog"`, 기본 포커스 [거부])을 띄운다. **승인 전에는 도구가 실행되지 않는다.** 결정 3종(spec 004):
  - `user_done`([직접 누를게요]→[계속]) — 실행하지 않고 "사용자가 직접 처리함" 결과.
  - `agent`([에이전트가 누르기]) — 대상을 **다시 해석해 재판정**: block 이면 실행 안 함, allow 면 1회, require_approval 이고 display 가 같으면(`isSameDisplay`) **그 호출 1회만** 실행, 다르면 새 승인 요청.
  - `denied`([거부]) — 실행하지 않고 "denied: 사용자가 거부함…" 결과.
  - 중지·앱 종료(`shutdown`) 중 대기는 실행 없이 풀린다. 승인은 1회용이다 — 다음 호출이 같은 버튼이어도 다시 묻는다.
- `block` → 실행하지 않고 모델에 이유를 tool_result(`is_error`)로. 사용자에게는 타임라인에 "차단됨" 표시.

## 규칙 (shared/guard/rules.ts 에 데이터로)
1. **확정·결제 패턴** — 클릭 대상의 텍스트·aria-label·value 또는 URL 이 패턴에 걸리면 `require_approval`:
   `예약 확정|예약하기|결제|결제하기|주문|주문하기|구매|송금|이체|전송|제출|confirm|pay|checkout|purchase|submit order|place order|book now|reserve`
   폼 `submit` 류 press(Enter)도 포커스된 폼의 submit 버튼 텍스트로 같은 검사.
2. **비밀 입력 차단** — `type_text` 대상이 `type=password`·`autocomplete=cc-number|cc-csc|one-time-code` 이거나 name/label 에 `password|비밀번호|카드번호|cvc|cvv|주민` 이 있으면 `block` (모델은 `ask_user` 로 사용자가 직접 입력하게 안내해야 한다).
3. **위험 URL** — `navigate` 대상이 `file:`·`chrome:`·`devtools:`·사설 IP(`127.0.0.1`, `localhost`, `10.`, `192.168.`) 이면 `block` (테스트 모드에서 픽스처 서버 host 는 allowlist).
4. **삭제·탈퇴 패턴** — `삭제|탈퇴|해지|취소하기|delete|unsubscribe|cancel subscription` 은 `require_approval`.
5. **연속 승인 요청 상한** — 같은 run 에서 승인 요청(구조·픽셀·request_approval 합)이 5회를 넘으면 `block('too_many_approvals')` 로 run 종료 유도 (`MAX_APPROVAL_COUNT`).
6. **픽셀 도구 (source='pixel', spec 004)** — 입력 스키마 parse 없이 매핑된 모양만 본다 (`agent/computer/pixelGuard.ts`):
   | 멤버 | 가드 tool | 판정 대상 |
   |---|---|---|
   | `left_click`·`double_click` | `click` | 좌표의 요소 — **null·이름 없음이면 require_approval**(fail-closed) |
   | `type` (포커스가 글 입력칸) | `type_text` (`\n`·`\r` 있으면 submit) | 포커스된 요소 **그 자체**(`resolveTarget({ focused: 'element' })`) — 비밀 칸 block, submit 은 그 칸의 formSubmitText 로 확정 검사, 그다음 **이름·텍스트·값이 모두 빈 칸이면 require_approval**(display `입력`/`입력 후 제출` · `이름 없는 입력칸` 고정 — 픽셀 type 은 좌표가 없다, spec 008) |
   | `type` (포커스가 글 입력칸이 아님) | `click` | 포커스된 요소 (버튼에 `" "` = 클릭) |
   | `key` 에 Return·Enter·KP_Enter·space (조합 포함) | `press_key` Enter | 포커스 대상(폼 안 입력이면 submit 버튼) |
   좌표가 뷰포트 밖이거나 좌표·저장된 커서 위치가 모두 없으면 block. 수식키 클릭(text 필드)은 block.

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
