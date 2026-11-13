# Spec: 에이전트 MVP — CDP 연결·구조 도구·루프·결정적 가드·사이드바 타임라인

> **상태**: ✅ 완료
> **생성일**: 2026-11-05
> **묶음**: 기반, main-browser, agent-loop, main-store, renderer-sidebar
> **관련 spec**: 001, 002
> **설계 참조**: docs/DESIGN.md §2 · §3 · §5(로드맵 2단계)

---

## 1. 요구사항

### 배경 / 목적
spec 002 로 탭·주소창이 있는 브라우저가 생겼다. 이번에는 사이드바에 할 일을 쓰면 Claude 에이전트가 **현재 활성 탭**에서 직접 읽고·이동하고·입력하고·클릭하는 MVP 를 만든다. 승인 모달(로드맵 3단계)은 아직 없으므로, 확정·결제류 행동은 가드가 **실행 전에 run 을 멈춘다**.

### 기능 요구사항
- **FR-1 실행**: 사이드바 입력창(“할 일”)에 문장을 쓰고 [실행](또는 Ctrl/Cmd+Enter)하면 run 이 시작된다. 실행 중에는 [실행] 대신 [중지]가 보이고 입력창은 비활성. run 은 한 번에 하나 — 실행 중에 또 시작하면 `BUSY`.
- **FR-2 대상 탭**: run 은 시작 시점의 활성 탭에서 동작한다. 활성 탭이 새 탭(about:blank)이어도 된다(에이전트가 `navigate`). `list_tabs`·`switch_tab`·`open_tab` 도구로 탭을 나열·전환·새로 열 수 있고, 에이전트가 탭을 바꾸면 화면의 활성 탭도 바뀐다.
- **FR-3 구조 도구**: 에이전트는 「도구 계약」의 13개 도구로 페이지를 다룬다. 요소 지정은 항상 `snapshot` 이 준 ref(`e12`)로 한다.
- **FR-4 타임라인**: 도구 호출마다 사이드바 타임라인(“진행 단계” 목록)에 한 줄이 추가된다 — main 이 만든 사람 말 요약(예: “‘두 번째 페이지’ 링크 클릭”) + 상태(진행 중/완료/오류/차단). renderer 는 도구 JSON 을 해석하지 않는다.
- **FR-5 종료 표시**: run 이 끝나면 결과를 타임라인 아래에 보인다 — 완료: 모델의 마지막 한 줄 요약 / 실패: 이유 / 중지: “중지했습니다” / 가드 정지: “확정 직전에 멈췄습니다 — {행동}: {대상}. 직접 확인하고 누르세요”.
- **FR-6 중지**: [중지]를 누르면 진행 중 모델 요청을 abort 하고 다음 도구를 실행하지 않으며 run 은 `stopped`.
- **FR-7 기록**: run 과 step 은 `userData/mybrowser.db`(내장 `node:sqlite`)에 저장된다 — 앱을 다시 켜도 DB 에 남는다(이번 spec 에 기록 열람 화면은 없음).
- **FR-8 API 키**: main 이 `.env` 의 `ANTHROPIC_API_KEY` 를 읽는다. 없으면(가짜 모델 모드 제외) 실행 시 `AGENT_ERROR` “API 키가 없습니다. .env 에 ANTHROPIC_API_KEY 를 넣고 앱을 다시 켜 주세요” toast.
- **FR-9 가짜 모델**: `MYBROWSER_FAKE_MODEL=1` 이면 실제 API 대신 `MYBROWSER_FAKE_SCENARIO` 로 고른 `e2e/fixtures/model/{이름}.json` 스크립트를 재생한다 — **SDK toolRunner 는 그대로 돌고 HTTP 만 가짜**(「결정 사항 → 가짜 모델」).

### 안전 요구사항
- **SR-1 확정·결제 정지**: `click`·`press_key`(Enter)·`select_option` 대상의 텍스트·aria-label·value·href·form action 또는 현재 URL 이 `rules/agent/guard.md` 규칙 1(확정·결제)·규칙 4(삭제·탈퇴) 패턴에 걸리면 가드가 `require_approval` 을 낸다. **이번 spec 에서는 승인 UI 가 없으므로 도구를 실행하지 않고 run 을 `stopped_before_confirm` 으로 끝낸다.** 모달 표시 문구(`display.action`·`display.target`)는 실제 요소 텍스트·URL 그대로 (모델이 만든 문장 금지).
- **SR-2 비밀 입력 차단**: `type_text` 대상이 `type=password`·`autocomplete=cc-number|cc-csc|one-time-code` 이거나 name/label 에 `password|비밀번호|카드번호|cvc|cvv|주민` 이 있으면 `block` — 실행하지 않고 모델에 `is_error` tool_result(“민감 정보는 입력하지 않습니다. 사용자에게 직접 입력을 요청하라”), 타임라인에 “차단됨”. run 은 계속된다.
- **SR-3 위험 URL 차단**: `navigate`·`open_tab` 의 url 이 http(s) 가 아니거나(`file:`·`chrome:`·`devtools:`·`javascript:`·`data:`) host 가 사설·루프백(`localhost`, `127.*`, `10.*`, `192.168.*`, `172.16-31.*`, `[::1]`)이면 `block`. **테스트 모드(`env.mode === 'test'`)에서만** `127.0.0.1` 을 allowlist(픽스처 서버).
- **SR-4 가드는 끌 수 없다**: 상태를 바꾸는 도구(`navigate`, `open_tab`, `click`, `type_text`, `select_option`, `press_key`)는 루프 공통 래퍼에서 실행 **전** `checkGuard` 를 반드시 거친다. 우회 플래그·자동 승인·범용 실행 도구(`evaluate`/`run_script`) 없음. 가드는 순수 함수(I/O 없음).
- **SR-5 프롬프트 이중화**: 시스템 프롬프트에도 “결제·예약 확정·주문·전송 전에 멈춘다, 비밀번호·카드번호를 입력하지 않는다, 모르면 추측하지 않는다”를 둔다. (`ask_user`·`request_approval` 도구는 3단계 — 이번엔 없다.)
- **SR-6 키 보호**: `ANTHROPIC_API_KEY` 는 main 에서만 읽고 renderer·로그·DB·이벤트에 절대 싣지 않는다.

### 비기능 요구사항 / 제약
- `snapshot` 결과 12,000 자 제한(넘으면 `\n[... 잘림, scroll 로 더 보기]`). run 당 도구 호출 60회 상한 → 넘으면 `failed`(“도구 호출 한도(60회)를 넘었습니다”). 도구 타임아웃 기본 10s.
- 모델 호출은 claude-api 스킬 기준(아래 「모델 호출」) — 모델 id 날짜 접미사·`budget_tokens`·`temperature`·`thinking` 전송 금지.
- 모든 테스트는 실제 Claude API·외부 사이트 없이 — 단위는 가짜 fetch + headless chromium + 로컬 픽스처, e2e 는 가짜 모델 + 픽스처 서버.

### 범위 제외 (Out of Scope)
승인 모달·`ask_user`·`request_approval`·run 재개(3단계), 픽셀 도구·커서 오버레이(4단계), 설정 화면·API 키 UI·`safeStorage`, 실행 기록 열람 화면, 스크린샷 저장, 프롬프트 내 한국 예약 사이트 상세 가이드, 여러 run 동시 실행, 컨텍스트 압축(compaction).

---

## 2. 설계 개요

