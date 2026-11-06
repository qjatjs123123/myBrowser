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
- 반환은 텍스트 1블록이 기본. `snapshot` 은 ref 가 붙은 접근성 트리 텍스트(길이 제한, `browser/snapshot.ts`), `screenshot` 류만 이미지 블록.
- 모든 도구는 `(ctx: IToolContext, input) => Promise<IToolResult>`. `ctx` 에 현재 탭 handle·browser·emit·run id. 도구 안에서 다른 도구를 부르지 않는다.
- **상태를 바꾸는 도구(click·type_text·select_option·navigate·press)는 실행 전 `guard.check(action)` 를 반드시 거친다** — 루프의 훅이 공통으로 호출하므로 도구 안에서 가드를 생략해도 되지만, 가드를 우회하는 범용 도구(`evaluate`, `run_script`)는 **만들지 않는다**.
- 실패는 throw 가 아니라 `{ ok: false, reason }` → 루프가 `is_error: true` tool_result 로 변환. 타임아웃 기본 10s.
- 도구 결과에 **사람 말 요약**(`summary`)을 함께 반환한다 — `agent:event` step 에 그대로 쓴다.

## 사람 개입 도구
- 대기는 **도구 `run` 안의 await** 다 (`ctx.waitForUser` — `agent/waits.ts` 레지스트리). 루프를 멈추거나 다시 시작하지 않는다(히스토리 append-only). 대기는 run 당 동시에 하나(공용 큐 `ctx.runExclusive`).
- `ask_user({ question, optionList? })` → `waiting_user` + `agent:event {type:'question'}` → `agent:answer { runId, requestId, answer }` 가 오면 "사용자 답: …" 을 돌려주고 재개. 답 원문은 DB 에 저장하지 않는다.
- `request_approval({ action, target, reason })` → 승인 창(kind=model, 모델 문장은 "에이전트 설명" 칸에만) → `agent:approve { runId, requestId, decision: 'approved'|'denied' }`. 가드의 승인 요청은 decision `'agent'|'user_done'|'denied'` (`rules/agent/guard.md` 「판정 결과」).
- 대기 중 타임아웃은 없다 (사용자가 돌아올 때까지). `agent:stop` 이면 `stopped`, 앱 종료면 `shutdown()` → `failed`("앱이 종료됐습니다") — 어느 쪽도 대기 중인 도구를 실행하지 않는다.

## 프롬프트 (prompts/)
- `system.ts` 가 섹션별 상수를 합쳐 문자열 1개를 만든다: 역할 → 도구 사용 순서(항상 snapshot 먼저, 픽셀 도구는 폴백) → 안전 규칙(승인 필요 행동, 비밀번호·카드 입력 금지, 추측 금지·ask_user) → 한국 예약 사이트 참고 → 출력 형식(완료 시 한 줄 요약).
- **결정적으로 검사할 수 있는 규칙은 프롬프트가 아니라 `guard.ts` 에도 둔다** (이중). 프롬프트만 믿지 않는다.
- 프롬프트 변경은 `prompts/__tests__/system.test.ts` 의 스냅샷 테스트를 갱신해야 한다 — 의도치 않은 변경 방지.

## 상태 머신 (runs.ts)
`queued → running ⇄ waiting_user → done | failed | stopped` (대기 중에도 stop·fail 가능. `stopped_before_confirm` 은 spec 003 기록 호환용 enum 으로만 남고 새 전이가 없다 — spec 004). 전이는 `transition(run, event)` 함수 1곳에서만, 불법 전이는 throw. 모든 전이는 `steps` 테이블과 `agent:event` 에 기록.

## 컨텍스트·비용
- `snapshot` 은 12k 자 제한, 스크린샷은 뷰포트 1280×800 이하로 축소, 같은 상태에서 연속 스크린샷 금지(도구 설명에 명시).
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
