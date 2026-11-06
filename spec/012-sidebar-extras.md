# Spec: 사이드바 후속 — 실행 기록 보기 · 폭 조절·단축키 · 다크 모드 · 남은 리팩토링

> **상태**: 📝 계획됨
> **생성일**: 2026-11-06
> **묶음**: 기반, main-history, renderer-history, renderer-layout, 조립
> **관련 spec**: 003, 009, 010, 011
> **설계 참조**: docs/DESIGN.md §2, `.claude/skills/desktop/design` §1·§3·§5

---

## 1. 요구사항

### 배경 / 목적
spec 009~011 에서 남긴 일을 한 번에 끝낸다 (사용자 결정 2026-11-06: 네 가지 모두, 서브에이전트 병렬). ① 지난 실행은 SQLite 에 저장되지만 볼 방법이 없다. ② 패널 폭이 360px 고정이고 단축키가 없다. ③ 다크 모드를 화면으로 확인한 적이 없다(xvfb 에서 테마 전환이 안 보였음). ④ `callSafely` 가 두 훅에 중복, 규칙 문서의 컴포넌트 목록이 낡았다.

### 기능 요구사항
**실행 기록**
- **FR-1**: 패널 헤더에 [실행 기록] 아이콘 버튼(lucide `History`, 접근 이름 `실행 기록`, `aria-pressed`). 누르면 대화 자리에 **기록 목록**, 다시 누르거나 목록의 [대화로 돌아가기] 를 누르면 대화로 돌아온다. 입력창·승인 카드는 그대로 아래에 있다.
- **FR-2**: 기록 목록 = 최근 run 50개, 최신 먼저. 한 줄 = 할 일(한 줄 말줄임) + 상태 문구(완료·실패·중지됨·확정 직전 정지·실행 중·확인 대기) + 시작 시각(`M월 D일 HH:mm`). 목록 `role="list"` 이름 `실행 기록 목록`, 각 줄은 버튼(접근 이름 = 할 일). 비면 `아직 실행 기록이 없습니다`.
- **FR-3**: 줄을 누르면 **읽기 전용 보기** — spec 009 의 말풍선 + 에이전트 턴(`Conversation` 의 `UserBubble`·`AgentTurn` 재사용, 단계 펼침)으로 그 run 의 할 일·단계(요약·상태)·결과(완료 summary / 실패 reason / 중지)를 보여준다. 위에 [목록으로] 버튼.
- **FR-4**: 목록은 열 때마다 새로 읽는다(현재 실행 중인 run 도 포함). 읽기 실패는 main 메시지로 toast + 목록 자리에 다시 시도 버튼.

**폭 조절·단축키**
- **FR-5**: 패널 왼쪽 가장자리에 폭 조절 손잡이(`role="separator"`, `aria-orientation="vertical"`, 이름 `사이드바 폭 조절`, `aria-valuenow/min/max`). 끌면 폭이 300~640px 사이에서 바뀌고, 손잡이에 포커스가 있을 때 ←/→ 로 16px 씩 조절. 탭 View 는 바뀐 폭에 맞춘다(기존 `useContentBounds`).
- **FR-6**: 폭은 `localStorage` `mybrowser:layout` 에 `sidebarWidth` 로 열림 여부와 함께 기억한다 (없거나 범위 밖이면 360).
- **FR-7**: **Ctrl+Shift+A**(macOS Cmd+Shift+A)로 패널을 연다/닫는다 — [에이전트] 버튼을 누른 것과 같다 (FR-5b of spec 011: 보이면 닫기·대기 중이면 dismiss, 안 보이면 열기). 탭 페이지에 포커스가 있어도 동작(main 판정 → `shortcut:pressed` `toggleSidebar`).

**다크 모드**
- **FR-8**: e2e 에서 `nativeTheme.themeSource = 'dark'` 로 바꾸면 크롬·사이드바가 다크 토큰으로 그려진다 — 원인(테마 전환이 반영되지 않던 이유)을 찾아 고치고, `body` 배경이 다크 `--background` 인지 e2e 로 고정한다.
- **FR-9**: 다크에서 대비가 깨지는 곳을 고친다 — 최소: 상태 배지(경고)·[에이전트] 버튼·전송 버튼·승인 카드 테두리·말풍선 배경이 배경과 구분된다. 색은 토큰만.