### 결정 사항
- **SQLite = 내장 `node:sqlite`(`DatabaseSync`)** — 설계 변경(사용자 확인 2026-11-05). better-sqlite3 는 Electron ABI rebuild 시 vitest(Node 22)와 충돌한다. Electron 45(Node 24)·로컬 Node 22 모두 동작 확인. 9단계에서 DESIGN.md §1 갱신.
- **가드는 이번 spec 에서 규칙 1~4 를 모두 구현**하고, `require_approval` 은 3단계 전까지 `stopped_before_confirm` 으로 매핑한다 (규칙 5 승인 횟수 상한은 3단계). 3단계는 이 매핑만 “모달 → 승인 시 실행”으로 바꾼다.
- **브라우저 제어 = playwright-core `connectOverCDP`**. 엔드포인트: `env.cdpPort` 가 0 이 아니면 `http://127.0.0.1:{port}`, 0(테스트)이면 `userData/DevToolsActivePort` 첫 줄의 포트(Chromium 이 씀, 최대 5s 대기). 연결은 첫 run 때 1회, 끊기면 재연결 1회 후 실패.
- **탭 ↔ Page 매핑 = CDP targetId**. Electron 쪽: `ITabView.getCdpTargetId()` — `webContents.debugger.attach('1.3')`(이미 붙어 있으면 생략) 후 `sendCommand('Target.getTargetInfo')` 의 `targetInfo.targetId`, 탭당 캐시. Playwright 쪽: `browser.contexts().flatMap(c => c.pages())` 각 page 에 `context.newCDPSession(page)` → `Target.getTargetInfo` 로 같은 id 를 찾는다(캐시, 못 찾으면 0.2s 간격 5s 재시도).
- **snapshot = `page.ariaSnapshot({ mode: 'ai' })`** (Playwright 1.64 — `[ref=e2]` 포함 텍스트). ref 해석은 `page.locator('aria-ref=e2')`. ref 는 마지막 snapshot 기준이며, 없는 ref 는 `{ ok:false, reason: 'ref e99 를 찾을 수 없습니다. snapshot 을 다시 찍어라' }`.
- **가드 target 해석**: `IBrowserDriver.resolveTarget(ref)` 가 locator 의 role·접근 이름·innerText(200자)·value·href·가장 가까운 form 의 action·**그 form 의 submit 버튼 name/text(`formSubmitText`, 없으면 '')**·input type·autocomplete·name·연결 label 과 page URL 을 읽는다 (playwright `locator.evaluate` — 우리 코드가 정한 읽기 함수만, 모델 입력을 실행하지 않음). `resolveTarget({ focused: true })`(press_key 용)는 포커스된 요소가 폼 안의 입력이면 그 폼의 submit 버튼을, 아니면 **포커스된 요소 자체**(버튼·링크 등)를 target 으로 돌려준다 — Tab 으로 폼 밖 “예약 확정” 버튼에 포커스한 뒤 Enter 하는 우회를 막는다.
- **fail-closed**: ref 를 받는 상태 변경 도구(`click`·`type_text`·`select_option`)에서 `target === null` 이면 `block`(“대상을 확인할 수 없습니다. snapshot 을 다시 찍어라”). `press_key` Enter 에서 포커스 대상이 null(문서 body 등)이면 pageUrl 검사만 하고 allow.
- **모델 호출** (claude-api 스킬 `typescript/claude-api/tool-use.md` 확인 사항):
  - `client.beta.messages.toolRunner({ model, max_tokens: 64000, stream: true, system: [{ type:'text', text: SYSTEM_PROMPT, cache_control:{ type:'ephemeral' } }], tools, messages: [{ role:'user', content: firstUserMessage }], output_config: { effort: 'high' }, betas: ['server-side-fallback-2026-07-01', 'context-management-2025-06-27'], fallbacks: 'default', context_management: { edits: [{ type: 'clear_tool_uses_20250919' }] } })`. `thinking`·`temperature` 는 보내지 않는다(Opus 5.5 는 adaptive 가 기본).
  - 도구는 `betaZodTool({ name, description, inputSchema, run, eager_input_streaming: true })` (`@anthropic-ai/sdk/helpers/beta/zod`; SDK < 0.136 이면 `{ ...betaZodTool(...), eager_input_streaming: true }`). betaZodTool 이 zod 검증 실패 입력으로 `run` 을 부르지 않는다.
  - 턴마다 `for await (const stream of runner)` → `await stream.finalMessage()` 로 `stop_reason` 확인: `max_tokens`·`refusal` 이면 run `failed`(refusal 은 `stop_details?.category` 를 reason 에) 하고 루프를 끝낸다. 마지막 메시지의 text 블록이 완료 요약. iteration 에서 SDK 가 던지는 JSON 파싱 오류만 잡아 run `failed`(“모델 응답을 해석하지 못했습니다”), 타입 있는 API 오류(`Anthropic.AuthenticationError` 등)는 사용자 문장으로 바꿔 `failed`.
  - 중지·가드 정지: run 마다 `AbortController` 를 만들어 runner 요청 옵션(`signal`)으로 넘긴다. `stop()`·`stopBeforeConfirm()` 은 **정지 플래그(`'stopped'|'guard'`)를 세우고 즉시 `abort()`** 한다. 공통 도구 래퍼 `run` 은 ⓪단계에서 플래그를 확인해 서 있으면 도구 실행·step 기록 없이 즉시 반환한다(같은 턴의 나머지 tool_use 도 실행되지 않음). iteration 중 abort 로 생긴 `APIUserAbortError` 는 플래그에 따라 `stopped`/`stopped_before_confirm` 로 매핑하고 **`failed` 로 보내지 않는다**. SDK 의 정확한 옵션명·에러 클래스명은 구현 시 설치된 SDK 타입으로 확인한다(추측 금지).
  - **종료 전이는 run 당 정확히 1회**(종료 이벤트 + store 갱신 + `status` 이벤트). `stopBeforeConfirm()` 은 스스로 run 을 끝낸다(`guard_stopped` → `status(stopped_before_confirm)`) 후 abort. `stop()` 은 플래그·abort 만 하고, `stopped` 이벤트 → `status(stopped)` 는 루프의 abort 처리가 끝낸다. 루프의 abort·예외·정상 종료 경로는 run 이 이미 종료 상태(`isFinalStatus`)면 아무 전이 없이 빠져나온다.
  - 첫 user 메시지 = `오늘: {YYYY-MM-DD (요일)}\n현재 탭: {url} — {title}\n\n할 일: {task}` (가변 정보는 system 이 아니라 여기 — 캐시 prefix 유지).
  - 모델 id 기본 `claude-opus-5-5`, `MYBROWSER_MODEL` 로 바꿀 수 있다(날짜 접미사 포함 값은 env 검증에서 거부: `/-\d{8}$/`).
- **가짜 모델**: `IModelClient` = `Pick<Anthropic, 'beta'>` 수준의 SDK 클라이언트. 실제는 `new Anthropic({ apiKey })`, 가짜는 `new Anthropic({ apiKey: 'fake', fetch: createFakeFetch(scenario) })` — `createFakeFetch` 가 `/v1/messages` 요청 n 번째에 시나리오 n 번째 턴을 **SSE 스트림**(`message_start` → 블록별 `content_block_start`/`content_block_delta`(text_delta·input_json_delta)/`content_block_stop` → `message_delta`(stop_reason) → `message_stop`)으로 돌려준다. 받은 요청 본문은 `requestList` 에 기록(테스트 단언용). 시나리오가 끝났는데 요청이 오면 `end_turn` + “(시나리오 끝)”.
  - 시나리오 형식(`src/shared/agent/fakeScenario.ts` zod): `{ turns: [{ content: [{ type:'text', text } | { type:'tool_use', name, input }], stop_reason?: 'tool_use'|'end_turn'|'max_tokens'|'refusal' }] }` — stop_reason 생략 시 tool_use 블록이 있으면 `tool_use`, 없으면 `end_turn`. tool_use id 는 `toolu_fake_{n}`.
  - **ref 자리표시자**: input 의 문자열 값 `"$ref(button:예약 확정)"` 은 요청 messages 중 마지막 `snapshot` tool_result 텍스트에서 `- {role} "{name}" [ref=eN]` 줄을 찾아 `eN` 으로 바꾼다(못 찾으면 `e0`). 픽스처 페이지의 ref 번호를 시나리오에 박지 않기 위함.
