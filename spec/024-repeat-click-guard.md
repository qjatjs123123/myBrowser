# Spec: 같은 클릭 반복 막기 — 클릭 결과에 화면 변화, 반복 감지 강화·중단

> **상태**: ✅ 완료
> **생성일**: 2026-11-13
> **묶음**: 기반 (직접 방식 — 묶음 하나, Task 1→6 순서)
> **관련 spec**: 015(에이전트 정확도 — snapshot 압축·반복 안내), 003·004(도구·가드 파이프라인), 020(run 상한 실패 방식)
> **설계 참조**: docs/DESIGN.md §3, `.claude/rules/agent/tools.md` 「컨텍스트·비용」

---

## 1. 요구사항

### 배경
사용자 run("이 가게 내일 저녁 7시 2명 예약해줘 없으면 아무시간대", 네이버 지도 예약 레이어, 37단계 후 사용자 중지)에서 에이전트가 `2명` 클릭 → `15` 클릭 → `2명` 클릭 … 을 4바퀴 반복했다. 실행 기록 DB 분석:
- 매크로 방지가 아니다 — 클릭은 매번 성공했고 날짜를 누르면 시간 버튼이 나타났다.
- 이 사이트는 선택 상태를 접근성 트리에 싣지 않는다(aria-pressed/selected 없음). `[active]`(포커스)만 보였다가 다른 곳을 누르면 사라지고, "인원을 먼저 선택해주세요." 안내문은 항상 트리에 있다 → 모델이 인원이 풀렸다고 보고 `2명` 을 다시 누름 → 사이트가 날짜를 초기화 → 시간 버튼이 사라져 이전 ref 클릭이 막힘 → 반복.
- 반복 안내(spec 015 FR-5)는 화면 key 에 `[active]`·`[cursor=pointer]` 가 섞여 늦게(3바퀴째) 붙었고 안내뿐이었다.

### 기능 요구사항
- **FR-1**: 구조 `click` 결과에 클릭 전후 화면 비교 요약을 덧붙인다. 비교용 화면은 ref 표를 바꾸지 않는 **보이는 글**(`body` innerText)을 메인 프레임과 하위 프레임(최대 10개)에서 읽어 이어 붙인 텍스트다 (구현 중 확인: `ariaSnapshot()` 은 기본 모드여도 aria-ref 표를 초기화한다). 형식:
  - 변화가 있으면 `\n화면 변화: 나타남 {n}줄 — {줄1} · {줄2} …(최대 6개, 줄당 60자) / 사라짐 {m}줄 — …(최대 6개)` (한쪽이 0 이면 그 부분 생략, 6개 넘으면 `외 {k}줄`)
  - 변화가 없으면 `\n화면 변화 없음 — 선택 표시가 트리에 안 보일 수 있다. 같은 대상을 다시 누르지 말고 다음 단계로 간다`
  - 클릭으로 URL 이 바뀌었거나(이동) 전후 snapshot 중 하나라도 실패하면 덧붙이지 않는다.
- **FR-2**: 반복 감지 화면 key 는 `[ref=…]` 에 더해 `[active]`·`[cursor=pointer]` 를 지우고 비교한다.
- **FR-3**: 같은 화면에서의 같은 행동(또는 같은 화면 snapshot)이 **5회째**가 되면 run 을 `failed`, 이유 "같은 행동을 반복해 멈췄습니다 — 화면이 바뀌지 않습니다" 로 끝낸다 (도구 호출 한도와 같은 방식: 그 결과는 모델에 돌려주되 이후 도구는 실행하지 않음). 3·4회째는 기존처럼 안내 한 줄.
- **FR-4**: 시스템 프롬프트 「한국 예약 사이트 참고」에 한 줄: 선택 상태가 트리에 안 보일 수 있으니 이미 누른 선택지(인원·날짜·시간)는 다시 누르지 않고(토글·초기화될 수 있음) 클릭 결과의 「화면 변화」로 반영을 판단한다, "먼저 선택해주세요" 같은 안내문은 고정 문구일 수 있다.

### 설계 변경
- spec 015 SR-2·`.claude/rules/agent/tools.md` 「컨텍스트·비용」의 "반복 안내는 실행을 막지 않는다" 를 "3·4회째는 안내, 5회째에는 run 을 failed 로 끝낸다(행동을 대신 실행하지는 않음)" 로 바꾼다.