**리팩토링 (기능 변화 없음)**
- **FR-10**: `callSafely` 를 `src/renderer/lib/callSafely.ts` 하나로 모아 `useAgentRun`·`useWindowControls`·(새) `useRunHistory` 가 쓴다.
- **FR-11**: `.claude/rules/renderer/react-convention.md` 「위치」와 `.claude/rules/architecture.md` §3 의 sidebar·chrome 컴포넌트 목록을 실제 폴더에 맞춘다.

### 안전 요구사항
- **SR-1**: 기록 보기는 읽기 전용 — 다시 실행·승인·결정 버튼을 두지 않는다. 기록 IPC 는 조회만 한다.
- **SR-2**: 기록 응답에 도구 입력값(`input_json`)·도구 결과 원문(`result_text`)을 싣지 않는다 — 요약·상태·도구 이름만 (비밀값 노출 방지, spec 003 SR-2·SR-6 과 같은 취지).
- **SR-3**: 단축키 토글은 승인 결정을 보내지 않는다 (spec 011 SR-1 과 같음).

### 비기능 요구사항 / 제약
- 새 패키지 없음. 기록 목록 쿼리는 `LIMIT 50`.
- 폭 조절 중 탭 View bounds 갱신은 `useContentBounds` 의 기존 ResizeObserver 로 (추가 IPC 없음).

### 범위 제외 (Out of Scope)
- 기록 검색·삭제·내보내기, 기록에서 다시 실행, 기록 페이지 넘기기(50개 초과), 테마 수동 선택 UI.

---

## 2. 설계 개요

### 영향받는 프로세스 / 파일
- **기반**: `src/shared/ipc/runs.ts`(신규 스키마), `src/shared/ipc/channels.ts`(`runs`), `src/shared/ipc/api.ts`(`IApi.runs`), `src/shared/ipc/shortcut.ts`(`toggleSidebar` 추가), `src/preload/index.ts`, `vitest.setup.ts`(mock), `src/main/tabs/shortcuts.ts`(주 수식키+Shift+A → `toggleSidebar` 를 renderer 로), `src/renderer/chrome/BrowserChrome/index.tsx`(useShortcut 분기를 명시적으로 — `toggleSidebar` 가 새 탭 검색 포커스로 새지 않게), `src/renderer/lib/callSafely.ts`(FR-10), `src/renderer/hooks/{useAgentRun,useWindowControls}.ts`, `.claude/rules/renderer/react-convention.md`, `.claude/rules/architecture.md`
- **main-history**: `src/main/store/repos/runHistory.ts`(신규 — `createRunHistoryRepo(db): IRunHistory`), `src/main/ipc/handlers/runs.ts`(신규 — `createRunsHandlers(history)`). `src/main/index.ts` 조립은 공유 파일이라 **5단계 메인이 반영**(아래 「조립」).
- **renderer-history**: `src/renderer/hooks/useRunHistory.ts`, `src/renderer/sidebar/RunHistory/{index,RunHistoryList,RunHistoryDetail}.tsx`, `src/renderer/sidebar/SidebarHeader/index.tsx`([실행 기록]), `src/renderer/sidebar/AgentPanel/index.tsx`(대화 ↔ 기록 전환)
- **renderer-layout**: `src/renderer/hooks/useSidebarOpen.ts` → 폭 추가(이름 유지, 반환 객체로 변경), `src/renderer/chrome/SidebarResizer/index.tsx`(신규), `src/renderer/App.tsx`(폭·단축키·손잡이), `src/renderer/styles/globals.css`(다크 토큰 보정), (다크 원인 조사·수정은 Task 7 메인)
- **조립(5단계, 메인)**: `src/main/index.ts` 에 `...createRunsHandlers(createRunHistoryRepo(database))` 등록, e2e `e2e/run-history.spec.ts`·`e2e/sidebar-layout.spec.ts`(7단계)

### IPC 계약 (`src/shared/ipc/runs.ts`)

| 채널 | 방향 | 요청 스키마 | 응답/이벤트 스키마 |
|---|---|---|---|
| `runs:list` | invoke | 없음 | `RunListResponseSchema` = `{ runList: RunSummary[] }` (최대 50, `createdAt` 내림차순) |
| `runs:get` | invoke | `RunGetRequestSchema` = `{ runId: RunIdSchema }` | `RunGetResponseSchema` = `{ run: RunSummarySchema, stepList: StepSchema[] }` (추론 `TRunGetResponse`) — 없으면 `NOT_FOUND` "실행 기록을 찾을 수 없습니다" |
| `shortcut:pressed` | event | — | `action` enum 에 `'toggleSidebar'` 추가 |