- **run 상태 머신** (`src/main/agent/runs.ts`): `queued → running → done | failed | stopped | stopped_before_confirm`. (`waiting_user` 는 enum 에만 두고 이번엔 전이 없음.) `transition(status, event)` 한 곳, 불법 전이는 throw. 전이마다 store 갱신 + `agent:event {type:'status'}`.
- **AgentService** (`src/main/agent/service.ts`): `createAgentService({ createModelClient: () => IModelClient, createDriver: () => Promise<IBrowserDriver>, runStore, emit, now, createId, guardOptions, model, maxToolCalls, log })` → `{ start(task): Promise<{ ok: true; runId } | { ok: false; code: 'BUSY'|'AGENT_ERROR'; message }>, stop(runId): boolean }`. 시작 탭은 조립 코드가 `createDriver` 안에서 `tabManager.getActiveTabId()` 로 읽는다. `start` 는 ①실행 중이거나 시작 중(`isStarting`)이면 BUSY, 아니면 **동기적으로 즉시** `isStarting = true` (②·③ 실패 시 해제, ④ 에서 run 이 생기면 실행 중으로 전환) ②`createModelClient()` — `MissingApiKeyError` 면 AGENT_ERROR(FR-8 문장) ③`await createDriver()` — 실패면 AGENT_ERROR “브라우저 제어 연결에 실패했습니다” ④run 생성 후 루프를 `void` 로 백그라운드 실행하고 `{ ok:true, runId }`. 루프 예외는 `failed` 로 기록하고 `[main.error]` 로그(키 문자열 제외 — SR-6).
- **도구 래퍼** (`src/main/agent/tools/index.ts`): `createToolList(ctx)` 가 13개 betaZodTool 을 만든다. 공통 `run`: ⓪정지 플래그가 서 있으면 즉시 반환(실행·기록 없음) ①step 시작 기록·`step` 이벤트(`running`) ②상태 변경 도구면 `driver.resolveTarget`(ref 있을 때)·`checkGuard` → `block` 이면 실행 없이 `is_error` 결과, `require_approval` 이면 도구를 실행하지 않고 step 을 `blocked` 로 완료(④ 기록·이벤트) → `ctx.stopBeforeConfirm(verdict)`(→ `guard_stopped` → `status(stopped_before_confirm)`) 후 “stopped: 사용자 확인 필요 — 루프 종료” 결과 ③도구 실행 ④step 완료 기록·이벤트(`ok`|`error`|`blocked`) ⑤호출 수 상한 확인. `{ ok:false }` 결과는 `is_error` tool_result 로 (SDK 에서 오류 결과를 돌려주는 방식은 설치된 SDK 타입으로 확인 — throw 하면 runner 가 is_error 로 바꾸는지 포함).
- **IPC**: `agent:start`·`agent:stop` invoke, `agent:event` main→renderer. 핸들러는 `src/main/ipc/handlers/agent.ts`(agent-loop 묶음). 조립(`src/main/index.ts`)은 공유 파일 요청 — 메인이 5단계에서 반영.
- **`.env` 로드**: `readEnv` 는 `process.env` 만 읽으므로, `env.ts` 에 `loadDotEnv({ path, source = process.env, exists = existsSync, loadEnvFile = process.loadEnvFile }): void` 를 둔다 — `source.NODE_ENV === 'test'` 또는 `source.MYBROWSER_FAKE_MODEL === '1'` 이면 아무 일도 하지 않고, 파일이 있으면 로드하되 **이미 설정된 값은 덮어쓰지 않고**, 없으면 아무 일도 하지 않는다. `index.ts` 는 `readEnv` 전에 `loadDotEnv({ path: join(app.getAppPath(), '.env') })` 만 부른다 (`process.env` 를 직접 읽지 않음).
- **패키징 앱의 CDP**: 패키징된 앱은 `MYBROWSER_CDP_PORT` 를 명시하지 않으면 CDP 스위치가 꺼져 있어(`src/main/app/cdp.ts`) 에이전트가 AGENT_ERROR 를 낸다. 이번 spec 은 dev·test 만 보장하고, 패키징 앱의 브라우저 제어 경로는 로드맵 5단계(패키징)에서 정한다.
- **e2e 시나리오 파일**·픽스처 페이지·e2e spec 은 vibe-build 7단계(app-check)에서 메인이 만든다(Task 9 검증). 도우미는 만들지 않는다.

### 영향받는 프로세스 / 파일
```
[기반]             package.json·pnpm-lock.yaml (+ @anthropic-ai/sdk, playwright-core 를 dependencies 로)
                   src/shared/ipc/{channels,api,agent}.ts · src/shared/agent/{run,fakeScenario}.ts
                   src/shared/tools/{snapshot,readText,navigate,goBack,click,typeText,selectOption,pressKey,scroll,waitFor,listTabs,switchTab,openTab}.ts
                   src/shared/tools/{index,driver}.ts · src/shared/guard/{rules,types}.ts · src/preload/index.ts · src/main/env.ts
                   vitest.setup.ts(window.api.agent mock) · vitest.setup.main.ts(webContents.debugger mock) · e2e/app-shell.spec.ts(apiKeyList) · tsconfig.node.json(types += vite/client)
[main-browser]     src/main/browser/{endpoint,cdp,snapshot,target,actions,driver}.ts · src/main/browser/types.ts
                   src/main/tabs/{tabType,electronTabView,tabManager}.ts (getCdpTargetId 추가) · e2e/fixtures/pages/browser-*.html(단위 테스트용)
[agent-loop]       src/main/agent/{guard,runs,summary,service,loop}.ts · src/main/agent/tools/{index,…13개}.ts
                   src/main/agent/prompts/system.ts · src/main/agent/fake/{fakeFetch,refPlaceholder}.ts · src/main/agent/modelClient.ts
                   src/main/ipc/handlers/agent.ts
[main-store]       src/main/store/db.ts · src/main/store/migrations/001_runs_steps.sql · src/main/store/repos/runs.ts
[renderer-sidebar] src/renderer/hooks/useAgentRun.ts · src/renderer/sidebar/{AgentPanel,Timeline,RunResult}/ · src/renderer/App.tsx
[5단계 메인 반영]   src/main/index.ts · (필요시) src/main/ipc/registry.ts
[7단계 app-check]  e2e/fixtures/pages/{agent-search,agent-result,reservation,login}.html · e2e/fixtures/model/*.json
                   e2e/fixtures.ts(MYBROWSER_FAKE_SCENARIO 옵션) · e2e/agent-mvp.spec.ts · e2e/app-shell.spec.ts
```

### IPC 계약
스키마 파일 `src/shared/ipc/agent.ts`(요청·이벤트), 공용 타입 `src/shared/agent/run.ts`. 모든 객체는 `z.strictObject`. invoke 응답은 `TIpcResult` 봉투.

