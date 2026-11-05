# Spec: 승인·질문·예약 시나리오 + 픽셀 도구·커서 오버레이

> **상태**: 📝 계획됨
> **생성일**: 2026-11-05
> **묶음**: 기반, main-browser, agent-approval, agent-computer, renderer-sidebar
> **관련 spec**: 003
> **설계 참조**: docs/DESIGN.md §3 · §5(로드맵 3·4단계)

---

## 1. 요구사항

### 배경 / 목적
spec 003 의 에이전트는 확정·결제 행동 앞에서 run 을 **끝내기만** 한다. 이번에는 그 자리에서 run 을 **대기**시키고 사이드바 승인 창으로 사용자가 고르게 하며(3단계), 모르는 것은 `ask_user` 로 묻고, 달력·지도처럼 접근성 트리로 못 잡는 UI 는 픽셀 도구(`computer_toolset_20260801`)로 다룬다(4단계). 에이전트가 어디를 누르는지는 탭 위 커서 오버레이로 보인다.

### 기능 요구사항
- **FR-1 승인 대기**: 가드가 `require_approval` 을 내면 도구를 실행하지 않고 run 을 `waiting_user` 로 바꾸고, 사이드바에 승인 창(`role="alertdialog"`, 이름 “승인 필요”, 기본 포커스 [거부])을 띄운다. 창에는 행동(`display.action`)·대상(`display.target`, 실제 요소 텍스트·URL)·이유가 보이고, 탭에서는 대상 요소가 강조된다(FR-8).
- **FR-2 세 가지 선택** (사용자 확인 2026-11-05 — 매번 고른다, 자동 승인 없음):
  - [직접 누를게요] → 에이전트는 그 행동을 **실행하지 않는다**. 창이 “탭에서 직접 누른 뒤 [계속]을 누르세요”로 바뀌고, [계속]을 누르면 모델에 “사용자가 직접 처리함 — snapshot 으로 결과를 확인하고 이어가라” 결과를 주고 재개한다.
  - [에이전트가 누르기] → 실행 직전에 대상을 **다시 해석**해 가드를 다시 돌리고, 그 판정의 `display` 가 승인한 것과 같을 때만 그 도구 호출 **1회**를 실행한다. 다르면 실행하지 않고 새 승인 창을 띄운다(같은 step).
  - [거부] → 실행하지 않고 모델에 “denied: 사용자가 거부함. 다른 방법을 제안하거나 종료하라”를 준다.
- **FR-3 질문(`ask_user`)**: 모델이 `ask_user({ question, optionList? })` 를 부르면 run 이 `waiting_user`, 사이드바에 질문 카드(`role="dialog"`, 이름 “에이전트 질문”) — 선택지 버튼 + 자유 입력칸(“답변”) + [보내기]. 답이 모델에 tool_result 로 가고 재개한다.
- **FR-4 모델의 승인 요청(`request_approval`)**: 모델이 스스로 확인을 받고 싶을 때 `request_approval({ action, target, reason })` — 같은 승인 창을 쓰되 “에이전트 설명” 표시와 [승인]/[거부] 두 버튼만(실행할 구체 행동이 없으므로). 승인이면 “approved”.
- **FR-5 대기 중 중지**: 대기 중 [작업 중지]를 누르면 대기가 풀리고(실행 없음) run 은 `stopped`. 대기에는 타임아웃이 없다.
- **FR-6 픽셀 도구**: 모델에 `computer_toolset_20260801` 을 함께 준다. 구현 멤버: `screenshot`, `left_click`, `double_click`, `type`, `key`, `scroll`, `mouse_move`, `wait`(나머지는 SDK 가 `enabled:false`, `zoom` 도 끔). 화면은 **현재 대상 탭**의 뷰포트이고 스크린샷은 1280×800 이하로 축소, 좌표는 그 스크린샷 픽셀.
- **FR-7 픽셀 가드**: 픽셀 클릭은 좌표의 요소(`elementFromPoint`)를 구조 도구와 같은 가드로 판정한다. **요소를 알 수 없으면(null·canvas·이름 없음) `require_approval`**(fail-closed, 사용자 확인). `type`·`key` 를 포함한 판정은 「설계 개요 → 픽셀 → 가드 도구 매핑」 표를 따른다(비밀 입력 차단, 줄바꿈·Enter·space 확정 검사).
- **FR-8 커서 오버레이**: 에이전트가 클릭(구조·픽셀)하거나 픽셀 커서를 옮기면 탭 위에 커서 표시가 그 지점으로 이동한다. 승인 대기 중에는 대상 요소(또는 좌표)를 강조 테두리로 보이고, 대기가 끝나면 지운다. 오버레이는 클릭을 가로채지 않는다(`pointer-events: none`).
- **FR-9 예약 시나리오**: 시스템 프롬프트에 한국 예약 사이트 요령을 넣는다 — 날짜·시간·인원을 할 일과 대조, 빠지거나 애매하면 `ask_user`, 달력처럼 트리로 안 잡히면 픽셀 도구, 확정 버튼은 승인 흐름에 맡김. 로컬 예약 픽스처로 날짜(달력)·시간·인원 입력 → 확정 앞 승인까지 e2e.
- **FR-10 사이드바 표시**: 상태 “확인 필요”(대기), step 상태에 “확인 대기”·“거부됨” 추가, 대기·정지 표시는 새 `--warning` 토큰. 할 일 입력칸은 shadcn `Textarea`.

### 안전 요구사항
- **SR-1 승인 전 미실행**: `require_approval` 판정 뒤에는 사용자가 [에이전트가 누르기]를 고르고 재확인이 일치할 때만 실행한다. 그 외 모든 경로(직접·거부·중지·창 닫힘·앱 종료)에서 그 도구는 실행되지 않는다.
- **SR-2 승인은 1회용**: 한 승인은 그 step 의 그 호출 1회에만 쓴다. 다음 호출이 같은 버튼이어도 다시 묻는다. “항상 허용”·자동 승인·설정 끄기는 만들지 않는다.
- **SR-3 표시는 실제 값**: 구조·픽셀 승인 창의 `display` 는 실제 요소 텍스트·URL(픽셀에서 요소를 모르면 `"좌표 (x, y) — 요소를 확인할 수 없음"`). `request_approval` 의 모델 문장은 “에이전트 설명” 라벨로 따로 표시하고 실제 값 칸에 넣지 않는다.
- **SR-4 승인 요청 상한**: run 당 승인 요청(구조·픽셀·request_approval 합)이 5회를 넘으면 가드가 `block('too_many_approvals')` — 모델에 is_error, 타임라인 “차단됨” (guard.md 규칙 5).
- **SR-5 비밀값**: `ask_user` 로 비밀번호·카드번호를 받지 않는다 — 프롬프트 규칙 + 질문 카드 안내 문구(“비밀번호·카드번호는 여기 쓰지 말고 탭에 직접 입력하세요”). 답변 원문은 DB 에 저장하지 않는다(`"[답변 생략]"`). 픽셀 `type` 의 text 도 저장하지 않는다.
- **SR-6 픽셀 도구 경계**: 픽셀 도구는 현재 대상 탭의 뷰포트 안에서만 동작한다(앱 크롬·사이드바·다른 창 조작 불가 — CDP page 입력만). 좌표가 뷰포트 밖이면 `block`.
- **SR-7 오버레이 격리**: 오버레이는 shadow DOM + `data-mybrowser-overlay` 로 페이지 DOM 과 분리하고, 가드 target 해석·snapshot 은 오버레이 요소를 무시한다.