```ts
RunSummarySchema = z.strictObject({
  id: RunIdSchema, task: z.string(), status: RunStatusSchema,
  summary: z.string().nullable(), reason: z.string().nullable(),
  createdAt: z.string(), endedAt: z.string().nullable(),
});
// StepSchema 는 @shared/agent/run 의 것 그대로 (n·tool·summary·status — 입력값 없음, SR-2)
```
`IApi.runs = { list(): Promise<TIpcResult<TRunListResponse>>; get(req: TRunGetRequest): Promise<TIpcResult<TRunGetResponse>> }`. main 측 포트: `IRunHistory { listRecent(limit: number): TRunSummary[]; getDetail(runId: string): TRunGetResponse | null }` — `src/shared/ipc/runs.ts` 에 둔다(핸들러·repo 가 같이 본다). 핸들러는 `runs:get` 요청을 `safeParse` → 실패 `INVALID_INPUT`, 응답은 보내기 전에 parse.

### 도구 계약
변경 없음

### 데이터
스키마 변경 없음 — 기존 `runs`·`steps` 를 읽기만 (`SELECT … ORDER BY created_at DESC LIMIT ?`, steps 는 `n, tool, summary, status` 만). `localStorage` `mybrowser:layout` 에 `sidebarWidth: number` 추가 (`{ isSidebarOpen, sidebarWidth }`, 둘 다 선택 — 이전 형식 `{ isSidebarOpen }` 도 읽힌다).

### 열린 질문
없음 — 세부는 권장안으로 확정(state.md).

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 **테스트와 검증이 모두 에러 0**이 될 때까지 수정 → 재실행을 반복하고, 전부 통과했을 때만 체크박스를 채우고 **Task 단위로 커밋**한 뒤 다음 Task 로 진행한다.
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.** 워크트리 묶음은 구현 + 단위 테스트까지, e2e 는 7단계(메인)가 조립 후 돌린다.

- [ ] **Task 1: 기록 IPC 계약 + toggleSidebar 단축키**
  - **묶음**: 기반
  - **작업**: `runs.ts` 스키마·`IRunHistory`, 채널·`IApi.runs`·preload·mock, shortcut enum `toggleSidebar` + main 판정(주 수식키+Shift+A) + BrowserChrome 분기 명시화
  - **파일**: `src/shared/ipc/runs.ts`, `src/shared/ipc/channels.ts`, `src/shared/ipc/api.ts`, `src/shared/ipc/shortcut.ts`, `src/preload/index.ts`, `vitest.setup.ts`, `src/main/tabs/shortcuts.ts`, `src/renderer/chrome/BrowserChrome/index.tsx`, `e2e/app-shell.spec.ts`
  - **테스트**: `src/shared/ipc/__tests__/runs.test.ts`(RunSummary·RunListResponse·RunGetResponse·RunGetRequest 유효/무효, `input_json` 같은 여분 키 거부) / `src/main/tabs/__tests__/shortcuts.test.ts`(+ Ctrl+Shift+A → toggleSidebar, darwin Cmd+Shift+A, Ctrl+Shift+다른 키는 null, runner 가 `emitShortcut('toggleSidebar')`) / `src/renderer/chrome/BrowserChrome/__tests__/BrowserChrome.test.tsx`(+ toggleSidebar 이벤트는 새 탭 검색·주소창 포커스를 건드리지 않는다) / `e2e/app-shell.spec.ts` 노출 키에 `runs` 추가·테스트 이름 갱신
  - **실행**: `pnpm test src/shared/ipc src/main/tabs src/renderer/chrome/BrowserChrome`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 실행 기록 IPC 계약·사이드바 토글 단축키 (spec 012 Task 1)`

- [ ] **Task 2: callSafely 공용화 + 규칙 문서 정리 (리팩토링)**
  - **묶음**: 기반
  - **작업**: FR-10·11 — 동작 그대로
  - **파일**: `src/renderer/lib/callSafely.ts`, `src/renderer/hooks/useAgentRun.ts`, `src/renderer/hooks/useWindowControls.ts`, `.claude/rules/renderer/react-convention.md`, `.claude/rules/architecture.md`
  - **테스트**: `src/renderer/lib/__tests__/callSafely.test.ts`(성공 봉투 그대로·실패 봉투 그대로·throw 면 `INTERNAL` + 주어진 문장) / 기존 `useAgentRun`·`useWindowControls` 테스트 그대로 통과(수정 없이)
  - **실행**: `pnpm test src/renderer/lib src/renderer/hooks`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 기존 훅 테스트 무수정 통과
  - **커밋**: `refactor: IPC 안전 호출 공용화·규칙 컴포넌트 목록 갱신 (spec 012 Task 2)`

- [ ] **Task 3: 기록 조회 저장소·핸들러**
  - **묶음**: main-history
  - **작업**: `createRunHistoryRepo(db)` (listRecent: 최신순 LIMIT, getDetail: run + steps(n·tool·summary·status)), `createRunsHandlers(history)`
  - **파일**: `src/main/store/repos/runHistory.ts`, `src/main/ipc/handlers/runs.ts`
  - **테스트**: `src/main/store/repos/__tests__/runHistory.test.ts`(메모리 DB + `createRunRepo` 로 run 3개·step 기록 → 최신순·limit·step 순서·입력값/결과 원문 미포함·없는 id null) / `src/main/ipc/__tests__/runs.test.ts`(list 봉투, get 유효→봉투, 잘못된 요청→INVALID_INPUT, 없음→NOT_FOUND 문장)
  - **실행**: `pnpm test src/main/store src/main/ipc/__tests__/runs.test.ts`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 실행 기록 조회 저장소·IPC 핸들러 (spec 012 Task 3)`