### 안전 요구사항
- **SR-1**: 가드·승인 흐름·도구 목록·도구 입력 스키마는 바꾸지 않는다. 화면 변화 요약은 click 실행 **뒤**에만 만들고, 클릭 전 비교 읽기는 페이지 DOM 도, Playwright `aria-ref` 표도 바꾸지 않는다(innerText — ariaSnapshot 을 쓰지 않는다). 가드가 판정한 ref 와 click 이 찾는 ref 의 해석 기준이 같다.
- **SR-2**: 반복 중단은 run 을 끝낼 뿐 어떤 행동도 대신 실행하지 않는다. 승인 대기 중인 run 에는 적용되지 않는다(반복 세기는 성공한 구조 도구 결과에서만).
- **SR-3**: step 기록(DB `result_text`)은 지금처럼 원래 결과(`클릭함…`)를 남기고, 화면 변화·반복 안내는 모델에 돌려주는 결과에만 붙인다 (spec 015 와 같음) — 화면 변화에는 페이지 글이 들어가므로 저장하지 않는다.

### 비기능
- 클릭 1회에 snapshot 2회 추가(전·후) — 시간 증가 허용(각 타임아웃은 기존 snapshot 과 같음). 토큰 증가는 결과 최대 약 15줄.
- 비교용 snapshot 은 12k 자 자르기 전 텍스트(최대 60k 자)로 한다.

### 범위 제외
- 픽셀 클릭(computer toolset)의 화면 변화, type_text·select_option 의 화면 변화
- 사이트의 시각적 선택 상태(CSS 클래스)를 추정해 트리에 표시하는 것

---

## 2. 설계 개요
- `src/main/browser/snapshotDiff.ts` — `toScreenLineList(text)`(앞뒤 공백 정리·빈 줄 제외 — innerText 줄), `diffScreen(before, after)` → `{ addedList, removedList }`(다중집합 차), `formatScreenChange(diff)` → FR-1 문구.
- `src/main/browser/snapshot.ts` — 비교용 `readScreenText(page)`: `page.frames()`(메인 먼저, 최대 10개)의 `frame.locator('body').innerText({ timeout })`(ref 표 불변)을 이어 붙여 60k 자로 자름, 메인 프레임 실패면 null(하위 프레임 실패는 건너뜀).
- `src/main/browser/driver.ts` `clickWithCursor` — before 읽기 → `actions.click` → 성공이고 URL 이 안 바뀌었으면 after 읽기 → 성공 결과 `{ ok: true, text, note }` 의 `note` 에 변화 요약. `TActionResult` 성공 쪽에 선택 필드 `note?: string` (`src/shared/tools/driver.ts`) — `text` 는 step 기록용 그대로.
- `src/main/agent/tools/index.ts` `runStructureTool` — `act` 의 value = `text + (note ?? '')`, step 기록 text = `text` (SR-3).
- `src/main/agent/repeatTracker.ts` — `MARK_PATTERN` 확장(FR-2), `REPEAT_STOP_THRESHOLD = 5`, `noteRepeat` 가 `{ notice, shouldStop }` 반환. 안내 문구: 5회째는 `[반복 5회째] 같은 행동·화면이 반복돼 실행을 멈춥니다`.
- `IToolRunContext.stopForRepeat()` — service 가 `endRun(fail, AGENT_MESSAGE.repeatStop)` + `halt('failed')` (countToolCall 과 같은 방식).

## 3. 작업 순서 (Tasks)

### Task 1 — snapshotDiff 순수 함수
- [x] `src/main/browser/snapshotDiff.ts`
- **테스트**: `src/main/browser/__tests__/snapshotDiff.test.ts` — 입력은 innerText 형식, 첫 줄도 비교에 들어감 1건, 나타남/사라짐/변화 없음, 6개 초과 `외 k줄`, 줄 60자 자름, 이름 없는 구조 줄 제외. `pnpm test src/main/browser/__tests__/snapshotDiff.test.ts`
- **검증**: `pnpm type-check` + 단위 테스트
- **커밋**: `feat: snapshot 화면 변화 비교 함수 (spec 024 Task 1)`
- **묶음**: 기반

### Task 2 — click 결과에 화면 변화 (browser)
- [x] `TActionResult` 에 `note?: string` (`src/shared/tools/driver.ts`), `snapshot.ts` `readScreenText`, `driver.ts` `clickWithCursor` 전후 비교
- [x] 픽스처 `e2e/fixtures/pages/booking-toggle.html` — 인원 버튼(1명·2명, aria 선택 상태 없음), 날짜 버튼(14·15), 날짜를 누르면 시간 버튼(오후 6:00·7:00) 표시, 인원을 다시 누르면 날짜·시간 초기화, 안내문 "인원을 먼저 선택해주세요." 항상 표시
- [x] 기존 `src/main/browser/__tests__/driver.test.ts` 의 click 기대값(`toEqual({ ok: true, text: '클릭함' })`)을 `note` 를 포함한 모양으로 갱신 — `text` 는 `'클릭함'` 그대로 확인
- **테스트**: `src/main/browser/__tests__/driver.test.ts`(headless chromium + 픽스처): 15 클릭 → note 에 "나타남" 과 "7:00", 2명 재클릭 → "사라짐", 아무 변화 없는 클릭 → "화면 변화 없음", 링크 이동 클릭 → note 없음; `snapshot.test.ts`: ① `readScreenText` 전후로 같은 ref 가 같은 요소로 풀린다 ② 부분 snapshot 바깥의 옛 ref 는 `readScreenText` 뒤에도 click 이 'ref … 를 찾을 수 없습니다' 로 실패한다 ③ iframe 안 버튼 글도 비교 텍스트에 들어간다 (인라인 버튼은 innerText 에서 한 줄로 붙을 수 있다). `pnpm test src/main/browser`
- **검증**: `pnpm type-check` + 단위 테스트
- **커밋**: `feat: click 결과에 화면 변화 요약 (spec 024 Task 2)`
- **묶음**: 기반