### 비기능 요구사항 / 제약
- 스크린샷 1280×800 이하 PNG, 같은 상태 연속 스크린샷 금지를 도구 설명에 명시. `clear_tool_uses_20250919` 가 오래된 이미지를 정리한다(spec 003 그대로).
- 모든 테스트는 가짜 모델·로컬 픽스처. 실제 API·외부 사이트 금지.
- 승인 창·질문 카드는 **사이드바 안**에 그린다 — 탭 `WebContentsView` 가 renderer 위에 그려져 화면 가운데 모달은 가려진다(spec 002 결정과 같은 이유).

### 범위 제외 (Out of Scope)
browser_toolset, zoom·드래그·우클릭 등 나머지 픽셀 멤버, 여러 탭 동시 스크린샷, 승인 기록 열람 화면, run 재개(앱 재시작 후 대기 복원 — 대기 중 앱이 꺼지면 run 은 `failed`(“앱이 종료됐습니다”)로 정리: Task 5 `shutdown()` + 5단계 index.ts), 실제 예약 사이트 자동화 검증(수동), 패키징(5단계).

---

## 2. 설계 개요

### 결정 사항
- **대기는 도구 `run` 안의 await** — toolRunner 는 도구 `run` 이 끝날 때까지 기다리므로, 승인·질문은 래퍼가 `await ctx.waitForUser(request)` 로 기다린다. 루프를 멈추거나 재시작하지 않는다(히스토리 append-only 유지). 도구는 이미 한 번에 하나씩 실행된다(spec 003 큐).
- **상태 머신** (`runs.ts`): 사건 `wait`(running→waiting_user), `resume`(waiting_user→running) 추가, `stop` 은 running·waiting_user 에서, `fail` 도 waiting_user 에서 허용. `guardStop` 사건과 `guard_stopped` 이벤트는 **삭제**(require_approval 은 이제 대기). `stopped_before_confirm` 은 enum·DB 호환을 위해 남기되 새 전이는 없다. 대기 시작·끝마다 `status` 이벤트.
- **대기 요청 레지스트리** (`src/main/agent/waits.ts`): `createWaitRegistry()` → `{ open(request): Promise<TWaitAnswer>, resolve(requestId, answer): boolean, cancelAll(reason) }`. requestId 는 run 안에서 `req-{n}`. `stop()`·run 종료는 `cancelAll('stopped')` → 기다리던 래퍼는 실행 없이 `HALTED_RESULT`.
- **승인 흐름(래퍼)**: verdict `require_approval` → `approvalCount += 1`(가드 입력으로 넘겨 SR-4 판정) → step 을 `waiting` 으로 갱신 → 오버레이 강조 → `wait`(이벤트 `approval_required`) → 결정:
  - `agent`: `resolveTarget()` 재호출 → `checkGuard` 재실행 → 재판정이 **block** 이면 실행 없이 step `blocked` + is_error, **allow** 면 그대로 1회 실행, **require_approval 이고 `isSameDisplay`** 면 **그 호출만** 1회 실행(이 1회만 통과), display 가 다르면 새 요청으로 다시 대기(같은 step, approvalCount 증가) — 비교 함수는 순수 `isSameDisplay(a, b)`.
  - `user_done`: 실행 없이 step `ok`(“사용자가 직접 처리”) + USER_DONE 결과.
  - `denied`: 실행 없이 step `denied` + DENIED 결과(is_error 아님).
  - 어느 경우든 대기 종료 시 `resume` + 오버레이 강조 지움 + 이벤트 `approval_resolved`.
- **공통 파이프라인 `runGuardedAction`** (`src/main/agent/tools/index.ts` export — 구조 도구 래퍼와 픽셀 멤버가 같이 쓴다):
  ```ts
  runGuardedAction<T>(ctx: IToolRunContext, spec: {
    stepTool: string;                        // 구조 = 도구 이름, 픽셀 = `computer.{member}`
    guard: { tool: TToolName | 'request_approval'; source: 'structure' | 'pixel'; input: unknown; point?: IPoint } | null;  // null = 가드 없음 (SR-6 은 호출부)
    resolveTarget: () => Promise<IGuardTarget | null>;   // 최초 판정과 [에이전트가 누르기] 재확인 때 각각 부른다
    summary: string; storedInput: unknown;   // 타임라인 요약, DB 저장용 입력(비밀값 생략된 것)
    overlayTarget: { ref: string } | { point: IPoint } | null;
    act: () => Promise<{ ok: true; value: T; text: string } | { ok: false; reason: string }>;  // value = 도구가 돌려줄 결과(픽셀 screenshot 은 이미지)
  }): Promise<T>   // 실패·차단은 ToolError throw, 정지면 HALTED 결과
  ```
  전체가 **`ctx.runExclusive` 안에서** 돈다 — `IToolRunContext.runExclusive` 를 추가해 `createToolList` 의 큐와 toolset 이 **같은 큐**를 쓴다(SDK toolset 의 자체 큐와 별개로 구조·픽셀 호출이 동시에 돌지 않게, 대기도 동시에 하나만). `beginStep`·`toStoredInputJson` 등의 tool 인자는 `string`(stepTool)로 넓힌다.