- [ ] **Task 4: 기록 목록·읽기 전용 보기**
  - **묶음**: renderer-history
  - **작업**: `useRunHistory`(list/get, callSafely), `RunHistory`(목록·상세·빈·실패 상태), SidebarHeader [실행 기록], AgentPanel 대화↔기록 전환 (FR-1~4, SR-1)
  - **파일**: `src/renderer/hooks/useRunHistory.ts`, `src/renderer/sidebar/RunHistory/index.tsx`, `src/renderer/sidebar/RunHistory/RunHistoryList.tsx`, `src/renderer/sidebar/RunHistory/RunHistoryDetail.tsx`, `src/renderer/sidebar/SidebarHeader/index.tsx`, `src/renderer/sidebar/AgentPanel/index.tsx`
  - **테스트**: `src/renderer/hooks/__tests__/useRunHistory.test.ts`(list·get 봉투, throw → INTERNAL) / `src/renderer/sidebar/RunHistory/__tests__/RunHistory.test.tsx`(목록 순서·상태 문구·시각 형식, 빈 문구, 줄 클릭 → 상세(말풍선·단계·결과)·[목록으로], 실패 → toast + 다시 시도, 상세에 실행·승인 버튼 없음) / SidebarHeader·AgentPanel 테스트 + [실행 기록] 토글(대화↔목록, 입력창 유지)
  - **실행**: `pnpm test src/renderer/hooks src/renderer/sidebar`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 사이드바 실행 기록 목록·읽기 전용 보기 (spec 012 Task 4)`

- [ ] **Task 5: 폭 조절 손잡이·폭 기억·단축키 토글**
  - **묶음**: renderer-layout
  - **작업**: 사이드바 `<aside>` 는 `w-sidebar` 를 유지하고 폭은 `style={{ '--sidebar-width': `${width}px` }}` 로 CSS 변수만 덮어쓴다 — react-convention 「inline style 금지」의 예외는 이 한 곳(토큰 변수 덮어쓰기)뿐 (Task 7 에서 규칙에 예외 한 줄 추가). `useSidebarOpen` 을 `{ isOpen, setIsOpen, width, setWidth }` 로(이전 저장 형식 호환 — `sidebarWidth` 만 범위 밖이면 열림 여부는 저장값, 폭만 360), `SidebarResizer`(포인터 드래그·←/→), App 에 손잡이·폭·`useShortcut('toggleSidebar')` → togglePanel (FR-5~7, SR-3)
  - **파일**: `src/renderer/hooks/useSidebarOpen.ts`, `src/renderer/chrome/SidebarResizer/index.tsx`, `src/renderer/App.tsx`, `src/renderer/hooks/__tests__/useSidebarOpen.test.ts`
  - **테스트**: `useSidebarOpen.test.ts`(기존 단언은 반환 모양만 객체로, 저장값 단언은 `{ isSidebarOpen: false, sidebarWidth: 360 }` 로 — 요구사항 변경(FR-6, 둘 다 함께 저장) / + 폭 기본 360·범위 밖 360·저장·이전 형식 읽힘) / `src/renderer/chrome/SidebarResizer/__tests__/SidebarResizer.test.tsx`(separator 속성, 포인터 이동 → onResize(범위 고정), ←/→ 16px) / `src/renderer/__tests__/App.test.tsx`(+ toggleSidebar 단축키 이벤트로 닫기·열기, 대기 중 단축키 닫기도 approve 미호출)
  - **실행**: `pnpm test src/renderer/hooks src/renderer/chrome/SidebarResizer src/renderer/__tests__/App.test.tsx`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 사이드바 폭 조절·Ctrl+Shift+A 토글 (spec 012 Task 5)`

