# Spec: 루프·차단 화면에서 멈추고 사용자에게 넘기기

> **상태**: ✅ 완료
> **생성일**: 2026-11-13
> **묶음**: 기반 (직접 방식 — 묶음 하나, Task 1→5 순서)
> **관련 spec**: 004(ask_user·대기), 015(반복 안내), 024(반복 5회째 중단 — 이번에 "묻기"로 바꾼다), 025(잘린 snapshot)
> **설계 참조**: `.claude/rules/agent/tools.md` 「사람 개입 도구」「컨텍스트·비용」

---

## 1. 요구사항

### 배경
- 코레일 run(spec 025 배경)은 `출발일 → 30 → 시각 → 레이어닫기` 를 반복했지만 snapshot 이 부분/전체로 매번 달라 spec 024 의 "같은 화면·같은 행동" 감지에 걸리지 않았다.
- 다음 코레일 run 에서는 페이지에 "매크로, 개발자도구 등 미허가 도구 사용 시 이용이 제한될 수 있습니다", "서비스 연결대기 중입니다" 가 보였는데 에이전트는 그대로 진행했다(사용자가 "매크로 머시기 뜸").
- 사용자 결정(2026-11-13): 루프를 감지하면 **실패 대신 멈추고 사용자에게 묻는다**(그 run 에서 에이전트가 질문으로 넘긴 것처럼). 매크로 경고·접속 대기열·보안문자 화면이면 멈추고 "직접 진행해 주세요"로 넘긴다(탐지 회피는 하지 않는다). 검증은 로컬 재현 페이지 + 가짜 모델.

### 기능 요구사항
- **FR-1 (동작 묶음 반복 감지)**: run 안에서 성공한 상태 변경 도구(click·type_text·select_option·press_key·navigate·go_back·open_tab·switch_tab)의 `{도구}|{요약}` 순서를 기록하고, 길이 k(2~8)의 같은 묶음이 **연달아 3번** 나오면 반복으로 본다. snapshot·read_text·wait_for·list_tabs·scroll 은 순서에 넣지 않는다(화면이 달라도 같은 동작이면 잡는다). 묶음의 원소가 모두 같으면(주기 1, 예: 인원 '+' 6번) FR-1 에서 제외한다 — 같은 행동 연속은 spec 024 의 같은 화면 5회가 맡는다.
- **FR-2 (반복이면 묻기)**: FR-1 이나 spec 024 의 "같은 화면·같은 행동 5회째"가 되면 run 을 실패로 끝내지 않고, 사이드바 질문 카드(ask_user 와 같은 `question` 이벤트·대기)로 묻는다 — 질문 `같은 동작을 반복하고 있습니다: {묶음 요약 최대 4개 ' → '}. 어떻게 할까요?`, 선택지 `["다른 방법으로 계속", "여기서 멈추기 — 직접 할게요"]`(직접 입력 가능).
  - "여기서 멈추기 …" 면 run 을 `stopped` 로 끝낸다(사용자 [중지] 와 같은 경로).
  - 그 밖의 답이면 그 도구 결과 끝에 `\n[사용자 확인] 같은 순서를 반복하지 않는다. 사용자 답: {답}` 를 붙여 모델에 돌려주고, 반복 기록(묶음 순서·화면/행동 횟수)을 비운다.
- **FR-3 (차단 화면이면 넘기기)**: snapshot·read_text 결과 글에 아래 문구가 있으면 같은 방식으로 묻는다 — 질문 `이 페이지가 자동 조작을 막는 화면을 보여 줍니다(“{찾은 줄 앞뒤 최대 60자}”). 직접 진행해 주세요.`, 선택지 `["직접 진행할게요 — 여기서 멈추기", "해결했어요 — 이어서 진행"]`. 멈추기면 `stopped`, 그 밖이면 결과 끝에 `\n[사용자 확인] 사용자 답: {답}`. 같은 페이지(URL 경로까지)·같은 문구로는 run 에서 한 번만 묻는다.
  - 문구(대소문자 무시): `매크로`가 들어 있고 같은 줄 40자 안에 `제한|차단|금지|탐지|방지`, `자동\s?입력\s?방지`, `보안\s?문자`, `captcha`, `로봇이 아닙니다`, `not a robot`, `verify (that )?you are (a )?human`, `unusual traffic`, `비정상적인 (접근|요청|트래픽)`, `서비스 연결\s?대기`, `접속\s?대기`, `대기\s?순번`.