- **`ask_user`·`request_approval` 은 상태 변경 도구가 아니다** (Task 5 에서 `AGENT_TOOL_LIST`·테스트 기대값을 `ALL_TOOL_NAME_LIST` 15개 기준으로 바꾼다)(가드 대상 아님, 브라우저 미사용) — `execute(driver, input)` 대신 `executeWithContext(ctx, input)` 를 가진 “사람 개입 도구”로 래퍼가 분기한다. `request_approval` 은 SR-4 상한에 포함.
- **픽셀 도구 = SDK `BetaAbstractComputerToolset20260801` 하위 클래스** (`@anthropic-ai/sdk/helpers/beta/toolsets` — 설치된 1.5.0 타입 확인). 멤버 메서드마다 `runGuardedAction`(stepTool `computer.{member}`) — 정지 확인·호출 수·step 기록·가드(FR-7)·승인 대기·실행·오버레이를 구조 도구 래퍼와 **같은 IToolRunContext** 로 처리한다. toolRunner 의 `tools` 에 이 인스턴스를 그대로 넣는다(`tool_result` 의 `toolset_name` 은 SDK 가 붙인다). `confirm` 은 아래 「SDK 제약」 때문에 `() => true` 로만 넘긴다(가드가 멤버 안에서 판정).
  - 픽셀 → 가드 도구 매핑 (`toGuardCall(member, input)` 반환값, source `'pixel'` 이면 가드는 도구 입력 스키마를 parse 하지 않고 아래 모양만 본다):

    | 멤버 | 가드 tool | 가드 input | target |
    |---|---|---|---|
    | `left_click`·`double_click` | `click` | `{}` | 좌표의 요소 (`resolvePointTarget`) |
    | `type` | `type_text` | `{ text, submit }` — text 에 `\n`·`\r` 가 있으면 `submit: true` | 포커스 대상 |
    | `type` (포커스 대상이 글 입력칸 — input(text류)·textarea·contenteditable — 이 **아니면**) | `click` | `{}` | 포커스 대상 (버튼에 `" "` 입력 = 클릭) |
    | `key` 가 `Return`·`Enter`·`KP_Enter`·`space` (조합 포함, 대소문자 무시) | `press_key` | `{ key: 'Enter' }` | 포커스 대상 (폼 안 입력이면 submit 버튼 — spec 003 규칙) |
    | 그 밖의 `key`, `scroll`, `mouse_move`, `wait`, `screenshot` | — (가드 없음) | — | — |
  - 좌표: `left_click`·`double_click`·`scroll`·`mouse_move` 의 `coordinate` 가 없으면 `BrowserComputerToolset` 인스턴스가 보관한 **마지막 커서 위치**(스크린샷 픽셀 — 픽셀 `left_click`·`double_click`·`mouse_move`·`scroll` 이 실행에 성공했을 때만 갱신)를 쓴다. 커서 위치가 없으면 block. 가드·`isInViewport`·실행은 모두 이 좌표로 한다. 뷰포트 밖이면 block(SR-6).
  - 가드 입력에 `source: 'structure' | 'pixel'`, `point?: IPoint`(display 용) 추가 — **pixel 에서 target null(또는 name·text·value 모두 빈 값)이면 `require_approval`**(display `좌표 (x, y) — 요소를 확인할 수 없음`, 구조 도구의 null → block 은 그대로).
  - SDK 제약(설치된 1.5.0 확인): `type`·`key` 멤버를 켜면 생성자에 `confirm` 이 필수(`COMPUTER_CONFIRM_REQUIRED`, 없으면 `ToolsetConfigError`) → **`confirm: () => true`** 를 넘기고 “판정·승인은 멤버 안 runGuardedAction 이 한다 — 가드 우회 아님” 주석. type 멤버 메서드 이름은 **`type_`**(`type` 은 wire 필드). 멤버는 `protected override`, 실패는 `ToolError` throw, 성공은 `void | string`(screenshot 은 SDK 이미지 결과 타입). 안전 가이드는 `node_modules/@anthropic-ai/sdk/src/helpers/beta/toolsets/computer.ts` 주석을 읽는다(별도 md 없음).
- **좌표 변환**: 드라이버가 마지막 스크린샷의 축소 비율(`scale = cssViewport / screenshotPx`)을 보관하고, 스크린샷 전 좌표 입력은 비율 1 로 본다. 뷰포트 밖 좌표는 `{ ok:false }` 이전에 가드가 block.
- **커서 오버레이** (`src/main/browser/overlay.ts`): `ensureOverlay(page)`(shadow root 1개 주입, `page.on('framenavigated')` 후 재주입), `showCursor(page, { x, y })`(CSS px), `showHighlight(page, { ref } | { x, y })`, `clearHighlight(page)`. 커서는 12px 원 + 200ms 이동 애니메이션. 실패는 무시(오버레이 때문에 행동이 실패하지 않는다). `resolveTarget`/`resolvePointTarget`/snapshot 은 `[data-mybrowser-overlay]` 를 건너뛴다.
- **IBrowserDriver 확장** (기반, 타입만): 「도구 계약」 아래 표.
- **가짜 모델 확장**: 시나리오 tool_use 블록에 선택 `toolset_name: 'computer'`. fakeFetch 가 그대로 `content_block_start` 에 싣는다. 픽셀 좌표는 시나리오에 고정값(픽스처는 절대 위치 배치).
- **step 상태 추가**: `StepStatusSchema` 에 `waiting`·`denied`.
- **승인 창은 사이드바 안** — `ApprovalPanel` 은 `rules/renderer/react-convention.md` 대로 `role="alertdialog"`(이름 “승인 필요”) + **기본 포커스 [거부]**, `QuestionCard` 는 `role="dialog"`(이름 “에이전트 질문”) + 기본 포커스 답변칸. 둘 다 `aria-modal="false"`, 사이드바 상단(입력칸 위)에 고정. shadcn `Dialog` 는 쓰지 않는다(탭 View 에 가려짐).
- **설계 변경 — `rules/agent/tools.md` 「사람 개입 도구」**: `agent:approve {approved}` → `{ requestId, decision }`(결정 5종), `ask_user({ question, options? })` → `optionList?`. 9단계에서 tools.md 를 이 spec 계약으로 갱신한다.
- **DESIGN.md §3 갱신**(9단계): “기본 모드는 최종 확정은 사용자가 직접 클릭” → “승인 창에서 매번 [직접 누를게요]/[에이전트가 누르기]/[거부] 중 고른다. 에이전트가 누르기는 재확인 후 1회. 자동 승인 없음”. `rules/agent/guard.md` 「판정 결과」·「규칙」에 결정 3종·픽셀 규칙(매핑 표)·`source` 반영, `rules/agent/tools.md` 「사람 개입 도구」 계약 갱신.