```ts
// src/shared/agent/run.ts
RunIdSchema = z.string().min(1)
RunStatusSchema = z.enum(['queued','running','waiting_user','done','failed','stopped','stopped_before_confirm'])
StepStatusSchema = z.enum(['running','ok','error','blocked'])
StepSchema = z.strictObject({ n: z.number().int().min(1), tool: z.string().min(1), summary: z.string(), status: StepStatusSchema })
GuardDisplaySchema = z.strictObject({ action: z.string(), target: z.string() })
// 저장소 인터페이스 (main-store 가 구현, agent-loop 가 사용)
interface IRunStore {
  createRun(run: { id; task; status: TRunStatus; createdAt: string }): void
  updateRun(id, patch: { status?; summary?; reason?; endedAt?; usageJson? }): void
  upsertStep(runId, step: TStep & { inputJson: string; resultText?: string; createdAt: string }): void
  getRun(id): TRunRecord | null      // { id, task, status, summary, reason, createdAt, endedAt }
  listSteps(runId): TStepRecord[]    // n 오름차순
}

// src/shared/ipc/agent.ts
StartAgentRequestSchema = z.strictObject({ task: z.string().trim().min(1).max(2000) })
StartAgentResponseSchema = z.strictObject({ runId: RunIdSchema })
StopAgentRequestSchema = z.strictObject({ runId: RunIdSchema })
AgentEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('status'), runId: RunIdSchema, status: RunStatusSchema }),
  z.strictObject({ type: z.literal('step'), runId: RunIdSchema, step: StepSchema }),
  z.strictObject({ type: z.literal('done'), runId: RunIdSchema, summary: z.string() }),
  z.strictObject({ type: z.literal('failed'), runId: RunIdSchema, reason: z.string() }),
  z.strictObject({ type: z.literal('stopped'), runId: RunIdSchema }),
  z.strictObject({ type: z.literal('guard_stopped'), runId: RunIdSchema, reason: z.string(), display: GuardDisplaySchema }),
])
```

| 채널 (`IPC.agent.*`) | 방향 | 요청 스키마 | 응답/이벤트 스키마 |
|---|---|---|---|
| `agent:start` | invoke | `StartAgentRequestSchema` | `StartAgentResponseSchema` |
| `agent:stop` | invoke | `StopAgentRequestSchema` | `EmptyResponseSchema`(`z.null()`, tabs.ts 재사용) |
| `agent:event` | main→renderer event | — | `AgentEventSchema` (보내기 전 parse) |

- 실패 봉투: 스키마 실패 `INVALID_INPUT` “요청 형식이 올바르지 않습니다” / 실행 중 `BUSY` “이미 실행 중인 작업이 있습니다” / 키 없음·CDP 연결 실패 `AGENT_ERROR`(FR-8 문장 / “브라우저 제어 연결에 실패했습니다”) / 없는·끝난 runId `NOT_FOUND` “실행 중인 작업을 찾을 수 없습니다”.
- 이벤트 순서(한 run): `status(running)` → (`step(running)` → `step(ok|error|blocked)`)* → 종료 이벤트 1개(`done`|`failed`|`stopped`|`guard_stopped`) → `status(종료 상태)`.
- `IApi` 추가분: `agent: { start(req: TStartAgentRequest): Promise<TIpcResult<TStartAgentResponse>>; stop(req: TStopAgentRequest): Promise<TIpcResult<null>>; onEvent(cb: (e: TAgentEvent) => void): TUnsubscribe }`. `Object.keys(window.api)` = `['app','tabs','shortcut','agent']`.

### 도구 계약
입력 스키마는 도구마다 `src/shared/tools/{camelName}.ts`(예: `typeText.ts`)에 `{PascalName}InputSchema`(`z.strictObject`) 하나. `src/shared/tools/index.ts` 는 re-export 와 `RefSchema = z.string().regex(/^e\d+$/)`·`TOOL_NAME_LIST`·`STATEFUL_TOOL_NAME_LIST` 만 둔다. 반환은 텍스트 1블록. 설명(description)은 모델이 읽는 한국어+영어 무관 한 문단 — 언제 쓰고/말지, ref 출처, 예시 입력 1개 (agent-loop Task 에서 작성).

| 도구 | 입력 | 반환 텍스트 | 가드 대상 | 승인 |
|---|---|---|---|---|
| `snapshot` | `{}` | 접근성 트리(ref 포함, 12k 자 제한) + 첫 줄 `URL: … / 제목: …` | — | — |
| `read_text` | `{ ref?: Ref }` | 요소(없으면 본문) innerText, 4k 자 제한 | — | — |
| `navigate` | `{ url: z.url() }` | `이동함: {최종 url} — {title}` | ✅ (SR-3) | — |
| `go_back` | `{}` | `뒤로 감: {url}` | — | — |
| `click` | `{ ref: Ref }` | `클릭함` + 이동했으면 새 URL | ✅ (SR-1) | 패턴 일치 시 정지 |
| `type_text` | `{ ref: Ref, text: z.string().max(1000), submit?: z.boolean() }` | `입력함` | ✅ (SR-2, submit 이면 SR-1 도) | submit+패턴 일치 시 정지 |
| `select_option` | `{ ref: Ref, valueList: z.array(z.string()).min(1).max(10) }` | `선택함: …` | ✅ (SR-1) | 패턴 일치 시 정지 |
| `press_key` | `{ key: z.enum(['Enter','Escape','Tab','ArrowDown','ArrowUp','PageDown','PageUp']) }` | `눌렀음: {key}` | ✅ (Enter 는 SR-1) | 패턴 일치 시 정지 |
| `scroll` | `{ direction: z.enum(['down','up']), amount?: z.enum(['page','half']) }` | `스크롤함` | — | — |
| `wait_for` | `{ text?: z.string().min(1).max(200), ms?: z.number().int().min(100).max(10000) }` (둘 중 하나 이상, `.refine`) | `나타남`/`기다림` 또는 실패 | — | — |
| `list_tabs` | `{}` | 줄마다 `{tabId}{활성이면 *} {title} — {url}` | — | — |
| `switch_tab` | `{ tabId: z.string().min(1) }` | `전환함: {title}` (화면 활성 탭도 전환) | — | — |
| `open_tab` | `{ url?: z.url() }` | `새 탭: {tabId}` (활성으로 열고 이후 대상 탭이 됨) | ✅ (url 있을 때 SR-3) | — |

- 실패는 `{ ok:false, reason }` → `is_error` tool_result. 타임아웃 10s.
- **step 요약**(`src/main/agent/summary.ts`, 순수 함수 `summarizeStep(tool, input, target?)`): `snapshot` “페이지 읽기”, `read_text` “글 읽기”, `navigate` “{host} 열기”, `go_back` “뒤로 가기”, `click` “‘{target.name|text 40자}’ 클릭”, `type_text` “‘{target.name}’에 입력”(text 값은 넣지 않는다 — 비밀 노출 방지), `select_option` “‘{name}’ 선택”, `press_key` “{key} 키”, `scroll` “스크롤”, `wait_for` “기다리기”, `list_tabs` “탭 목록 보기”, `switch_tab` “탭 전환”, `open_tab` “새 탭 열기”.

`IBrowserDriver`(`src/shared/tools/driver.ts`, 타입만 — electron·playwright 비의존):
```ts
type TActionResult = { ok: true; text: string } | { ok: false; reason: string }
interface IGuardTarget { role: string; name: string; text: string; value: string; href: string; formAction: string;
                         formSubmitText: string;   // 가장 가까운 form 의 submit 버튼 name/text, 없으면 ''
                         inputType: string; autocomplete: string; fieldName: string; label: string; pageUrl: string }
interface IBrowserDriver {
  snapshot(): Promise<TActionResult>; readText(i): …; navigate(i): …; goBack(): …; click(i): …; typeText(i): …
  selectOption(i): …; pressKey(i): …; scroll(i): …; waitFor(i): …; listTabs(): …; switchTab(i): …; openTab(i): …
  resolveTarget(req: { ref?: string; focused?: boolean }): Promise<IGuardTarget | null>
  getPageInfo(): Promise<{ url: string; title: string }>
  dispose(): Promise<void>
}
```