### Task 3 — 도구 래퍼·반복 중단 (agent)
- [x] `src/main/agent/computer/__tests__/toolset.test.ts` 의 ctx 에 `stopForRepeat: vi.fn()` 추가, `noteRepeat` 반환형 변경에 맞춰 `repeatTracker.test.ts` 기존 기대값 갱신
- [x] `tools/index.ts` note 를 모델 결과에만, `repeatTracker.ts` FR-2·FR-3, `IToolRunContext.stopForRepeat`, `service.ts` 구현, `AGENT_MESSAGE.repeatStop`(`src/main/agent/service.ts` 의 AGENT_MESSAGE)
- **테스트**: `src/main/agent/__tests__/repeatTracker.test.ts`(active·cursor 무시, 5회째 shouldStop), `src/main/agent/tools/__tests__/index.test.ts`(note 가 모델 결과엔 있고 endStep text 엔 없음, 5회째 stopForRepeat 호출), `src/main/agent/__tests__/service.test.ts`(stopForRepeat → failed·이유). `pnpm test src/main/agent`
- **검증**: `pnpm type-check` + 단위 테스트
- **커밋**: `feat: 같은 행동 5회째 run 중단 (spec 024 Task 3)`
- **묶음**: 기반

### Task 4 — 프롬프트
- [x] `agent/prompts/system.ts` 예약 참고 한 줄 (FR-4), 스냅샷 갱신
- **테스트**: `src/main/agent/prompts/__tests__/system.test.ts` 스냅샷 + 문장 포함. `pnpm test src/main/agent/prompts`
- **검증**: `pnpm type-check` + 단위 테스트
- **커밋**: `feat: 예약 선택지 재클릭 금지 안내 (spec 024 Task 4)`
- **묶음**: 기반

### Task 5 — 규칙·설계 문서
- [x] `.claude/rules/agent/tools.md` 「컨텍스트·비용」 반복 안내 줄을 FR-2(active·cursor 제거)·FR-3(5회째 중단)·FR-1(click 결과의 화면 변화 — 모델에만, step 기록엔 없음)에 맞게, `docs/DESIGN.md` §3 해당 줄도
- **테스트**: 문서 변경 — `pnpm lint` 영향 없음 확인, Task 1~4 테스트 재실행 `pnpm test src/main`
- **검증**: `pnpm type-check` + 단위 테스트
- **커밋**: `docs: 반복 중단·클릭 화면 변화 규칙 반영 (spec 024 Task 5)`
- **묶음**: 기반

### Task 6 — e2e (가짜 모델)
- [x] 시나리오 `e2e/fixtures/model/repeat-click.json` — snapshot → (click 2명 → click 15 → snapshot) × 6 → 끝 문장. `e2e/agent-accuracy.spec.ts` 에 describe 추가: booking-toggle 에서 실행 → 상태 "실패", 사이드바에 "같은 행동을 반복해 멈췄습니다", 끝 문장(완료 요약)은 보이지 않음
- **테스트**: `make e2e SPEC=e2e/agent-accuracy.spec.ts`, 이어 전체 `make e2e`
- **검증**: desktop/app-check — 위 흐름, 콘솔·main 에러 0
- **커밋**: `test: 같은 클릭 반복 중단 e2e (spec 024 Task 6)`
- **묶음**: 기반

---

## 4. 진행 로그
- 2026-11-13 spec 작성 (원인: 실행 기록 DB 최근 run #16~#37)
- 2026-11-13 Task 2 구현 중 기본 모드 ariaSnapshot 도 ref 표를 초기화함을 테스트로 확인 → 비교 읽기를 innerText 로 변경(FR-1·SR-1·설계 갱신). 화면 key 의 active·cursor 제거(FR-2)는 반복 감지(모델이 보는 ai snapshot)에만 해당
- 2026-11-13 Task 1~6 완료(직접 방식). make check 2181 통과, e2e 74/74, 앱 에러 0, 가짜 모델 eval 전부 통과