### 영향받는 프로세스 / 파일
```
[기반]             src/shared/agent/{run,fakeScenario}.ts · src/shared/ipc/{channels,api,agent}.ts · src/shared/guard/types.ts
                   src/shared/tools/{askUser,requestApproval,index,driver}.ts · src/preload/index.ts
                   src/renderer/components/ui/textarea.tsx (shadcn) · src/renderer/styles/globals.css(--warning) · vitest.setup*.ts · e2e/app-shell.spec.ts(필요 시)
[main-browser]     src/main/browser/{overlay,pointer,screenshot,driver,target,snapshot}.ts · e2e/fixtures/pages/browser-*.html(단위 테스트용)
[agent-approval]   src/main/agent/{guard,runs,waits,summary,service}.ts · src/main/agent/tools/{index,toolType,askUser,requestApproval}.ts
                   src/main/agent/prompts/system.ts · src/main/agent/fake/fakeFetch.ts · src/main/ipc/handlers/agent.ts
[agent-computer]   src/main/agent/computer/{toolset,pixelGuard}.ts · src/main/agent/tools/index.ts 에 toolset 연결은 공유 요청 아님 — 아래 Task 7 참고
[renderer-sidebar] src/renderer/hooks/useAgentRun.ts · src/renderer/sidebar/{ApprovalPanel,QuestionCard,AgentPanel,Timeline,RunResult}/
[5단계 메인 반영]   src/main/index.ts before-quit 에서 agentService.shutdown() · src/shared/ipc/agent.ts 의 guard_stopped 삭제 + 소비처 정리 (커밋 `refactor: guard_stopped 이벤트 삭제 (spec 004)`)
[7단계 app-check]  e2e/fixtures/pages/{reservation-form,pixel-confirm}.html · e2e/fixtures/model/*.json · e2e/agent-approval.spec.ts · e2e/agent-mvp.spec.ts(갱신)
```

### IPC 계약
파일 `src/shared/ipc/agent.ts`, 공용 `src/shared/agent/run.ts`. 모두 `z.strictObject`.

```ts
// run.ts 추가·변경
StepStatusSchema = z.enum(['running','waiting','ok','error','blocked','denied'])
RequestIdSchema = z.string().regex(/^req-\d+$/)
ApprovalDecisionSchema = z.enum(['agent','user_done','denied'])        // 구조·픽셀 승인
ModelApprovalDecisionSchema = z.enum(['approved','denied'])           // request_approval
ApprovalRequestSchema = z.strictObject({
  requestId: RequestIdSchema, stepN: z.number().int().min(1),
  kind: z.enum(['guard','model']),            // guard = 가드 판정(구조·픽셀), model = request_approval
  source: z.enum(['structure','pixel','model']),
  reason: z.string(),
  display: GuardDisplaySchema,                // kind=model 이면 { action: '확인 요청', target: '' }
  modelNote: z.string().max(500).nullable(),  // kind=model 일 때만 — 모델 문장(“에이전트 설명”)
})
QuestionSchema = z.strictObject({ requestId: RequestIdSchema, stepN: z.number().int().min(1),
  text: z.string().min(1).max(300), optionList: z.array(z.string().min(1).max(60)).max(6) })

// agent.ts 추가
ApproveAgentRequestSchema = z.strictObject({ runId: RunIdSchema, requestId: RequestIdSchema,
  decision: z.union([ApprovalDecisionSchema, ModelApprovalDecisionSchema]) })
AnswerAgentRequestSchema = z.strictObject({ runId: RunIdSchema, requestId: RequestIdSchema, answer: z.string().trim().min(1).max(1000) })
AgentEventSchema += 
  { type:'approval_required', runId, request: ApprovalRequestSchema }
  { type:'approval_resolved', runId, requestId, decision: z.union([ApprovalDecisionSchema, ModelApprovalDecisionSchema, z.literal('cancelled')]) }
  { type:'question', runId, question: QuestionSchema }
  { type:'question_answered', runId, requestId }          // 답 원문은 싣지 않는다
AgentEventSchema -= guard_stopped   // 5단계 합치기 뒤 메인이 삭제 (Task 1~8 동안은 남겨 둔다 — 아래 참고)
```

| 채널 | 방향 | 요청 | 응답/이벤트 |
|---|---|---|---|
| `agent:approve` | invoke | `ApproveAgentRequestSchema` | `EmptyResponseSchema` |
| `agent:answer` | invoke | `AnswerAgentRequestSchema` | `EmptyResponseSchema` |
| `agent:event` | event | — | 위 4종 추가. `guard_stopped` 는 묶음 병렬 동안 스키마에 남기고(발신 안 함·renderer 는 무시), 5단계에서 메인이 삭제 |

- 실패 봉투: 대기 중인 요청이 없거나 이미 처리됨 → `NOT_FOUND` “확인할 요청을 찾을 수 없습니다”, kind 와 맞지 않는 decision(guard 에 `approved`, model 에 `agent`/`user_done`) → `INVALID_INPUT` “요청 형식이 올바르지 않습니다”.
- 이벤트 순서(승인): `step(running)` → `step(waiting)` → `status(waiting_user)` → `approval_required` → (사용자) → `approval_resolved` → `status(running)` → `step(ok|denied)`. 질문도 같은 꼴(`question` / `question_answered`).
- `IApi.agent` 추가: `approve(req)`, `answer(req)`. `Object.keys(window.api)` 는 그대로 `['app','tabs','shortcut','agent']`.

### 도구 계약
| 도구 | 입력 | 반환 | 가드 | 승인 |
|---|---|---|---|---|
| `ask_user` (신규) | `{ question: z.string().min(1).max(300), optionList?: z.array(z.string().min(1).max(60)).max(6) }` | `사용자 답: {answer}` | — | — |
| `request_approval` (신규) | `{ action: z.string().min(1).max(100), target: z.string().max(200), reason: z.string().min(1).max(300) }` | `approved` / `denied: …` | 상한만(SR-4) | 항상 |
| 기존 13개 | 변경 없음 | 변경 없음 | 변경 없음 | require_approval 이면 **대기**(FR-2) |
| `computer_toolset_20260801` 멤버 | SDK 정의 그대로 | screenshot=이미지, 나머지 텍스트 1줄 | FR-7 매핑 | 요소 미상·패턴 일치 시 대기 |