가드(`src/main/agent/guard.ts` + 데이터 `src/shared/guard/rules.ts`, 타입 `src/shared/guard/types.ts`):
```ts
type TGuardVerdict = { kind: 'allow' } | { kind: 'require_approval'; reason: string; display: { action: string; target: string } } | { kind: 'block'; reason: string }
checkGuard({ tool, input, target: IGuardTarget | null, pageUrl, allowedHostList: string[] }): TGuardVerdict   // 순수
// rules.ts: CONFIRM_PATTERN_LIST, DESTRUCTIVE_PATTERN_LIST, SECRET_FIELD_PATTERN_LIST, SECRET_AUTOCOMPLETE_LIST, PRIVATE_HOST_PATTERN_LIST
//           — 각 항목 { pattern: RegExp(i), reason: string }. 검사 전 NBSP→공백, 연속 공백 1개, trim.
```
- `display.action` = 도구별 고정 한국어(“클릭”, “Enter 키”, “선택”, “입력 후 제출”), `display.target` = `target.name || target.text || target.value`(80자) + `target.href` 가 있으면 ` (${href})`.
- 확정 패턴은 target 의 name·text·value 와 href·formAction 에 대해 검사, 현재 pageUrl 은 `checkout|payment|order/confirm` 류 URL 패턴만.
- `type_text` + `submit: true`: SR-2 는 입력 필드(type·autocomplete·name·label)로, SR-1 은 `formSubmitText`·`formAction`·`pageUrl` 로 검사. `press_key` Enter 는 focused target 의 name·text·value(폼 안이면 submit 버튼)·href·formAction 으로 SR-1.
- **패턴 일치 방식**: 영어 패턴은 단어 경계(`\bpay\b`, `\bconfirm\b`, `\bcheckout\b` …) — “payment history” 는 안 걸린다. 한국어 패턴은 부분 문자열(보수적) — “결제 내역” 은 걸린다(정지 쪽으로 오탐 허용).
- 가드 판정의 `target === null` 처리는 「fail-closed」.

### 데이터
`src/main/store/migrations/001_runs_steps.sql`(rules/electron/main.md 「저장」) — `db.ts` 가 `import sql001 from './migrations/001_runs_steps.sql?raw'`(vite·electron-vite·vitest 공통 지원, 타입은 Task 1 이 `tsconfig.node.json` 의 `types` 에 추가하는 `vite/client` 의 `*?raw` 선언 — Task 8 은 `.d.ts` 를 만들지 않는다)로 `MIGRATION_LIST = [{ version: 1, sql: sql001 }]` 를 만들고, `PRAGMA user_version` 보다 큰 것을 트랜잭션으로 순서대로 적용.
```sql
-- version 1
CREATE TABLE runs (id TEXT PRIMARY KEY, task TEXT NOT NULL, status TEXT NOT NULL, summary TEXT, reason TEXT,
                   usage_json TEXT, created_at TEXT NOT NULL, ended_at TEXT);
CREATE TABLE steps (run_id TEXT NOT NULL REFERENCES runs(id), n INTEGER NOT NULL, tool TEXT NOT NULL, input_json TEXT NOT NULL,
                    result_text TEXT, status TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (run_id, n));
```
- `type_text` 의 `input_json` 은 `text` 를 `"[입력값 생략]"` 으로 바꿔 저장 (SR-2·SR-6 연장 — 사용자가 직접 쓴 값도 남기지 않는다).
- DB 파일 `userData/mybrowser.db`. 테스트는 `':memory:'`.

### 열린 질문
없음 (안전·API 키·대상 탭·저장 방식·SQLite 드라이버 모두 사용자 확인).

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 테스트와 검증이 모두 에러 0 이 될 때까지 수정 → 재실행, 전부 통과했을 때만 체크박스를 채우고 Task 단위로 커밋한 뒤 다음 Task 로 진행한다.
> 모든 Task 는 테스트 필수. 실제 Claude API·외부 사이트 의존 금지 (`MYBROWSER_FAKE_MODEL=1`, 로컬 픽스처).
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**
> 묶음 순서: `기반`(Task 1) → `main-browser`(Task 2~3) ∥ `agent-loop`(Task 4~7) ∥ `renderer-sidebar`(Task 9) — 첫 자리가 비면 `main-store`(Task 8). agent-loop 는 store 를 `IRunStore` 가짜로, 브라우저를 `IBrowserDriver` 가짜로 테스트한다. main 조립은 Task 7 의 공유 파일 요청(5단계), e2e 는 Task 9 검증(7단계).

- [x] **Task 1: 계약 — IPC·도구 스키마·드라이버/가드 타입·가드 규칙 데이터·env·preload·패키지**
  - **묶음**: 기반
  - **작업**: `pnpm add @anthropic-ai/sdk playwright-core`(playwright-core 는 `@playwright/test` 와 같은 1.64.x 로 고정). `IPC.agent = { start: 'agent:start', stop: 'agent:stop', event: 'agent:event' }`. `src/shared/agent/run.ts`(RunId·RunStatus·StepStatus·Step·GuardDisplay 스키마·타입, `IRunStore`·`TRunRecord`·`TStepRecord` 인터페이스), `src/shared/agent/fakeScenario.ts`(`FakeScenarioSchema` — 「가짜 모델」 형식), `src/shared/ipc/agent.ts`(계약 그대로 + 추론 타입 `TStartAgentRequest`·`TStartAgentResponse`·`TStopAgentRequest`·`TAgentEvent`), `IApi.agent` 추가. 도구 입력 스키마 13개 파일 `src/shared/tools/{camelName}.ts` + `src/shared/tools/index.ts`(re-export, `RefSchema`, `TOOL_NAME_LIST`, `STATEFUL_TOOL_NAME_LIST = ['navigate','open_tab','click','type_text','select_option','press_key']`), `src/shared/tools/driver.ts`(`TActionResult`·`IGuardTarget`(formSubmitText 포함)·`IBrowserDriver`). `src/shared/guard/types.ts`(`TGuardVerdict`·`IGuardInput`), `src/shared/guard/rules.ts`(guard.md 규칙 1~4 의 패턴 배열 — 각 `{ pattern, reason }`, 영어 단어 경계·한국어 부분 일치, `normalizeText()`). preload `agent.start/stop/onEvent`(`subscribe` 재사용). `src/main/env.ts`: `ANTHROPIC_API_KEY`(optional, min 1) → `IEnv.anthropicApiKey?`, `MYBROWSER_FAKE_SCENARIO`(optional, `/^[a-z0-9-]+$/`) → `fakeScenario?`, `MYBROWSER_MODEL`(optional, 날짜 접미사 거부) → `model`(기본 `'claude-opus-5-5'`), `loadDotEnv(…)`(「.env 로드」). `vitest.setup.ts` 의 `window.api` mock 에 `agent.start/stop`(vi.fn)·`agent.onEvent`(해제 vi.fn 반환). `vitest.setup.main.ts` 의 WebContentsView mock webContents 에 `debugger: { attach, isAttached, sendCommand }`(vi.fn) 추가. `e2e/app-shell.spec.ts` 의 `apiKeyList` 기대값을 `['app','tabs','shortcut','agent']` 로 (preload 변경과 같은 커밋 — e2e green 유지). `tsconfig.node.json` `compilerOptions.types` 를 `["node", "vite/client"]` 로 (main 의 `?raw` import 타입).
  - **파일**: `package.json`, `pnpm-lock.yaml`, `src/shared/ipc/{channels,api,agent}.ts`, `src/shared/agent/{run,fakeScenario}.ts`, `src/shared/tools/*.ts`, `src/shared/guard/{types,rules}.ts`, `src/preload/index.ts`, `src/main/env.ts`, `vitest.setup.ts`, `vitest.setup.main.ts`, `e2e/app-shell.spec.ts`, `tsconfig.node.json`
  - **테스트**: `src/shared/ipc/__tests__/agent.test.ts` — start(빈·공백·2001자 거부, 추가 키 거부), stop, AgentEvent 6종 유효/무효(없는 type, step.n 0) · `src/shared/agent/__tests__/fakeScenario.test.ts` — 유효/무효 · `src/shared/tools/__tests__/schemas.test.ts` — 도구별 유효 1·무효 1(ref `x1`, wait_for 빈 입력, select 빈 배열, 추가 키), `TOOL_NAME_LIST` 13개 · `src/shared/guard/__tests__/rules.test.ts` — 패턴별 걸림/안 걸림(“예약 확정” 걸림·“예약 조회” 안 걸림, “Pay now” 걸림·“payment history” 안 걸림, “결제 내역” 걸림, NBSP 정규화) · `src/main/__tests__/env.test.ts` — 키·시나리오·모델 기본값·날짜 접미사 거부, `loadDotEnv` 파일 있음/없음·기존 값 미덮어쓰기·테스트/가짜 모드면 `loadEnvFile` 미호출(가짜 `loadEnvFile`·`exists`·`source`)
  - **실행**: `pnpm test src/shared src/main/__tests__/env.test.ts`
  - **검증**: `pnpm type-check` + 단위 테스트 + `pnpm lint`
  - **통과 기준**: 테스트 + 검증 통과. 기존 테스트 유지
  - **커밋**: `feat: 에이전트 IPC·도구 계약과 가드 규칙 데이터 추가 (spec 003 Task 1)`

