# Spec: 잘린 snapshot 의 버튼 살리기 — 비활성 항목 접기·잘린 부분의 누를 수 있는 요소 목록·가려진 클릭 안내

> **상태**: 📝 계획됨
> **생성일**: 2026-11-13
> **묶음**: 기반 (직접 방식 — 묶음 하나, Task 1→4 순서)
> **관련 spec**: 015(snapshot 압축·12k 잘림·대화상자 우선), 024(클릭 화면 변화·반복 중단)
> **설계 참조**: `.claude/rules/agent/tools.md` 「컨텍스트·비용」, `.claude/rules/electron/main.md` 「브라우저 제어」

---

## 1. 요구사항

### 배경
사용자 run("코레일 대전가는 기차 한달뒤 아무시간대로 예약해줘 결제하기 직전까지", 40단계 후 중지) 실행 기록:
- 코레일 날짜 레이어(`dialog` "날짜 선택")는 여러 달 달력의 **비활성 날짜 칸**(`link [disabled]` + 숫자 자식, 칸마다 2줄)이 수백 줄이라, 레이어만 부분 snapshot 해도(#25·#33) 12k 자에서 잘렸다. 레이어 아래쪽 확정 버튼은 잘린 부분에 있어 모델이 보지 못했다.
- 모델은 날짜 `30`·시각을 고른 뒤 보이는 유일한 버튼 [레이어닫기] 를 눌렀고 → 선택이 버려져 출발일이 계속 비어 있음 → 같은 순서 반복(#20~#40).
- 덤으로 `textbox "출발일"` 클릭이 매번 10초 시간 초과(#7·#16·#20·#29·#40) — 위에 겹친 `link "출발일"` 이 포인터를 가로막는데 사유가 `시간 초과: locator.click: Timeout 10000ms exceeded.` 뿐이라 모델이 이유를 몰랐다.

### 기능 요구사항
- **FR-1 (비활성 접기)**: snapshot 압축에서 같은 부모 아래 **연속한 비활성 항목**(`[disabled]` 가 붙은 link·button·cell·gridcell·option, 이름 유무 무관, 자식 포함) 3개 이상을 한 줄 `- (비활성 {N}개 생략)` 으로 바꾼다. 2개 이하는 그대로.
- **FR-2 (잘린 부분의 누를 수 있는 요소)**: snapshot 이 잘리면(전체·부분 모두) 잘림 표시 뒤에 `[잘린 부분의 누를 수 있는 요소]` 제목과 함께, 잘린 부분에 있던 줄 중 role 이 button·link·textbox·searchbox·combobox·checkbox·radio·switch·tab·menuitem·option·spinbutton 이고 이름(`"…"`)이 있으며 `[disabled]` 가 아닌 줄을 들여쓰기 없이 `- {role} "{name}" … [ref=…]` 원문 그대로(앞 공백만 제거) 싣는다. 같은 줄 중복 제거, 최대 3,000 자(넘으면 `- (외 {k}개)`). 해당 줄이 없으면 제목도 붙이지 않는다. '잘린 부분'은 자른 위치가 들어 있는 줄의 **시작부터** 센다 — 경계에 걸린 줄이 조건에 맞으면 목록에 원문 그대로 싣는다.
- **FR-3 (가려진 클릭 안내)**: 행동(click 등)이 Playwright 시간 초과로 실패하고 오류 본문에 `intercepts pointer events` 가 있으면 사유를 `다른 요소가 가로막아 누를 수 없습니다 — 같은 이름의 link·button 이나 위에 겹친 레이어를 snapshot 에서 찾아 그것을 누른다` 로, `element is not visible` 이면 `보이지 않는 요소라 누를 수 없습니다 — 레이어·탭을 먼저 열거나 다른 요소를 찾는다` 로 바꾼다. 그 밖은 지금처럼 `시간 초과: {첫 줄}`.

### 안전 요구사항
- **SR-1**: 가드·승인 흐름·도구 목록·도구 입력 스키마를 바꾸지 않는다. FR-2 목록은 원문 줄(ref 포함)을 그대로 옮길 뿐 새 ref 를 만들지 않는다 — 가드 대상 판정은 지금처럼 클릭 직전 `resolveTarget` 이 한다.
- **SR-2**: 비활성 항목 접기는 `[disabled]` 인 것만 — 누를 수 있는 항목은 접지 않는다.

### 설계 변경
- spec 015 의 잘림 형식(`{앞 12k}{TRUNCATED_MARK}`) 뒤에 FR-2 목록이 붙을 수 있다 (최대 약 15k 자). `rules/agent/tools.md` 「컨텍스트·비용」 snapshot 줄을 갱신한다.

### 범위 제외
- 잘린 부분의 일반 글(텍스트 줄) 보여 주기, 12k 상한 변경, 코레일 전용 규칙(가드·프롬프트)

---

## 2. 설계 개요
- `src/main/browser/snapshotCompact.ts` — `filterNodeList` 뒤(또는 안)에서 자식 목록의 연속 비활성 run(`DISABLED_ITEM_PATTERN = /^- (link|button|cell|gridcell|option)\b[^\n]*\[disabled\]/`)을 `{ text: '- (비활성 N개 생략)', childList: [] }` 로 접는 `collapseDisabledRunList(nodeList)`.
- `src/main/browser/snapshotTruncate.ts`(새 순수 함수 파일) — `truncateWithActionables(text, maxLength)`: 안 넘으면 그대로, 넘으면 `{앞}{TRUNCATED_MARK}` + `listCutActionables(잘린 부분)`. `TRUNCATED_MARK` 는 snapshot.ts 에 그대로 두고 import (기존 export 유지).
- `src/main/browser/snapshot.ts` `truncate` → `truncateWithActionables` 사용.
- `src/main/browser/actions.ts` `toActionFailure` — TimeoutError 이고 메시지에 `intercepts pointer events` / `element is not visible` 이면 FR-3 문구. `TIMEOUT_REASON` 상수 export(테스트용).

## 3. 작업 순서 (Tasks)

### Task 1 — 비활성 접기
- [ ] `snapshotCompact.ts` FR-1
- **테스트**: `src/main/browser/__tests__/snapshotCompact.test.ts` — 비활성 링크 5개(자식 숫자 포함) → 1줄 `(비활성 5개 생략)`, 2개는 그대로, 사이에 활성 링크가 끼면 run 이 끊김, 활성 항목은 접지 않음, dialog 안에서도 동작. `pnpm test src/main/browser/__tests__/snapshotCompact.test.ts`
- **검증**: `pnpm type-check` + 단위 테스트
- **커밋**: `feat: snapshot 연속 비활성 항목 접기 (spec 025 Task 1)`
- **묶음**: 기반

### Task 2 — 잘린 부분의 누를 수 있는 요소
- [ ] `snapshotTruncate.ts`, `snapshot.ts` 연결
- **테스트**: `src/main/browser/__tests__/snapshotTruncate.test.ts` — 잘리지 않으면 원문, 잘리면 `TRUNCATED_MARK` 뒤 제목+버튼 줄(ref 유지), disabled·이름 없는 줄·일반 글 제외, 중복 제거, 3,000 자 넘으면 `(외 k개)`, 해당 줄 없으면 제목 없음(기존 형식 `{앞}{MARK}` 그대로 — 버튼 없는 `browser-long.html` 잘림 테스트는 그대로 통과), maxLength 가 버튼 줄 한가운데를 자르면 그 버튼 줄이 목록에 원문 그대로 나온다. 기존 `snapshot.test.ts` 의 `maxLength 를 주면 그 길이로 자른다`(browser-form.html 50자) 는 FR-2 로 기대값이 바뀌므로 `text.startsWith(`${앞 50자}${TRUNCATED_MARK}\n[잘린 부분의 누를 수 있는 요소]`)` 와 `- button "예약 확정" … [ref=` 포함을 확인하도록 고친다(설계 변경에 따른 기대값 갱신, 약화 아님). 픽스처 `e2e/fixtures/pages/korail-layer.html`: dialog 는 FR-1 접기 뒤에도 부분·전체 snapshot 모두 12k 를 넘는다(비활성 날짜는 3개 이상 연속 run 으로 접히게 두되, 접히지 않는 긴 시간표 목록(활성 항목·안내 문장)을 둔다). 활성 `link "30"` 은 하나뿐이고 비활성 `30` 은 모두 접히는 run 안에 둔다. 활성 `30`·`link "출발일"` 은 12k 앞부분, `button "선택 완료"` 는 dialog 맨 아래. `textbox "출발일"`(readonly) 위에 `link "출발일"` 이 겹쳐 포인터를 가로막는다. 활성 30 → [선택 완료] 순서로 눌러야 `#departure` 값이 `2026-11-30` 이 된다. `snapshot.test.ts` headless 1건: 레이어 부분 snapshot 결과에 `TRUNCATED_MARK` 와 `[잘린 부분의 누를 수 있는 요소]` 가 있고 `- button "선택 완료"` 가 MARK 뒤에 나오며, 그 ref 로 click 하면(30 을 누른 뒤) 출발일이 `2026-11-30`. `pnpm test src/main/browser`
- **검증**: `pnpm type-check` + 단위 테스트
- **커밋**: `feat: 잘린 snapshot 에 누를 수 있는 요소 목록 (spec 025 Task 2)`
- **묶음**: 기반

### Task 3 — 가려진 클릭 안내
- [ ] `actions.ts` `toActionFailure` FR-3
- **테스트**: `src/main/browser/__tests__/actions.test.ts` — 픽스처 `korail-layer.html` 을 열고 snapshot 으로 얻은 `textbox "출발일"` ref 로 `click(page, { ref }, { timeoutMs: 1000 })` → 사유가 "다른 요소가 가로막아" 로 시작; 보이는 버튼의 ref 를 snapshot 으로 얻은 뒤 `page.locator(…).evaluate(el => el.style.visibility = 'hidden')` 로 숨기고 같은 click → "보이지 않는 요소라", 그 밖 TimeoutError 는 기존 `시간 초과:` (단위 — 가짜 TimeoutError 객체). `pnpm test src/main/browser/__tests__/actions.test.ts`
- **검증**: `pnpm type-check` + 단위 테스트
- **커밋**: `feat: 가려진·보이지 않는 요소 클릭 실패 사유 (spec 025 Task 3)`
- **묶음**: 기반

### Task 4 — 규칙 문서 + e2e (가짜 모델)
- [ ] `.claude/rules/agent/tools.md` 「컨텍스트·비용」 snapshot 줄에 FR-1·FR-2, 「도구 설계」 실패 사유에 FR-3 한 줄
- [ ] 시나리오 `e2e/fixtures/model/korail-layer.json` — snapshot → click `$ref(link:출발일)` → snapshot → click `$ref(link:30)` → click `$ref(button:선택 완료)` → snapshot → 끝 문장. `e2e/agent-accuracy.spec.ts` 에 describe: korail-layer 에서 실행 → 상태 "완료", 타임라인에 "‘선택 완료’ 클릭", 탭의 출발일 값 채워짐
- **테스트**: `make e2e SPEC=e2e/agent-accuracy.spec.ts`, 이어 전체 `make e2e`
- **검증**: desktop/app-check — 위 흐름, 콘솔·main 에러 0
- **커밋**: `test: 잘린 날짜 레이어 확정 버튼 e2e (spec 025 Task 4)`
- **묶음**: 기반

---

## 4. 진행 로그
- 2026-11-13 spec 작성 (원인: 실행 기록 DB 코레일 run #20~#40)