`IBrowserDriver` 추가 (`src/shared/tools/driver.ts`):
```ts
interface IPoint { x: number; y: number }                         // 스크린샷 픽셀
takeScreenshot(): Promise<{ ok: true; pngBase64: string; width: number; height: number } | { ok: false; reason: string }>
clickAt(i: IPoint & { count: 1 | 2 }): Promise<TActionResult>
typeRaw(i: { text: string }): Promise<TActionResult>
pressRaw(i: { key: string }): Promise<TActionResult>                // xdotool 식 키 이름("Return","ctrl+a")
scrollAt(i: IPoint & { direction: 'up'|'down'|'left'|'right'; amount: number }): Promise<TActionResult>
moveTo(i: IPoint): Promise<TActionResult>
resolvePointTarget(i: IPoint): Promise<IGuardTarget | null>        // elementFromPoint, 오버레이 제외
isInViewport(i: IPoint): Promise<boolean>
showOverlay(cmd: { kind: 'cursor'; point: IPoint } | { kind: 'highlight'; ref: string } | { kind: 'highlight'; point: IPoint } | { kind: 'clear' }): Promise<void>  // 실패해도 resolve
```

가드 입력 변경 (`src/shared/guard/types.ts`): `IGuardInput.tool: TToolName | 'request_approval'`, 추가 `source?: 'structure' | 'pixel'`(기본 structure), `approvalCount?: number`(이번 호출 **전**까지의 승인 요청 수, 기본 0), `point?: IPoint`. source='pixel' 이면 입력 스키마 parse 를 건너뛰고 「픽셀 → 가드 도구 매핑」의 input 모양만 본다. `TGuardVerdict` 는 그대로.

### 데이터
스키마 변경 없음 (steps.status 는 TEXT). `ask_user` 의 답은 step `result_text` 에 `"[답변 생략]"`, 픽셀 `type` 의 input_json `text` 는 `"[입력값 생략]"`, 스크린샷 이미지는 DB·파일에 저장하지 않는다(이번 범위).

### 열린 질문
없음 (승인 방식·픽셀 가드·질문 UI·예약 범위 사용자 확인).

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 테스트와 검증이 모두 에러 0 이 될 때까지 수정 → 재실행, 전부 통과했을 때만 체크박스를 채우고 Task 단위로 커밋한 뒤 다음 Task 로 진행한다.
> 모든 Task 는 테스트 필수(새 소스 파일마다 짝 `__tests__/{이름}.test.ts` — 품질 게이트가 검사). 실제 Claude API·외부 사이트 금지.
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**
> 묶음 순서: `기반`(Task 1) → `main-browser`(Task 2~3) ∥ `agent-approval`(Task 4~6) ∥ `renderer-sidebar`(Task 8) → `agent-approval` 이 끝나면 `agent-computer`(Task 7, agent-approval 브랜치 기반). 조립(index.ts)은 변경 없음 예상 — 있으면 공유 파일 요청. e2e 는 Task 8 검증(7단계).

- [ ] **Task 1: 계약 — 승인·질문 IPC, step 상태, 가드 입력, 드라이버 확장, 사람 개입 도구 스키마, UI 부품**
  - **묶음**: 기반
  - **작업**: 「IPC 계약」·「도구 계약」 그대로. `run.ts`(StepStatus 확장, RequestId·ApprovalDecision·ModelApprovalDecision·ApprovalRequest·Question 스키마·타입), `agent.ts`(Approve·Answer 요청, 이벤트 4종 **추가** — `guard_stopped` 는 아직 남긴다), `channels.ts`(`IPC.agent.approve`·`answer`), `api.ts`·preload(`approve`·`answer`). `src/shared/tools/askUser.ts`·`requestApproval.ts` + `index.ts`(`HUMAN_TOOL_NAME_LIST = ['ask_user','request_approval']`·`ALL_TOOL_NAME_LIST`(15) 추가, `THumanToolName`·`TAllToolName` 타입 export, **`TOOL_NAME_LIST`·`TToolName` 은 13개 그대로**, `STATEFUL_TOOL_NAME_LIST` 그대로). `driver.ts`(IPoint·확장 메서드). `guard/types.ts`(`tool: TToolName | 'request_approval'`, `source`·`approvalCount`·`point?: IPoint` 를 **optional 로 추가**해 기존 호출부가 깨지지 않게 — 기본값은 가드가 `'structure'`·`0`). `fakeScenario.ts`(tool_use 에 `toolset_name?: z.literal('computer')`). `pnpm dlx shadcn@latest add textarea`(CLI 가 globals.css 를 덮으면 기존 토큰 유지), `globals.css` 에 `--warning`·`--warning-foreground`(light·dark) + Tailwind 테마 매핑. `vitest.setup.ts` mock 에 `agent.approve/answer`. **소비자 green 유지**: `IBrowserDriver` 확장으로 깨지는 곳은 이 Task 에서 최소 수정 — `src/main/browser/driver.ts` 에 새 메서드를 `{ ok:false, reason:'아직 지원하지 않습니다' }`/`null`/`false`/no-op 로 임시 구현(`// TODO(spec 004 Task 3)`), 가짜 드라이버 2곳(`src/main/agent/tools/__tests__/fakeDriver.ts`, `src/main/agent/__tests__/service.test.ts`)에 vi.fn 추가. `TOOL_NAME_LIST` 가 13개 그대로라 기존 도구 테스트는 깨지지 않는다. 그 밖에 type-check 가 깨지는 소비자도 이 Task 에서 최소 수정: `src/renderer/sidebar/Timeline/StepRow.tsx`(waiting “확인 대기”·denied “거부됨” 최소 항목), `src/renderer/hooks/useAgentRun.ts`(새 이벤트 4종은 reduce 에서 state 를 그대로 돌려주고 `toRunResult` 는 null — 실제 처리는 Task 8), 세 번째 가짜 드라이버 `src/main/agent/tools/__tests__/index.test.ts`(새 메서드 vi.fn).
  - **파일**: `src/shared/{agent/run,agent/fakeScenario,ipc/channels,ipc/api,ipc/agent,guard/types,tools/askUser,tools/requestApproval,tools/index,tools/driver}.ts`, `src/preload/index.ts`, `src/renderer/components/ui/textarea.tsx`, `src/renderer/styles/globals.css`, `vitest.setup.ts`, (green 유지용 최소 수정) `src/main/browser/driver.ts`·`src/main/agent/tools/__tests__/{fakeDriver,index.test}.ts`·`src/main/agent/__tests__/service.test.ts`·`src/renderer/sidebar/Timeline/StepRow.tsx`·`src/renderer/hooks/useAgentRun.ts`
  - **테스트**: `src/shared/ipc/__tests__/agent.test.ts` — approve(decision 5종 유효, 이상한 requestId 거부), answer(빈·1001자 거부), 새 이벤트 4종 유효/무효 · `src/shared/agent/__tests__/run.test.ts`(신규) — ApprovalRequest(kind=model 의 modelNote, 501자 거부)·Question(옵션 7개 거부)·StepStatus 6종 · `src/shared/tools/__tests__/schemas.test.ts` — ask_user·request_approval 유효/무효, `ALL_TOOL_NAME_LIST` 15개 · `fakeScenario.test.ts` — toolset_name · textarea 는 shadcn 예외(품질 게이트가 요구하면 `src/renderer/components/ui/__tests__/textarea.test.tsx` 에 렌더·value 1건)
  - **실행**: `pnpm test src/shared` + `pnpm test`(전체 green 확인)
  - **검증**: `pnpm type-check` + `pnpm lint` + 전체 단위 테스트 + `xvfb-run -a make e2e`(기존 16개 그대로 통과)
  - **통과 기준**: 전체 단위·e2e green, 동작 변화 없음(새 계약만 추가)
  - **커밋**: `feat: 승인·질문 IPC 계약과 픽셀 드라이버 계약 추가 (spec 004 Task 1)`