- [ ] **Task 6: 다크 모드 토큰 대비 보정**
  - **묶음**: renderer-layout
  - **작업**: FR-9 다크 토큰 대비 보정만 (FR-8 원인 조사·수정은 앱을 띄워야 하므로 Task 7 메인이 한다) — 다크 `--muted`·`--border`·`--warning`·`--brand` 등이 다크 `--background` 와 구분되게
  - **파일**: `src/renderer/styles/globals.css`
  - **테스트**: CSS 토큰만이라 단위 테스트 없음 — 검증은 Task 7 의 `e2e/sidebar-layout.spec.ts` 다크 단언·스크린샷
  - **실행**: `pnpm check` (lint·타입·vitest 회귀)
  - **검증**: `pnpm type-check` + 회귀 단위 테스트
  - **통과 기준**: 회귀 통과, 바꾼 토큰과 이유(대비)를 보고에
  - **커밋**: `design: 다크 모드 토큰 대비 보정 (spec 012 Task 6)`

- [ ] **Task 7: 조립 + e2e + 문서**
  - **묶음**: 조립(메인 직접 — 5단계 merge 뒤, 도우미에게 배정하지 않는다)
  - **작업**: `src/main/index.ts` 에 runs 핸들러 등록, FR-8 다크 테마 미반영 원인 조사·수정(재현 명령·근거를 진행 로그에), e2e 2개, design SKILL·DESIGN.md·react-convention(inline style 예외 한 줄) 갱신
  - **파일**: `src/main/index.ts`, `e2e/run-history.spec.ts`, `e2e/sidebar-layout.spec.ts`, `.claude/skills/desktop/design/SKILL.md`, `docs/DESIGN.md`, `.claude/rules/renderer/react-convention.md`, FR-8 원인 위치 파일
  - **테스트**:
    - `e2e/run-history.spec.ts` — 할 일 2개 실행(가짜 모델 default) → [실행 기록] → 목록 2줄 최신 먼저·상태 `완료` → 줄 클릭 → 말풍선·결과 → [목록으로] → [대화로 돌아가기] / 승인 거부 run(`approval-confirm`)의 상세에 `거부됨` 단계, 실행·승인 버튼 없음
    - `e2e/sidebar-layout.spec.ts` — 손잡이를 끌면 패널 폭이 바뀌고 탭 View 폭이 콘텐츠 영역과 같다(픽스처 연 뒤, spec 011 방식) / 다시 켜면 폭 유지(같은 userData) / 탭 페이지에 포커스한 채 Ctrl+Shift+A → 닫힘 → 다시 → 열림 / `nativeTheme.themeSource='dark'` → `body` 배경색이 다크 `--background` 값 + 다크 스크린샷(시각 확인용)
  - **실행**: `make e2e SPEC=e2e/run-history.spec.ts` · `make e2e SPEC=e2e/sidebar-layout.spec.ts` · 전체 `make e2e`
  - **검증**: `desktop/app-check` — 위 흐름, 콘솔·main 에러 0 + e2e 통과
  - **통과 기준**: 전체 e2e 통과(기존 e2e 셀렉터 수정 없이)
  - **커밋**: `feat: 실행 기록·폭 조절 조립과 e2e (spec 012 Task 7)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