- [x] **Task 2: 탭 CDP targetId + CDP 연결·엔드포인트**
  - **묶음**: main-browser
  - **작업**: `src/main/tabs/tabType.ts` `ITabView.getCdpTargetId(): Promise<string>`, `electronTabView.ts` 구현(「탭 ↔ Page 매핑」), `TabManager.getCdpTargetId(id)`(없는 탭 null), 기존 가짜 ITabView 테스트 갱신. `src/main/browser/types.ts` — `ITabsPort { list(): TTabsSnapshot; activate(id); create(url?): string; getCdpTargetId(id): Promise<string | null> }`. `browser/endpoint.ts` — `resolveCdpEndpoint({ port, userDataDir, readFile, sleep })`(port≠0 → URL, 0 → DevToolsActivePort 폴링 5s, 실패 throw). `browser/cdp.ts` — `createCdpConnection({ endpoint, connect = chromium.connectOverCDP, sleep, now })` → `{ getPage(targetId): Promise<Page>, close() }`(targetId 캐시·재시도 대기는 주입한 `sleep`/`now` 로·끊김 시 재연결 1회).
  - **파일**: `src/main/tabs/{tabType,electronTabView,tabManager}.ts`, `src/main/browser/{types,endpoint,cdp}.ts`
  - **테스트**: `src/main/tabs/__tests__/{electronTabView,tabManager}.test.ts` 갱신 — debugger attach/sendCommand 호출·캐시, 없는 탭 null · `src/main/browser/__tests__/endpoint.test.ts` — 고정 포트 URL, 0 이면 파일 첫 줄 포트, 파일 없음 → 재시도 후 throw(가짜 sleep) · `src/main/browser/__tests__/cdp.test.ts` — headless chromium 을 `--remote-debugging-port=0` 로 띄우고(`chromium.launch({ args })` 또는 `launchServer` 불가 시 `chromium.connectOverCDP` 대상 가짜) 픽스처 page 의 targetId 로 같은 Page 를 찾는다, 없는 targetId 는 재시도 후 실패(**`sleep`/`now` 만 가짜로 주입 — `vi.useFakeTimers` 금지**, playwright 내부 타이머를 멈추지 않게)
  - **실행**: `pnpm test src/main/tabs src/main/browser`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 탭 CDP 대상 매핑과 CDP 연결 추가 (spec 003 Task 2)`

- [x] **Task 3: snapshot·target 해석·actions·BrowserDriver**
  - **묶음**: main-browser
  - **작업**: `browser/snapshot.ts` — `takeSnapshot(page, { maxLength = 12000 })`(`page.ariaSnapshot({ mode: 'ai' })`, 첫 줄 URL·제목, 잘림 표시). `browser/target.ts` — `resolveTarget(page, { ref?, focused? })` → `IGuardTarget | null`(「가드 target 해석」). `browser/actions.ts` — 도구 계약의 각 행동 함수 `(page, input) => Promise<TActionResult>`(ref → `aria-ref=` locator, 10s 타임아웃, 실패 `{ ok:false, reason }` — throw 금지; navigate 는 `waitUntil: 'domcontentloaded'`). `browser/driver.ts` — `createBrowserDriver({ tabs: ITabsPort, cdp, startTabId })` → `IBrowserDriver`(현재 대상 탭 id 보관, switch/open 시 `tabs.activate/create` 후 대상 변경, list 는 `tabs.list()`).
  - **파일**: `src/main/browser/{snapshot,target,actions,driver}.ts`, `e2e/fixtures/pages/browser-*.html`
  - **테스트**: headless chromium + 픽스처(이 Task 에서 `e2e/fixtures/pages/browser-*.html` 에 단위 테스트용 페이지 작성 — rules/electron/main.md 「테스트」. 링크·버튼·폼(password·카드번호 필드·submit “결제하기”)·폼 밖 버튼 “예약 확정”·select·긴 본문. `file://` 로 연다) — `snapshot.test.ts`(ref 포함·URL 첫 줄·12k 잘림) · `target.test.ts`(버튼 name·링크 href·form action·**검색 입력의 `formSubmitText` = “결제하기”**·password type·label·focused 폼 입력 → submit 버튼·**Tab 으로 포커스한 폼 밖 “예약 확정” 버튼 → 그 버튼 자체**·없는 ref → null) · `actions.test.ts`(click 성공·없는 ref 실패, type_text·submit, select, press_key, scroll, wait_for text 성공·타임아웃, read_text, navigate·go_back) · `driver.test.ts`(가짜 ITabsPort + 실제 page — list/switch/open 이 포트 호출·대상 변경)
  - **실행**: `pnpm test src/main/browser`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 접근성 스냅샷·브라우저 행동·드라이버 추가 (spec 003 Task 3)`

- [x] **Task 4: 가드·run 상태 머신·step 요약**
  - **묶음**: agent-loop
  - **작업**: `src/main/agent/guard.ts` `checkGuard`(순수, 「가드」·SR-1~3). `runs.ts` `transition(status, event)`(이벤트 `start|finish|fail|stop|guardStop`, 불법 전이 throw), `isFinalStatus`. `summary.ts` `summarizeStep`.
  - **파일**: `src/main/agent/{guard,runs,summary}.ts`
  - **테스트**: `src/main/agent/__tests__/guard.test.ts` — 규칙별 걸림/안 걸림: click “예약 확정” → require_approval(display 가 실제 텍스트), “예약 조회” allow, href `/checkout` require_approval, “회원 탈퇴” require_approval, type_text password·`autocomplete=cc-number`·label “카드번호” block, 일반 검색창 allow, type_text submit + `formSubmitText` “결제하기” require_approval, press_key Enter + focused submit “주문하기” require_approval, **press_key Enter + focused 폼 밖 버튼 “예약 확정” require_approval**, **click·type_text·select_option 의 target null → block**, press_key Tab allow, “payment history” 링크 클릭 allow·“결제 내역” 클릭 require_approval, navigate `file:`·`http://localhost`·`http://192.168.0.1` block, allowedHostList 의 `127.0.0.1` allow, 읽기 도구 allow · `runs.test.ts` — 합법 전이 전부·불법 전이 throw · `summary.test.ts` — 도구별 문구, type_text 요약에 입력값 없음
  - **실행**: `pnpm test src/main/agent`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 결정적 가드와 실행 상태 머신 추가 (spec 003 Task 4)`

- [x] **Task 5: 가짜 모델(fetch) + 모델 클라이언트 + 시스템 프롬프트**
  - **묶음**: agent-loop
  - **작업**: `agent/fake/refPlaceholder.ts` `resolveRefPlaceholders(input, messageList)`. `agent/fake/fakeFetch.ts` `createFakeFetch(scenario)` → `{ fetch, requestList }`(「가짜 모델」 SSE). `agent/modelClient.ts` `createModelClient({ isFake, apiKey, scenario })` → Anthropic 인스턴스(가짜면 fake fetch, 실제는 키 없으면 throw `MissingApiKeyError`). `agent/prompts/system.ts` `SYSTEM_PROMPT`(섹션 상수 합침: 역할 → 도구 순서(항상 snapshot 먼저, ref 는 최신 snapshot 것만) → 안전 규칙(SR-5) → 출력 형식(끝나면 결과 한 줄 요약, 한국어)) + `buildFirstUserMessage({ today, pageUrl, pageTitle, task })`.
  - **파일**: `src/main/agent/fake/{fakeFetch,refPlaceholder}.ts`, `src/main/agent/modelClient.ts`, `src/main/agent/prompts/system.ts`
  - **테스트**: `fake/__tests__/refPlaceholder.test.ts` — 마지막 snapshot 결과에서 치환·못 찾으면 e0·중첩 값 · `fake/__tests__/fakeFetch.test.ts` — **실제 SDK** 클라이언트(`new Anthropic({ apiKey:'fake', fetch })`)로 `client.beta.messages.stream(...)` 2턴: text·tool_use 블록 복원, stop_reason, 요청 기록, 시나리오 소진 시 end_turn · `__tests__/modelClient.test.ts` — 가짜 선택, 키 없음 throw · `prompts/__tests__/system.test.ts` — `SYSTEM_PROMPT` 스냅샷, 안전 문구 포함, 날짜가 system 에 없음, 첫 메시지 형식
  - **실행**: `pnpm test src/main/agent`
  - **검증**: `pnpm type-check` + 단위 테스트 (네트워크 호출 0 — fetch 가짜)
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 가짜 모델과 시스템 프롬프트 추가 (spec 003 Task 5)`