- [ ] **Task 2: 커서 오버레이 + 좌표 target 해석**
  - **묶음**: main-browser
  - **작업**: `browser/overlay.ts`(「커서 오버레이」), `target.ts` 에 `resolvePointTarget(page, point, scale)` + 오버레이 제외, `snapshot.ts` 오버레이 제외 확인(ariaSnapshot 이 shadow 내용을 포함하면 `aria-hidden="true"` 로 숨긴다).
  - **파일**: `src/main/browser/{overlay,target,snapshot}.ts`, `e2e/fixtures/pages/browser-pointer.html`
  - **테스트**: headless chromium — `overlay.test.ts`(주입 1회·재주입·커서 위치·강조 ref/point·clear·pointer-events none·페이지 클릭 방해 없음·실패 무시) · `target.test.ts` 추가(좌표의 버튼 → name, canvas → name 빈 값, 오버레이 위 좌표 → 아래 요소, 뷰포트 밖 → null) · `snapshot.test.ts` 추가(오버레이가 snapshot 에 안 나옴)
  - **실행**: `pnpm test src/main/browser`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 탭 커서 오버레이와 좌표 대상 해석 추가 (spec 004 Task 2)`

- [ ] **Task 3: 스크린샷·포인터 행동 + 드라이버 확장**
  - **묶음**: main-browser
  - **작업**: `browser/screenshot.ts`(`page.screenshot({ type:'png' })` 후 1280×800 이하로 축소 — 뷰포트를 줄이지 않고 `clip`+`scale:'css'` 또는 축소 비율 계산, 비율 반환), `browser/pointer.ts`(clickAt·typeRaw·pressRaw(xdotool 키 이름 → Playwright 키 변환표)·scrollAt·moveTo — 좌표 × scale → CSS px, `page.mouse`/`page.keyboard`), `driver.ts` 에 확장 메서드(마지막 scale 보관, 클릭·이동 시 `showCursor`, `showOverlay` 위임, 구조 `click` 도 요소 중심에 커서 표시).
  - **파일**: `src/main/browser/{screenshot,pointer,driver}.ts`, `e2e/fixtures/pages/browser-pointer.html`
  - **테스트**: `screenshot.test.ts`(크기 상한·비율·PNG) · `pointer.test.ts`(좌표 클릭이 픽스처 클릭 기록에 남음·double·typeRaw·`Return`/`ctrl+a` 변환·scroll·축소 비율 적용) · `driver.test.ts` 추가(확장 메서드 위임·scale 보관·isInViewport)
  - **실행**: `pnpm test src/main/browser`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 스크린샷·좌표 입력과 드라이버 확장 추가 (spec 004 Task 3)`