- **FR-4**: 이 질문들은 DB step 에 ask_user 처럼 남는다(tool `ask_user`, 입력 `{question}`, 답 원문은 저장하지 않음 `[답변 생략]`). 도구 호출 수에는 세지 않는다.

### 설계 변경
- spec 024 FR-3 "5회째 run failed" → "5회째 사용자에게 묻기"(FR-2). `AGENT_MESSAGE.repeatStop`·`stopForRepeat` 를 없애고 `stopByUser`(stopped) 로 바꾼다. 규칙 문서 갱신.

### 안전 요구사항
- **SR-1**: 가드·승인 흐름·도구 목록·도구 입력 스키마를 바꾸지 않는다. 묻는 동안 어떤 행동도 실행하지 않는다(대기는 기존 `waitForUser` — 중지·종료면 cancelled).
- **SR-2**: 차단 화면을 우회·회피하는 동작(탐지 회피, 보안문자 풀기, 대기열 건너뛰기)을 하지 않는다 — 감지하면 넘기기만 한다.
- **SR-3**: 답 원문은 DB 에 저장하지 않는다(spec 004 SR-5).

### 범위 제외
- 실제 사이트 호출 테스트, 픽셀 도구(computer toolset) 쪽 반복 감지, 반복 감지 기준 설정 화면

---

## 2. 설계 개요
- `src/main/agent/repeatTracker.ts` — `IRepeatTracker` 에 `actionList: string[]`·`reset()`, `noteAction(tracker, key)`, `findRepeatedCycle(actionList): string[] | null`(k=2..8, 3연속), `REPEAT_STOP_THRESHOLD` 는 "묻기" 기준으로 의미만 바뀜(`shouldStop` → `shouldAsk`).
- `src/main/agent/blockScreen.ts` — `BLOCK_SCREEN_PATTERN_LIST`, `findBlockScreenPhrase(text): string | null`(찾은 줄 앞뒤 60자).
- `src/main/agent/tools/handover.ts` — `askHandover(ctx, { question, optionList, stopOption }): Promise<string>`: `beginStep({ tool: 'ask_user', storedInput: { question }, summary })` → `endStep(n,'waiting',…)` → `ctx.waitForUser({ kind: 'question', … })` → cancelled 면 `HALTED` 표시, 답이 stopOption 이면 `ctx.stopByUser()`, `endStep(n,'ok','[답변 생략]')`, 붙일 문구 반환.
- `reset()` 은 `actionList`·횟수·`lastScreenKey` 만 비우고 `askedBlockKeySet` 은 비우지 않는다. 한 결과에서 차단 문구와 반복이 함께 걸리면 **차단 질문 하나만** 묻고, 그 답이 멈추기가 아니면 반복 기록도 비운다.
- `tools/index.ts` — `IGuardedActionSpec.annotate` 를 `T | Promise<T>` 로, `executeStep` 이 await. 구조 도구 annotate: noteRepeat(화면) + 상태 변경 도구면 noteAction(묶음) + snapshot·read_text 면 차단 문구 → 하나라도 걸리면 askHandover. `IToolRunContext.stopForRepeat` → `stopByUser`.
- `service.ts` — `stopByUser = halt('stopped')`. 차단 문구 질문 기록용 `askedBlockKeySet` 은 tracker 에 둔다.

