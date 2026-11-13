---
description: 에이전트 루프·도구·프롬프트(src/main/agent/**, src/shared/tools/**) 작성·수정 시 — 도구 설계, 루프, 모델 호출, 컨텍스트 관리, 테스트
paths:
  - "src/main/agent/**"
  - "src/shared/tools/**"
---

# Agent 규칙 — 루프·도구·프롬프트

설계 배경은 `docs/DESIGN.md` §3. 안전 게이트는 `rules/agent/guard.md`(이 파일보다 우선).

## 모델 호출 (loop.ts)
- `@anthropic-ai/sdk` 의 `client.beta.messages.toolRunner(...)` + `betaZodTool` 을 쓴다 — 루프를 손으로 쓰지 않는다. 턴별 훅에서 가드·로그·이벤트 발신을 한다.
- 기본값: `model: 'claude-opus-5-5'`, `output_config: { effort: 'high' }`, `max_tokens: 64000` 이상, **스트리밍**(`.stream`), `thinking` 파라미터는 보내지 않는다(기본 adaptive). `betas: ['server-side-fallback-2026-07-01']` + `fallbacks: 'default'`. 모델 id 는 `env.ts`/settings 에서 바꿀 수 있게 하되 **날짜 접미사 금지**.
- 클라이언트·모델 id·`betas`·`fallbacks`·computer toolset 포함 여부는 **모델 프로필**(`agent/profiles/`, spec 007)이 정한다 — 서비스·루프에서 프로필 kind 로 분기하지 않는다. `dev`(사내 프록시)는 프록시 비호환으로 computer toolset·`fallbacks`·server-side-fallback 베타를 뺀다. 새 경로는 전략 파일 하나 + `createModelProfile` 분기 하나로 더한다.
- 클라이언트 도구는 `eager_input_streaming: true` + 실행 전 zod `safeParse` (`skills/desktop/zod-usage` §2). `stop_reason` 이 `max_tokens`·`refusal` 이면 도구를 실행하지 않고 run 을 `failed` 로 (refusal 은 `stop_details.category` 를 reason 에).
- **히스토리는 append-only** — 이전 턴의 content(thinking 블록 포함)를 그대로 되돌려 보낸다. 편집·삭제 금지. 긴 run 은 `context_management: { edits: [{ type: 'clear_tool_uses_20250919' }] }` (beta `context-management-2025-06-27`) 로 오래된 도구 결과를 정리한다.
- 프롬프트 캐싱: `system` 과 `tools` 는 고정 prefix, 날짜·위치·선호 같은 가변 정보는 **첫 user 메시지**에. `system` 에 `cache_control: { type: 'ephemeral' }`. 예외: 사용자 지침(스킬)은 run 내내 같은 값이라 cache_control 없는 `system` 두 번째 블록에 둔다 — 고정 블록만 cache_control (spec 013).
- 모델 클라이언트는 `IModelClient` 인터페이스로 주입한다. `fake/` 의 가짜 구현이 e2e·테스트에서 스크립트된 `tool_use` 시퀀스를 재생한다 (`MYBROWSER_FAKE_MODEL=1`).

## 도구 설계 (tools/)
- **도구 1개 = 파일 1개 = 행동 1개.** 이름은 snake_case 동사(`navigate`, `snapshot`, `click`, `type_text`, `select_option`, `scroll`, `wait_for`, `go_back`, `list_tabs`, `read_text`, `ask_user`, `request_approval`).
- 입력 스키마는 `src/shared/tools/{도구}.ts` 의 zod(`.strict()`, 형식까지 제한). 설명(`description`)은 **모델이 읽는 문장** — 언제 쓰고 언제 쓰지 말지, ref 가 어디서 오는지 한 문단. 예시 입력 1개 포함.
- 반환은 텍스트 1블록이 기본. `snapshot` 은 ref 가 붙은 접근성 트리 텍스트(압축·대화상자 우선·길이 제한, `browser/snapshot.ts`), `screenshot` 류만 이미지 블록.
- 모든 도구는 `(ctx: IToolContext, input) => Promise<IToolResult>`. `ctx` 에 현재 탭 handle·browser·emit·run id. 도구 안에서 다른 도구를 부르지 않는다.
- **상태를 바꾸는 도구(click·type_text·select_option·navigate·press)는 실행 전 `guard.check(action)` 를 반드시 거친다** — 루프의 훅이 공통으로 호출하므로 도구 안에서 가드를 생략해도 되지만, 가드를 우회하는 범용 도구(`evaluate`, `run_script`)는 **만들지 않는다**.
- 실패는 throw 가 아니라 `{ ok: false, reason }` → 루프가 `is_error: true` tool_result 로 변환. 타임아웃 기본 10s. 시간 초과 원인이 Playwright 호출 기록에 있으면(가로막힘·안 보임) 다음 행동을 알려 주는 사유로 바꾼다 (`browser/actions.ts` `TIMEOUT_REASON`, spec 025).
- 도구 결과에 **사람 말 요약**(`summary`)을 함께 반환한다 — `agent:event` step 에 그대로 쓴다.

## 사람 개입 도구
- 대기는 **도구 `run` 안의 await** 다 (`ctx.waitForUser` — `agent/waits.ts` 레지스트리). 루프를 멈추거나 다시 시작하지 않는다(히스토리 append-only). 대기는 run 당 동시에 하나(공용 큐 `ctx.runExclusive`).
- `ask_user({ question, optionList? })` → `waiting_user` + `agent:event {type:'question'}` → `agent:answer { runId, requestId, answer }` 가 오면 "사용자 답: …" 을 돌려주고 재개. 답 원문은 DB 에 저장하지 않는다.
- `request_approval({ action, target, reason })` → 승인 창(kind=model, 모델 문장은 "에이전트 설명" 칸에만) → `agent:approve { runId, requestId, decision: 'approved'|'denied' }`. 가드의 승인 요청은 decision `'agent'|'user_done'|'denied'` (`rules/agent/guard.md` 「판정 결과」).
- 넘기기 질문(spec 026): 반복(위 「컨텍스트·비용」)이나 snapshot·read_text 글에 매크로 경고·보안문자·접속 대기열 문구(`agent/blockScreen.ts`)가 보이면 래퍼가 ask_user 와 같은 질문 step 을 만든다 — 차단 화면은 우회하지 않고 넘기기만, 같은 페이지·문구는 run 에서 한 번만, 둘이 함께 걸리면 차단 질문 하나.
- 대기 중 타임아웃은 없다 (사용자가 돌아올 때까지). `agent:stop` 이면 `stopped`, 앱 종료면 `shutdown()` → `failed`("앱이 종료됐습니다") — 어느 쪽도 대기 중인 도구를 실행하지 않는다.

## 프롬프트 (prompts/)
- `system.ts` 의 `buildSystemPrompt({ hasComputerToolset })` 가 섹션을 합쳐 프로필별 고정 문자열 1개를 만든다 (spec 015): 역할 → 도구 사용 순서(항상 snapshot 먼저, 픽셀 도구는 폴백) → 안전 규칙(승인 필요 행동, 비밀번호·카드 입력 금지, 추측 금지·ask_user) → 한국 예약 사이트 참고 → 출력 형식(완료 시 한 줄 요약).
- **결정적으로 검사할 수 있는 규칙은 프롬프트가 아니라 `guard.ts` 에도 둔다** (이중). 프롬프트만 믿지 않는다.
- 프롬프트 변경은 `prompts/__tests__/system.test.ts` 의 스냅샷 테스트를 갱신해야 한다 — 의도치 않은 변경 방지.

## 상태 머신 (runs.ts)
`queued → running ⇄ waiting_user → done | failed | stopped` (대기 중에도 stop·fail 가능. `stopped_before_confirm` 은 spec 003 기록 호환용 enum 으로만 남고 새 전이가 없다 — spec 004). 전이는 `transition(run, event)` 함수 1곳에서만, 불법 전이는 throw. 모든 전이는 `steps` 테이블과 `agent:event` 에 기록.

## 컨텍스트·비용
- `snapshot` 은 압축(`/url: "#…"` 줄 삭제·빈 generic/cell 접기·연속 비활성 항목 3개 이상은 `(비활성 N개 생략)` 한 줄, `browser/snapshotCompact.ts`) 후 열린 dialog 를 `[열린 대화상자]` 로 맨 앞에 싣고 12k 자 제한. 잘리면 잘림 표시 뒤에 `[잘린 부분의 누를 수 있는 요소]`(이름 있는 button·link·입력 줄 원문, ref 포함, 최대 3k 자 — `browser/snapshotTruncate.ts`, spec 025). 잘리면 `snapshot({ ref })` 부분 보기(그 밖 이전 ref 는 무효) — scroll 은 트리를 더 보여 주지 않는다. ref 는 `e12`·`f2e5`(재이동·iframe) 둘 다 (spec 015).
- 스크린샷은 뷰포트 1280×800 이하로 축소, 같은 상태에서 연속 스크린샷 금지(도구 설명에 명시).
- 반복 안내: 같은 화면(ref·`[active]`·`[cursor=pointer]` 를 지운 snapshot) 또는 같은 화면에서의 같은 행동이 3·4회째면 도구 결과 끝에 `[반복 N회째]` 한 줄, **5회째, 또는 상태 변경 동작 묶음(길이 2~8, 원소가 모두 같은 것 제외)이 3연속이면 사용자에게 묻는다**(질문 카드: 다른 방법으로 계속 / 여기서 멈추기 → stopped) — 행동을 대신 실행하지는 않음 (`agent/repeatTracker.ts`·`agent/tools/handover.ts`, spec 024·026).
- 클릭 화면 변화: 이동하지 않은 구조 click 결과에 클릭 전후 보이는 글(innerText, 메인+하위 프레임) 비교 요약(`화면 변화: 나타남/사라짐 …` 또는 `화면 변화 없음`)을 붙인다 — 모델에만, step 기록엔 없음. 비교 읽기에 `ariaSnapshot` 을 쓰지 않는다(기본 모드도 aria-ref 표를 초기화한다) (`browser/snapshotDiff.ts`, spec 024).
- `clear_tool_uses_20250919` 는 `trigger` 3만 입력 토큰·`keep` 3·`clear_at_least` 1만·`exclude_tools: ['ask_user', 'request_approval']` 를 명시한다 (기본 10만 트리거는 snapshot run 에 늦다, spec 015).
- 시스템 프롬프트는 `buildSystemPrompt({ hasComputerToolset })` — 픽셀 도구가 없는 프로필엔 픽셀 문장을 넣지 않는다.
- run 당 최대 도구 호출 수(기본 60)·최대 토큰(usage 합산) 상한을 settings 에 두고 넘으면 `failed(budget)`.

## 테스트
- 루프: `IModelClient` 가짜로 `tool_use → tool_result → end_turn` 시퀀스, 승인 대기·거부·stop 경로 각 1개 이상. 실제 API 호출 금지.
- 도구: headless chromium + `e2e/fixtures/pages/*.html`. 성공 1·실패(없는 ref, 타임아웃) 1 이상.
- 프롬프트: 스냅샷 테스트.

## 금지
- ❌ 수동 while 루프로 SDK toolRunner 대체, 날짜 접미사 모델 id, `budget_tokens`·`temperature` 전송
- ❌ `evaluate`/`run_script` 류 범용 실행 도구
- ❌ 히스토리 편집, 도구 결과 검증 생략
- ❌ 실제 API 를 부르는 테스트, 외부 사이트에 의존하는 테스트