- [ ] **Task 4: 가드 확장 + 상태 머신 + 대기 레지스트리**
  - **묶음**: agent-approval
  - **작업**: `guard.ts` — source·approvalCount 반영: 승인 요청이 될 판정에서 `approvalCount >= 5` 면 `block(too_many_approvals)`, pixel 의 target null/이름 없음 → require_approval(display `좌표 (x, y) — 요소를 확인할 수 없음` — 좌표는 `point` 에서). **source='pixel' 이면 type_text·press_key·click 의 입력 스키마 parse 를 건너뛰고 「픽셀 → 가드 도구 매핑」 input 모양(`{ text, submit }`·`{ key:'Enter' }`·`{}`)만 본다**, `request_approval` 도구는 상한만 검사. `isSameDisplay`. `runs.ts` — wait·resume 추가, stop/fail 출발 상태 확장(**guardStop 삭제는 Task 5 에서 service.ts 와 함께**). `waits.ts` — 「대기 요청 레지스트리」. `rules/agent/guard.md` 는 9단계에서 메인이 갱신(도우미는 수정하지 않는다).
  - **파일**: `src/main/agent/{guard,runs,waits}.ts`
  - **테스트**: `guard.test.ts` 추가 — 승인 5회째까지 require_approval, 6회째 block, pixel null → require_approval·구조 null → block(기존 유지), pixel 버튼 “예약 확정” → require_approval·“예약 조회” allow, pixel type_text `{ text:'강남', submit:false }` 일반 칸 → allow, `{ text:'x', submit:true }` + formSubmitText “예약 확정” → require_approval, pixel type_text password 대상 → block, pixel press_key `{ key:'Enter' }` + 포커스 “결제하기” → require_approval, pixel click 대상 null + point(10,20) → display `좌표 (10, 20) — 요소를 확인할 수 없음`, request_approval 상한, `isSameDisplay` · `runs.test.ts` — 새 전이·불법 전이(done→wait 등) · `waits.test.ts` — open/resolve/중복 resolve false/없는 id false/cancelAll 이 대기 전부 해제
  - **실행**: `pnpm test src/main/agent`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 승인 상한·픽셀 판정 가드와 대기 상태 추가 (spec 004 Task 4)`

- [ ] **Task 5: 래퍼 승인 흐름 + ask_user·request_approval + 서비스·IPC**
  - **묶음**: agent-approval
  - **작업**: `tools/toolType.ts` 에 사람 개입 도구 타입, `tools/askUser.ts`·`requestApproval.ts`, `tools/index.ts` — 「승인 흐름(래퍼)」, 사람 개입 분기, `IToolRunContext` 에 `approvalCount`·`waitForUser(request)`·`overlay(cmd)`·`runExclusive` 추가하고 「공통 파이프라인 `runGuardedAction`」을 그 시그니처 그대로 export, 구조 도구 13개도 이것으로 돈다. `summary.ts` — ask_user “질문: {question 40자}”, request_approval “확인 요청: {action}”. `service.ts` — guard_stopped 발신·stopBeforeConfirm 제거 + `runs.ts` 의 guardStop 사건 삭제(같은 커밋), waits 연결, 상태 전이·이벤트, `approve(runId, requestId, decision)`·`answer(…)`(kind 불일치 → INVALID_INPUT 코드), stop 시 cancelAll, 답변 원문 미저장, `shutdown()`(활성 run 을 cancelAll 후 fail(“앱이 종료됐습니다”) — 5단계에서 메인이 `src/main/index.ts` before-quit 에서 호출, 공유 파일). `prompts/system.ts` — FR-9 예약 섹션, ask_user·request_approval 사용 규칙, 픽셀 도구는 폴백(트리로 안 될 때만, 스크린샷 연속 금지), 안전 규칙 갱신(확정 버튼은 시도하면 사용자가 승인 창에서 결정) + 스냅샷 갱신. `fake/fakeFetch.ts` — toolset_name 전달. `ipc/handlers/agent.ts` — approve·answer.
  - **파일**: `src/main/agent/tools/{toolType,index,askUser,requestApproval}.ts`, `src/main/agent/{summary,service,runs}.ts`, `src/main/agent/tools/__tests__/{toolType,index}.test.ts`, `src/main/agent/__tests__/{runs,service}.test.ts`, `src/main/agent/prompts/system.ts`, `src/main/agent/fake/fakeFetch.ts`, `src/main/ipc/handlers/agent.ts`
  - **테스트**: `service.test.ts` — ①click “예약 확정” → 이벤트 순서(「IPC 계약」), driver.click 미호출 상태로 대기 ②`agent` 결정 → 재확인 후 click 1회, step ok ③재확인 display 가 바뀌면(가짜 resolveTarget 이 두 번째에 다른 name) 실행 없이 새 approval_required ④`user_done` → 미실행·USER_DONE 결과가 다음 요청에 ⑤`denied` → 미실행·step denied·DENIED 결과 ⑥대기 중 stop → 미실행·approval_resolved(cancelled)·stopped 1회 ⑦승인 6번째 요청 → blocked ⑧ask_user → question 이벤트·answer 후 “사용자 답: …” 가 다음 요청에, store 에 답 원문 없음 ⑨request_approval approved/denied, kind 불일치 decision → INVALID_INPUT ⑩없는 requestId → NOT_FOUND ⑪`agent` 결정 후 재판정이 block → 실행 없이 step blocked ⑫대기 중 `shutdown()` → 미실행·failed(앱 종료) 1회 ⑬구조 도구 대기 중 다른 runGuardedAction(픽셀 포함)은 시작하지 않는다 · `tools/__tests__/askUser.test.ts`·`requestApproval.test.ts`(이름·예시 입력·잘못된 입력·ctx 위임) · `tools/__tests__/index.test.ts` 갱신(15개, 사람 개입 도구는 가드·드라이버 미호출) · `prompts/__tests__/system.test.ts` 스냅샷 + 예약·ask_user 문구 포함 · `fake/__tests__/fakeFetch.test.ts` toolset_name · `ipc/__tests__/agent.test.ts` approve·answer 봉투 · **동작이 바뀌어 없어지는 기존 테스트는 삭제가 아니라 대체한다** — `runs.test.ts` 의 guardStop 행은 wait·resume 행으로, `service.test.ts` 의 ‘예약 확정 → stopped_before_confirm’ 2건은 ①·⑤로(같은 픽스처, click 미호출 assertion 유지), `tools/__tests__/index.test.ts` 의 stopBeforeConfirm 은 waitForUser 로. ‘실행 전 미호출’ assertion 은 모두 남긴다
  - **실행**: `pnpm test src/main/agent src/main/ipc`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 승인 대기·질문 도구와 승인 IPC 추가 (spec 004 Task 5)`

- [ ] **Task 6: 루프에 승인 상태 반영 확인 (회귀)**
  - **묶음**: agent-approval
  - **작업**: `loop.ts` 는 변경 없음이 목표 — 대기 중 runner 가 기다리는지, abort(stop) 시 대기 해제와 aborted 가 겹쳐도 종료 1회인지 통합 테스트로 확인. 필요한 최소 수정만.
  - **파일**: `src/main/agent/__tests__/loop.test.ts`(+ 필요 시 `loop.ts`)
  - **테스트**: `loop.test.ts` 추가 — run 이 2초 기다리는 도구에서도 다음 요청 전에 결과를 기다림, 대기 중 abort → aborted · `service.test.ts` — 대기 중 stop 의 종료 이벤트 정확히 1회
  - **실행**: `pnpm test src/main/agent`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `test: 승인 대기 중 루프·중지 회귀 테스트 추가 (spec 004 Task 6)` — `loop.ts` 를 고쳤으면 `fix: 승인 대기 중 루프 종료 처리 수정 (spec 004 Task 6)`