## 3. 작업 순서 (Tasks)

### Task 1 — 반복 묶음·차단 문구 순수 함수
- [x] `repeatTracker.ts` FR-1 (`findRepeatedCycle`, `noteAction`, `reset`, `shouldAsk`), `blockScreen.ts` FR-3
- [x] 기존 `repeatTracker.test.ts` 의 `shouldStop` 기대값을 `shouldAsk` 로 갱신, `tools/index.ts` 의 `annotateRepeat` 가 `shouldAsk` 를 읽도록 이름만 바꾼다(동작은 Task 2 전까지 `stopForRepeat` 그대로)
- [x] 5회째 이상 안내를 `\n[반복 N회째] 같은 행동·화면이 반복돼 사용자에게 확인합니다` 로 바꾸고 기대값 갱신 — `tools/__tests__/index.test.ts` 의 5회째 안내 기대값(현재 `실행을 멈춥니다`)도 새 문구로 함께 갱신한다
- **테스트**(검증은 `pnpm test src/main/agent` 전체): `src/main/agent/__tests__/repeatTracker.test.ts` — A→B→C ×3 감지, ×2 미감지, A×6 미감지(주기 1 제외), 사이에 다른 동작이 끼면 미감지, k=8 감지, reset 뒤 0부터; `src/main/agent/__tests__/blockScreen.test.ts` — 코레일 실제 문구 2개·captcha·자동입력 방지·unusual traffic 감지, "매크로" 단독(예: 엑셀 매크로 강좌)·일반 예약 문장 미감지, 찾은 줄 60자 자름. `pnpm test src/main/agent`
- **검증**: `pnpm type-check` + 단위 테스트
- **커밋**: `feat: 동작 묶음 반복·차단 화면 문구 감지 (spec 026 Task 1)`
- **묶음**: 기반

### Task 2 — 넘기기 질문 (agent)
- [x] `tools/handover.ts`, `tools/index.ts`(annotate async, 반복·차단이면 askHandover), `IToolRunContext.stopByUser`(stopForRepeat 대체), `service.ts`, `AGENT_MESSAGE.repeatStop` 제거
- [x] 기존 `e2e/agent-accuracy.spec.ts` 「같은 클릭 반복 (spec 024)」 describe 를 이 Task 에서 함께 바꾼다: 질문 카드(`getByRole('dialog', { name: '에이전트 질문' })` 안 `toContainText('같은 동작을 반복')`) → 카드 안 `getByRole('button', { name: '여기서 멈추기 — 직접 할게요' })` → 상태 '중지됨'
- [x] `computer/__tests__/toolset.test.ts`·`tools/__tests__/index.test.ts` ctx 의 `stopForRepeat` → `stopByUser`; spec 024 의 "5회째 stopForRepeat" 테스트·`service.test.ts` "같은 화면 반복 중단" 테스트를 "묻기" 로 갱신(설계 변경)
- **테스트**: `tools/__tests__/index.test.ts` — 같은 click 5회째면 waitForUser(question) 가 불리고 답 "다른 방법으로 계속" 이면 결과 끝에 `[사용자 확인]`·이후 횟수 초기화, "여기서 멈추기 — 직접 할게요" 면 stopByUser; A→B→C ×3 이면 질문; snapshot 결과에 차단 문구면 질문, 같은 URL·문구 두 번째는 묻지 않음; 질문 step 은 tool ask_user·storedText `[답변 생략]`; 중지(cancelled)면 HALTED; 차단 문구와 반복이 한 결과에서 함께 걸리면 질문 1번(차단)·답이 계속이면 반복 기록도 초기화; reset 뒤에도 같은 URL·문구 차단 질문은 다시 묻지 않음. `service.test.ts` — 같은 화면 snapshot 5회째 → `question` 이벤트, 답 멈추기 → `stopped`. `pnpm test src/main/agent`
- **검증**: `pnpm type-check` + 단위 테스트
- **커밋**: `feat: 반복·차단 화면에서 사용자에게 넘기기 (spec 026 Task 2)`
- **묶음**: 기반