- [x] **Task 6: 도구 13종 + 루프 + AgentService**
  - **묶음**: agent-loop
  - **작업**: `agent/tools/{snapshot,readText,navigate,goBack,click,typeText,selectOption,pressKey,scroll,waitFor,listTabs,switchTab,openTab}.ts` — 각 파일 `{ name, description, inputSchema, execute(driver, input) }` 한 개. `agent/tools/index.ts` `createToolList(ctx)` — 「도구 래퍼」 공통 run 으로 betaZodTool 13개(`eager_input_streaming: true`). `agent/loop.ts` `runAgentLoop({ client, model, tools, systemPrompt, firstUserMessage, signal, onFinal })` — 「모델 호출」 그대로 toolRunner·stop_reason 검사. `agent/service.ts` `createAgentService(…)` — start/stop, 상태 전이·store 기록·이벤트 발신, 가드 정지 시 `guard_stopped` 이벤트와 `stopped_before_confirm`, 호출 60회 상한, 예외 → failed, 끝나면 `driver.dispose()`.
  - **파일**: `src/main/agent/tools/*.ts`, `src/main/agent/{loop,service}.ts`
  - **테스트**: (가짜 fetch 시나리오 + 가짜 `IBrowserDriver`(vi.fn) + 메모리 `IRunStore` 가짜) `agent/__tests__/service.test.ts` — ①snapshot → click → end_turn: 이벤트 순서(계약대로)·step 요약·done 요약·store 기록 ②click 대상 “예약 확정” → driver.click **미호출**, 이벤트 순서 `step(running)` → `step(blocked)` → `guard_stopped`(display 실제 텍스트) → `status(stopped_before_confirm)`(failed 아님), 이후 모델 요청 없음, **같은 턴의 두 번째 tool_use(예: snapshot)도 미실행**, 종료 이벤트·종료 status 이벤트 각 정확히 1회·`failed` 이벤트 없음 ③type_text password → driver.typeText 미호출, step blocked, 모델에 is_error 결과 전달(requestList 마지막 요청의 tool_result), run 은 done 까지 계속 ④도구 실행 중 stop() → 다음 도구 미실행·abort 후 status stopped(failed 아님)·이후 모델 요청 없음·`stopped`/`status(stopped)` 각 정확히 1회·`failed` 이벤트 없음 ⑤실행 중 start → BUSY, **createDriver 가 pending 인 동안 두 번째 start → BUSY 이고 run 은 1개만 생성** ⑤-1 createModelClient 가 `MissingApiKeyError` → AGENT_ERROR(FR-8 문장), createDriver reject → AGENT_ERROR “브라우저 제어 연결에 실패했습니다”, 둘 다 run 미생성 ⑥stop_reason refusal → failed(category 포함) ⑦max_tokens → failed, 도구 미실행 ⑧호출 61회 → failed(한도) ⑨driver.click 이 `{ok:false}` → step error·run 계속 ⑩store 의 type_text input_json 에 입력값 없음 ⑪(SR-6) `apiKey: 'sk-test-key'` 로 실패·성공 run 을 돌려도 그 문자열이 어떤 emit 이벤트·`IRunStore` 호출 인자·`log` 호출 인자에도 없다 · `agent/tools/__tests__/index.test.ts` — 13개 이름 = `TOOL_NAME_LIST`, 모두 eager_input_streaming, 상태 변경 도구만 가드 호출, description 비어 있지 않음
  - **실행**: `pnpm test src/main/agent`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 에이전트 도구·루프·실행 서비스 추가 (spec 003 Task 6)`

- [x] **Task 7: agent IPC 핸들러**
  - **묶음**: agent-loop
  - **작업**: `src/main/ipc/handlers/agent.ts` `createAgentHandlers(service)` — start/stop: safeParse → service → 봉투(「IPC 계약」 실패 봉투 문장 그대로).
  - **파일**: `src/main/ipc/handlers/agent.ts`
  - **공유 파일 요청** (메인이 5단계 합치기 뒤 반영, 커밋 `feat: 에이전트를 메인 창에 연결 (spec 003)`. 직접 방식이면 이 Task 에 포함):
    - `src/main/index.ts`(조립만): `readEnv` 전에 `loadDotEnv({ path: join(app.getAppPath(), '.env') })`(모드 판정은 loadDotEnv 안에서); `openDatabase(join(app.getPath('userData'),'mybrowser.db'))` → `createRunRepo(db)`; `tabsPort` = TabManager 어댑터(`list: getSnapshot`, `activate: activateTab`, `create: createTab`, `getCdpTargetId`); `cdp` 는 첫 `createDriver()` 에서 `resolveCdpEndpoint({ port: env.cdpPort, userDataDir: app.getPath('userData') })` 로 lazy 생성(실패는 reject → service 가 AGENT_ERROR); `createDriver: async () => createBrowserDriver({ tabs: tabsPort, cdp: await getCdp(), startTabId: tabManager.getActiveTabId() })`(활성 탭 없으면 `tabManager.createTab()` 후 그 id); `scenario` = isFakeModel 이면 `join(app.getAppPath(), 'e2e/fixtures/model', `${env.fakeScenario ?? 'default'}.json`)` 읽어 `FakeScenarioSchema.parse`; `createAgentService({ createModelClient: () => createModelClient({ isFake: env.isFakeModel, apiKey: env.anthropicApiKey, scenario }), createDriver, runStore, emit: (e) => emitToSidebar(IPC.agent.event, AgentEventSchema, e), now, createId: randomUUID, guardOptions: { allowedHostList: env.mode === 'test' ? ['127.0.0.1'] : [] }, model: env.model, maxToolCalls: 60 })`; `registerIpc` 에 `...createAgentHandlers(service)`; `before-quit` 에서 db close.
  - **테스트**: `src/main/ipc/__tests__/agent.test.ts` — 성공 봉투, INVALID_INPUT, BUSY, AGENT_ERROR(키 없음 문장·CDP 연결 실패 문장), stop NOT_FOUND
  - **실행**: `pnpm test src/main/ipc`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 에이전트 IPC 핸들러 추가 (spec 003 Task 7)`