- [ ] **Task 7: 픽셀 도구 (computer toolset)**
  - **묶음**: agent-computer (agent-approval 의 마지막 커밋 기반)
  - **작업**: `agent/computer/toolset.ts` — `class BrowserComputerToolset extends BetaAbstractComputerToolset20260801`, 생성자에 `ctx: IToolRunContext`, `configs: { zoom: { enabled: false } }`, `confirm: () => true`(「SDK 제약」). 멤버 8개(`screenshot`·`left_click`·`double_click`·`type_`·`key`·`scroll`·`mouse_move`·`wait`, `protected override`) — 각자 `runGuardedAction`(stepTool `computer.{member}`) 으로(screenshot·wait·mouse_move·scroll 은 가드 없음, 좌표 멤버는 `isInViewport` 거짓이면 block(SR-6)). screenshot 은 SDK 결과 타입(이미지)으로 반환. `agent/computer/pixelGuard.ts` — `toGuardCall(member, input): { tool, input } | null`(「픽셀 → 가드 도구 매핑」, 순수). `tools/index.ts` 의 `createToolList` 가 toolset 인스턴스를 목록 끝에 추가(이 Task 가 그 한 줄을 고친다 — agent-approval 이 끝난 뒤라 충돌 없음). `summary.ts` 에 픽셀 요약(“화면 보기”, “좌표 클릭”, “키 {key}”, “글자 입력”…). step 저장 시 `type` 의 text 생략.
  - **파일**: `src/main/agent/computer/{toolset,pixelGuard}.ts`, `src/main/agent/tools/index.ts`, `src/main/agent/summary.ts`
  - **테스트**: `computer/__tests__/pixelGuard.test.ts`(매핑 전부 — 걸림·안 걸림 각 1 이상: `ctrl+Return`, `KP_Enter`, `space`, 대소문자, text 의 `\n`, 글 입력칸 아닌 포커스의 type) · `computer/__tests__/toolset.test.ts` — **실제 SDK 런너 + 가짜 fetch**(시나리오 `toolset_name:'computer'`)로 ①screenshot → 이미지 결과에 toolset_name ②left_click 이 canvas(가짜 resolvePointTarget null) → approval_required, `agent` 후 clickAt 1회 ③left_click 일반 버튼 → 바로 clickAt ④type 이 password 포커스 → block·typeRaw 미호출 ④-1 type `"2명\n"` + 폼 submit “예약 확정” → 대기(submit 판정), 일반 검색칸에 `"강남"` → 바로 실행 ④-2 포커스가 “예약 확정” 버튼일 때 type `" "`·key `space`·`KP_Enter` → 대기, key `Tab` → 바로 실행 ④-3 mouse_move 후 coordinate 없는 left_click → 그 좌표로 판정·실행, 커서 위치 없이 좌표 없는 클릭 → block ④-4 생성자가 throw 하지 않는다(confirm 제공) ⑤뷰포트 밖 → block ⑥key Return + 포커스 “결제하기” → 대기 ⑦tools 목록에 `{type:'computer_toolset_20260801'}` 엔트리가 이름 없이 직렬화
  - **실행**: `pnpm test src/main/agent`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 픽셀 도구와 좌표 가드 추가 (spec 004 Task 7)`

- [ ] **Task 8: 사이드바 — 승인 창·질문 카드·상태 표시**
  - **묶음**: renderer-sidebar
  - **작업**: `.claude/skills/desktop/design`·`error-toast` 를 따른다. `useAgentRun` — 새 이벤트 4종(pending approval/question 상태), `approve(decision)`·`answer(text)`(봉투 반환, 실패 toast), guard_stopped 는 받아도 기존대로 표시(5단계에서 메인이 삭제), status `waiting_user` → “확인 필요”. `sidebar/ApprovalPanel` — `role="alertdialog"` `aria-label="승인 필요"`, 행동·대상·이유, kind=guard: [직접 누를게요]→ 안내 문구 + [계속](=`user_done`) / [에이전트가 누르기](=`agent`) / [거부](=`denied`), kind=model: “에이전트 설명”(modelNote) + [승인]/[거부], `--warning` 톤, 열리면 **[거부]에 포커스**(Enter 로 실수 승인 방지), approval_resolved 면 닫힘. `sidebar/QuestionCard` — `role="dialog"` `aria-label="에이전트 질문"`, 선택지 버튼, `textbox` “답변”(기본 포커스) + [보내기](빈 값 비활성), SR-5 안내 문구. `AgentPanel` — 패널들을 입력칸 위에 배치, 입력칸을 shadcn `Textarea` 로 교체(접근 이름 “할 일” 유지). `Timeline` — waiting(“확인 대기”)·denied(“거부됨”) 아이콘. `StatusBadge`·`RunResult` — `--warning` 사용.
  - **파일**: `src/renderer/hooks/useAgentRun.ts`, `src/renderer/sidebar/{ApprovalPanel,QuestionCard}/index.tsx`, `src/renderer/sidebar/{AgentPanel,Timeline,RunResult}/**`
  - **테스트**: `useAgentRun.test.ts` — 승인·질문 이벤트 반영·resolve 후 닫힘·approve/answer 호출 인자·실패 toast · `ApprovalPanel.test.tsx` — 버튼 3종 결정값, 직접→계속 흐름, model kind 2버튼·설명 라벨, **기본 포커스가 [거부]** · `QuestionCard.test.tsx` — 선택지 클릭·자유 입력·빈 값 비활성·안내 문구 · `Timeline.test.tsx`·`AgentPanel.test.tsx`·`RunResult.test.tsx` 갱신
  - **실행**: `pnpm test src/renderer`
  - **검증**: `desktop/app-check` (vibe-build 7단계, 메인이 수행) —
    - 만들 것: `e2e/fixtures/pages/reservation-form.html`(제목 “예약하기”: 인원 `select`(2명/4명), 시간 버튼 그룹, 달력 = `canvas`(절대 위치 left:40px top:200px 280×200, 클릭 좌표로 날짜 선택 → `window.__dateLog`), 폼 밖 “예약 확정” 버튼 → `window.__clickLog`), `pixel-confirm.html`(canvas 에 그린 “결제” 버튼, 클릭 시 `__clickLog`). 시나리오 `e2e/fixtures/model/{approval-agent,approval-user,approval-deny,ask-user,reservation-full,pixel-confirm}.json`. `e2e/agent-mvp.spec.ts` ② 를 승인 흐름(거부)으로 갱신.
    - `e2e/agent-approval.spec.ts` 흐름: ① approval-deny: 확정 클릭 시도 → 승인 창 → [거부] → `__clickLog` [] · run 완료 ② approval-agent: [에이전트가 누르기] → `__clickLog` ['confirm'] 1개 ③ approval-user: [직접 누를게요] → 테스트가 탭 페이지에서 직접 클릭 → [계속] → `__clickLog` ['confirm'] 1개(에이전트 추가 클릭 없음) ④ ask-user: 질문 카드 선택지 “2명” → 완료, 타임라인 “질문: …” ⑤ reservation-full: select 인원 → 픽셀 left_click 으로 달력 날짜(`__dateLog` 1건, 커서 오버레이 존재 — 탭 페이지에서 `[data-mybrowser-overlay]` 존재 확인) → 확정 클릭 → 승인 창 → [에이전트가 누르기] → 완료 ⑥ pixel-confirm: canvas 좌표 클릭 → 승인 창(대상 “좌표 … 요소를 확인할 수 없음”) → [거부] → `__clickLog` [] ⑦ 대기 중 [작업 중지] → 중지됨, 클릭 없음.
    - 통과 = 콘솔·main 에러 0 + `make e2e` 전부 통과 + ①③⑥⑦ 에서 승인 없는 실행 0
  - **통과 기준**: 단위 테스트 + `make check` + `make e2e` 통과
  - **커밋**: `feat: 사이드바 승인 창·질문 카드 추가 (spec 004 Task 8)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