### Task 3 — 프롬프트
- [x] `prompts/system.ts` 안전 규칙에 한 줄: 매크로 경고·보안문자·접속 대기열 화면은 우회하지 말고 ask_user 로 사용자에게 넘긴다. 스냅샷 갱신
- **테스트**: `prompts/__tests__/system.test.ts` 문장 포함 + 스냅샷. `pnpm test src/main/agent/prompts`
- **검증**: `pnpm type-check` + 단위 테스트
- **커밋**: `feat: 차단 화면 우회 금지 안내 (spec 026 Task 3)`
- **묶음**: 기반

### Task 4 — 규칙 문서
- [x] `.claude/rules/agent/tools.md` 「컨텍스트·비용」 반복 줄(5회째 → 묻기, 동작 묶음 3연속), 「사람 개입 도구」에 넘기기 질문 한 줄, `docs/DESIGN.md` §3 반복 줄
- **테스트**: 문서 — `pnpm test src/main/agent` 재실행
- **검증**: `pnpm type-check`
- **커밋**: `docs: 루프·차단 화면 넘기기 규칙 반영 (spec 026 Task 4)`
- **묶음**: 기반

### Task 5 — 로컬 루프 세트 e2e (가짜 모델)
- [x] 픽스처 `e2e/fixtures/pages/bot-block.html`(코레일 문구 "매크로, 개발자도구 등 미허가 도구 사용 시 이용이 제한될 수 있습니다" + "서비스 연결대기 중입니다" + 버튼 하나)
- [x] 시나리오 `layer-cycle.json`(korail-layer: snapshot → (click `$ref(link:출발일)` → snapshot → click `$ref(link:30)` → click `$ref(button:레이어닫기)` → snapshot) ×4 → 끝 문장 — 가짜 모델 `$ref` 는 마지막 snapshot 으로 풀리므로 레이어를 연 뒤 snapshot 을 찍는다. snapshot 은 FR-1 순서에 안 들어가 3바퀴째 레이어닫기 click 에서 질문), `bot-block.json`(snapshot → click 버튼 → 끝 문장), `repeat-click.json` 은 그대로 쓰되 기대를 "질문" 으로
- [x] `e2e/agent-accuracy.spec.ts` (repeat-click 은 Task 2 에서 바꿈): 질문 확인은 `sidebar.getByRole('dialog', { name: '에이전트 질문' })` 안에서 `toContainText`, 선택지는 그 카드 안 `getByRole('button', { name: '<선택지 전체 문구>' })` — ② layer-cycle → 3바퀴째 질문 → "다른 방법으로 계속" 누르면 run 이 이어져 끝 문장까지(완료) ③ bot-block → 첫 snapshot 뒤 질문 "자동 조작을 막는 화면" → 멈추기 → 중지, 버튼 클릭 step 없음
- **테스트**: `make e2e SPEC=e2e/agent-accuracy.spec.ts`, 이어 전체 `make e2e`, `pnpm eval`(가짜) 전부 통과
- **검증**: desktop/app-check — 위 흐름, 콘솔·main 에러 0
- **커밋**: `test: 루프·차단 화면 넘기기 e2e (spec 026 Task 5)`
- **묶음**: 기반

---

## 4. 진행 로그
- 2026-11-13 spec 작성 — 사용자 결정: 루프는 묻기, 차단 화면 넘기기, 로컬 루프 세트로 검증
- 2026-11-13 Task 1~5 완료(직접 방식, 한 커밋). make check 2222 통과, e2e 77/77(로컬 루프 세트 5건 포함), 앱 에러 0, 가짜 eval 전부 통과
- 2026-11-13 품질 게이트 지적으로 handover.ts 짝 테스트(handover.test.ts 8건) 추가