- [x] **Task 8: 실행 기록 저장소 (node:sqlite)**
  - **묶음**: main-store
  - **작업**: `src/main/store/migrations/001_runs_steps.sql`(「데이터」 version 1), `db.ts` `openDatabase(path)` → `DatabaseSync`(WAL, foreign_keys ON, `?raw` 로 읽은 마이그레이션 적용), `repos/runs.ts` `createRunRepo(db): IRunStore`(SQL 은 repos 안에만, prepared statement).
  - **파일**: `src/main/store/db.ts`, `src/main/store/migrations/001_runs_steps.sql`, `src/main/store/repos/runs.ts`
  - **테스트**: `src/main/store/__tests__/db.test.ts` — `:memory:` 에서 user_version 1·테이블 존재, 두 번 열어도(임시 파일) 재적용 안 함 · `src/main/store/repos/__tests__/runs.test.ts` — create/get/update, upsertStep 이 같은 n 을 갱신, listSteps 순서, 없는 run null
  - **실행**: `pnpm test src/main/store`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과 (Node 22 ExperimentalWarning 출력은 허용)
  - **커밋**: `feat: 실행 기록 저장소 추가 (spec 003 Task 8)`

- [x] **Task 9: 사이드바 — useAgentRun·AgentPanel·Timeline·RunResult**
  - **묶음**: renderer-sidebar
  - **작업**: `.claude/skills/desktop/design`·`error-toast` 를 따른다. `hooks/useAgentRun.ts` — `agent.onEvent` 구독(현재 runId 이벤트만 반영. `start` 를 부른 순간부터 응답이 올 때까지 runId 를 모르는 이벤트는 버퍼에 모으고, 응답으로 받은 runId 와 같은 이벤트를 순서대로 적용한 뒤 버퍼를 비운다. start 성공 시 hook 이 `status: 'running'` 을 직접 세운다) → `{ runId, status, stepList, result: { kind:'done'|'failed'|'stopped'|'guard_stopped', text } | null, start(task), stop() }`(start/stop 은 봉투 반환, 실패면 호출부 toast). step 은 n 으로 갱신(같은 n 이면 교체). `sidebar/AgentPanel` — `textarea`(`aria-label="할 일"`, placeholder “예: 네이버에서 강남역 맛집 찾아 전화번호 알려줘”), [실행](빈 입력 비활성, Ctrl/Cmd+Enter) / 실행 중 [중지] — 접근 이름은 `aria-label="작업 실행"`·`"작업 중지"`(보이는 글자는 실행/중지; 크롬의 로딩 “중지” 버튼과 이름 겹침 방지), AgentPanel 은 “에이전트” 를 포함한 heading 을 추가하지 않는다(app-shell e2e 의 heading 선택자 보호), 상태 표시(`role="status"`: “실행 중…”/“완료”/“실패”/“중지됨”/“확정 직전 정지”). `sidebar/Timeline` — `role="list"` `aria-label="진행 단계"`, 항목 = 상태 아이콘(lucide, `aria-label` “진행 중”/“완료”/“오류”/“차단됨”) + 요약. `sidebar/RunResult` — FR-5 문구(가드 정지는 경고 톤 + display). `App.tsx` 사이드바 자리 문구를 `<AgentPanel/>` 로 교체(헤더 “에이전트”·`AppInfoFooter` 유지, run 이 없을 때 안내 문구 “할 일을 입력하면 여기에 진행 상황이 표시됩니다” 는 AgentPanel 안 빈 상태로 유지).
  - **파일**: `src/renderer/hooks/useAgentRun.ts`, `src/renderer/sidebar/{AgentPanel,Timeline,RunResult}/index.tsx`, `src/renderer/App.tsx`
  - **테스트**: `hooks/__tests__/useAgentRun.test.ts` — 이벤트 순서 반영, **start 응답 전에 온 이벤트도 반영**, 다른 runId 무시, step 교체, 종료 결과, 해제 · `sidebar/AgentPanel/__tests__/AgentPanel.test.tsx` — 빈 입력 비활성, 실행(`getByRole('button', { name: '작업 실행' })`) → `agent.start({ task })`, 실행 중 “작업 중지” 버튼·입력 비활성, BUSY 실패 봉투 toast, Ctrl+Enter · `sidebar/Timeline/__tests__/Timeline.test.tsx` — 항목·상태 이름 · `sidebar/RunResult/__tests__/RunResult.test.tsx` — 4종 문구 · `src/renderer/__tests__/App.test.tsx` 갱신
  - **실행**: `pnpm test src/renderer`
  - **검증**: `desktop/app-check` (vibe-build 7단계, 합치기·공유 파일 반영 후 메인이 수행) —
    - 만들 것: `e2e/fixtures/pages/agent-search.html`(제목 “에이전트 검색”, 링크 “두 번째 페이지” → agent-result.html), `agent-result.html`(제목 “가게 정보”, `<p id="phone">전화 02-123-4567</p>`), `reservation.html`(버튼 “예약 확정” — 클릭 시 `window.__clickLog.push('confirm')`, 버튼 “예약 조회”), `login.html`(password 필드 `aria-label="비밀번호"` + 검색 필드). `e2e/fixtures/model/{search-read,reservation-stop,password-block,default}.json`(ref 는 `$ref(role:name)`). `e2e/fixtures.ts` — `launchElectron` 에 `MYBROWSER_FAKE_SCENARIO` 를 넘기는 옵션(`test.use({ fakeScenario })` 등). 사이드바 요소는 `win.getByRole('complementary', { name: '에이전트 사이드바' })` 안에서 찾는다.
    - `e2e/agent-mvp.spec.ts` 흐름: ① search-read: 주소창으로 agent-search 픽스처 이동 → 할 일 입력 → 실행 → 타임라인에 “페이지 읽기”·“‘두 번째 페이지’ 클릭”·“글 읽기” → 결과에 `02-123-4567` 포함 → 탭 주소창 = agent-result URL, 상태 “완료” ② reservation-stop: reservation 픽스처 → 실행 → 상태 “확정 직전 정지”, 결과에 “예약 확정” 포함, 탭 페이지 `window.__clickLog` 길이 0 ③ password-block: login 픽스처 → 실행 → 타임라인에 “차단됨” 항목, 비밀번호 필드 값 빈 문자열, run 은 “완료” ④ 실행 중 [중지] → 상태 “중지됨”(시나리오에 `wait_for ms 3000` 단계로 시간 확보) ⑤ 기존 app-shell·browser-chrome e2e 그대로 통과(사이드바 문구 “할 일을 입력하면…” 은 빈 상태에 유지 — 선택자 겹침 확인).
    - 통과 = 콘솔·main 에러 0 + `make e2e` 전부 통과 + ② 에서 클릭 기록 0(승인 전 미실행)
  - **통과 기준**: 단위 테스트 + `make check` + `make e2e` 통과
  - **커밋**: `feat: 에이전트 사이드바 실행·타임라인 추가 (spec 003 Task 9)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
| 2026-11-05 | 1 | 148 단위 통과 | 3d08d68, e493ad5 | 기반 — SDK 1.5.0, playwright-core 1.64.1 |
| 2026-11-05 | 2 | 15 단위 통과 | f4f55c7 | main-browser |
| 2026-11-05 | 3 | 44 단위 통과 | d7051ba | main-browser |
| 2026-11-05 | 4 | 108 단위 통과 | e273b66 | agent-loop |
| 2026-11-05 | 5 | 25 단위 통과 | 193976f | agent-loop |
| 2026-11-05 | 6 | 48 단위 통과 | b1e3c4e | agent-loop — thread:false, 도구 직렬 실행, 호출 상한을 실행 전 검사 |
| 2026-11-05 | 7 | 12 단위 통과 | fdcc739 | agent-loop · index.ts 조립 9f7c801 |
| 2026-11-05 | 8 | 15 단위 통과 | 43e8d99 | main-store — node:sqlite |
| 2026-11-05 | 9 | 28 단위 통과 · e2e 16/16 (xvfb) | 5e7c983 | renderer-sidebar · e2e/app-check·도구 짝 테스트·loop 테스트는 검증 반영 커밋 |
