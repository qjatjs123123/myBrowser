# Spec: 에이전트 사이드바 열기·닫기 — Edge 식 툴바 버튼 + 패널 X

> **상태**: 📝 계획됨
> **생성일**: 2026-11-06
> **묶음**: 기반
> **관련 spec**: 002, 009, 010
> **설계 참조**: docs/DESIGN.md §2, `.claude/skills/desktop/design` §1·§3

---

## 1. 요구사항

### 배경 / 목적
에이전트 사이드바가 항상 떠 있다. 사용자는 Edge 의 Copilot 처럼 **툴바 오른쪽 [에이전트] 버튼을 누르면 오른쪽 패널이 열리고, 패널의 X 로 닫히는** 방식을 원한다 (사용자 결정 2026-11-06, 스크린샷: Edge 툴바 끝 [채팅] → 툴바 아래 오른쪽 패널).

### 기능 요구사항
- **FR-1 (레이아웃)**: 탭 줄(신호등·탭)과 툴바(◀ ▶ ⟳ 주소창)는 **창 전체 폭**이다. 그 아래가 [탭 콘텐츠 | 에이전트 패널] 이다. (spec 010 의 "사이드바 헤더가 탭 줄과 같은 줄" 은 이 배치로 바뀐다.)
- **FR-2 (열기 버튼)**: 툴바 오른쪽 끝에 [에이전트] 버튼(✻ 아이콘 + "에이전트" 글자, 둥근 알약 모양). 접근 이름 `에이전트`, `aria-pressed` = 패널이 보이는지(FR-5b). 누르면 보이는 패널을 닫고, 안 보이면 연다.
- **FR-3 (닫기)**: 패널 헤더 오른쪽 끝에 X 버튼(접근 이름 `사이드바 닫기`). 누르면 패널이 사라지고 탭 콘텐츠가 그 폭만큼 넓어진다.
- **FR-4 (실행은 계속)**: 패널을 닫아도 실행 중인 run·대화 기록·입력 중인 글자는 그대로다 (패널을 언마운트하지 않고 숨긴다). 다시 열면 그대로 보인다.
- **FR-5 (자동 열기)**: 패널이 닫혀 있을 때 **승인 요청 또는 질문**이 오면(새 requestId) 패널이 자동으로 보인다. 보임 여부는 **렌더 중에 계산**한다 — `isPanelVisible = isOpen || (pendingRequestId !== null && pendingRequestId !== dismissedRequestId)` (effect 로 state 를 맞추지 않는다 — 카드가 보이는 상태로 마운트돼야 기본 포커스(거부)가 잡힌다). 대기 중에 X 를 누르면 `dismissedRequestId` 에 그 requestId 를 적는다. 자동으로 보인 패널에서 사용자가 결정·답을 보내면 열림을 유지한다(`isOpen = true` 저장 — 결정 직후 패널이 사라지지 않게). 숨김은 aside 의 `hidden` 속성(접근성 트리에서 빠짐).
- **FR-5b (버튼 기준)**: [에이전트] 의 `aria-pressed` 는 `isPanelVisible` 이다. 누르면 `isPanelVisible` 이 true 일 때 X 와 같은 닫기(`isOpen=false` + 대기 중이면 `dismissedRequestId`=그 requestId)를 하고, false 일 때 `isOpen=true` 로 연다. 점은 `pendingRequestId !== null && !isPanelVisible` 일 때만 보인다.
- **FR-6 (주의 점)**: 승인·질문이 대기 중인데 패널이 닫혀 있으면(사용자가 자동으로 열린 패널을 다시 닫은 경우) [에이전트] 버튼에 `--warning` 점을 표시하고 접근 이름에 상태를 더한다 (`aria-description="확인 필요"`).
- **FR-7 (기억)**: 열림/닫힘을 `localStorage` `mybrowser:layout` 의 `isSidebarOpen` 으로 기억해 다음 실행 때 그대로 시작한다. 값이 없거나 읽을 수 없으면 열림.
- **FR-8 (패널 헤더)**: 패널 헤더는 툴바 아래에 있으므로 일반 헤더로 되돌린다 — 44px, 아래 테두리, 드래그 영역 아님. 제목·상태 배지·[새 대화]·X.

### 안전 요구사항
- **SR-1**: 승인·질문은 패널이 닫혀 있어도 놓치지 않는다 — FR-5 자동 열기 + FR-6 점. 패널이 닫혀 있는 동안에도 승인 카드는 언마운트되지 않고 숨겨져 있을 뿐이며, 승인 결정은 사용자가 패널에서 고를 때만 보낸다 (닫기·열기는 결정을 보내지 않는다).
- **SR-2**: 가드·승인 IPC·결정 값은 바뀌지 않는다.

### 비기능 요구사항 / 제약
- 패널 열기/닫기 후 탭 View bounds 가 콘텐츠 영역에 맞춰진다 (`useContentBounds` 의 ResizeObserver 가 이미 처리 — 회귀 e2e 로 확인).
- 새 패키지 없음 — 열림 상태는 App 이 소유하는 로컬 state + `localStorage` (rules/renderer/store-layer.md 「먼저 로컬 state」).

### 범위 제외 (Out of Scope)
- 패널 폭 조절·분리 창(Edge 의 팝아웃)·패널 애니메이션, 단축키로 열기.

---

## 2. 설계 개요

### 영향받는 프로세스 / 파일
- `src/renderer/hooks/useSidebarOpen.ts` (신규) — `[isOpen, setIsOpen]` + `localStorage` 읽기/쓰기(try/catch). 키 `mybrowser:layout`, 값 `{ isSidebarOpen: boolean }` (zod 로 파싱, 실패면 기본 true).
- `src/renderer/App.tsx` — `useAgentRun()` 을 App 이 한 번 호출해 `AgentPanel` 에 `run` 으로 넘긴다(버튼 점·자동 열기가 같은 상태를 봐야 하므로 끌어올림). FR-5 의 렌더 중 보임 계산 + `dismissedRequestId` state, AgentPanel 의 `onRequestHandled`(결정·답 성공 시)로 `isOpen = true`. `BrowserChrome` 에 `toolbarEnd`(AgentToggleButton)·`sidePanel`(aside) slot.
- `src/renderer/chrome/BrowserChrome/index.tsx` — 툴바 끝 `toolbarEnd`, 콘텐츠 영역 옆 `sidePanel` slot (header 는 전체 폭).
- `src/renderer/chrome/AgentToggleButton/index.tsx` (신규) — FR-2·6.
- `src/renderer/sidebar/AgentPanel/index.tsx` — `run` prop 으로 받기, `onClose` 전달.
- `src/renderer/sidebar/SidebarHeader/index.tsx` — FR-8 + X(`onClose`).
- `e2e/agent-toggle.spec.ts` (신규), `e2e/window-frame.spec.ts`(사이드바 헤더 y=0·같은 높이·drag 단언을 FR-1·8 에 맞게 교체 — 요구사항 변경).
- 문서: design SKILL §1·§3, DESIGN.md §2.

### IPC 계약
변경 없음

### 도구 계약
변경 없음

### 데이터
`localStorage` 키 `mybrowser:layout` = `{ "isSidebarOpen": boolean }` (renderer 전용 UI 상태, main·DB 아님)

### 열린 질문
없음 — 사용자 확인(2026-11-06): 자동 열기, 마지막 상태 기억.

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 **테스트와 검증이 모두 에러 0**이 될 때까지 수정 → 재실행을 반복하고, 전부 통과했을 때만 체크박스를 채우고 **Task 단위로 커밋**한 뒤 다음 Task 로 진행한다.
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**

- [ ] **Task 1: 열림 상태 훅**
  - **묶음**: 기반
  - **작업**: `useSidebarOpen` (FR-7)
  - **파일**: `src/renderer/hooks/useSidebarOpen.ts`
  - **테스트**: `src/renderer/hooks/__tests__/useSidebarOpen.test.ts` — `beforeEach` 에서 `localStorage.clear()`. 저장값 없으면 true / 저장값 false 면 false / 바꾸면 `mybrowser:layout` 에 저장 / 깨진 JSON·형식 불일치면 true / `localStorage` 가 throw 해도 동작(기본 true, 저장 실패 무시)
  - **실행**: `pnpm test src/renderer/hooks/__tests__/useSidebarOpen.test.ts`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 사이드바 열림 상태 기억 훅 (spec 011 Task 1)`

- [ ] **Task 2: [에이전트] 버튼·패널 X·레이아웃·자동 열기**
  - **묶음**: 기반
  - **작업**: AgentToggleButton, BrowserChrome slot, App 조립(run 끌어올림·자동 열기), AgentPanel `run` prop, SidebarHeader X·일반 헤더 (FR-1~6·8, SR-1)
  - **파일**: `src/renderer/chrome/AgentToggleButton/index.tsx`, `src/renderer/chrome/BrowserChrome/index.tsx`, `src/renderer/App.tsx`, `src/renderer/sidebar/AgentPanel/index.tsx`, `src/renderer/sidebar/SidebarHeader/index.tsx`, `e2e/agent-toggle.spec.ts`, `e2e/window-frame.spec.ts`, `e2e/fixtures/model/approval-wait.json`(신규 — snapshot → `wait_for {ms:3000}` → click `$ref(button:예약 확정)` → text)
  - **테스트**:
    - `src/renderer/chrome/AgentToggleButton/__tests__/AgentToggleButton.test.tsx` — 이름 `에이전트`·`aria-pressed` / 클릭하면 onToggle / 주의 상태+닫힘이면 점과 `aria-description` / 열려 있으면 점 없음
    - `src/renderer/sidebar/SidebarHeader/__tests__/SidebarHeader.test.tsx` — (기존 유지) + [사이드바 닫기] 클릭 → onClose
    - `src/renderer/sidebar/AgentPanel/__tests__/AgentPanel.test.tsx` — `run` prop 으로 바뀐 렌더(테스트 안의 작은 래퍼가 `useAgentRun()` 결과를 넘긴다 — 단언은 그대로)
    - `src/renderer/__tests__/App.test.tsx` — `beforeEach` 에서 `localStorage.clear()`. (기존 유지) + [사이드바 닫기] → 사이드바 숨김·[에이전트] `aria-pressed=false` → [에이전트] → 다시 보임 / 닫힌 상태에서 approval_required 이벤트(`agent.start` mock 으로 runId 를 받은 뒤 붙잡아 둔 `onEvent` 리스너로 같은 runId) → 자동으로 보이고 [거부] 에 포커스 / 대기 중 닫기·열기를 해도 `window.api.agent.approve` 가 호출되지 않는다 / 자동으로 보인 패널에서 [에이전트] 는 aria-pressed=true 이고, 누르면 숨겨지고 점이 생긴다 / 자동으로 보인 패널에서 결정하면 열림 유지 / 닫아도 입력 중 글자 유지
    - `e2e/agent-toggle.spec.ts` — [에이전트] 는 항상 `getByRole('button', { name: '에이전트', exact: true })` (부분 일치로 `에이전트가 누르기` 와 겹침 방지). bounds 확인 전에 `openInActiveTab(win, fixtureUrl('basic.html'), …)` 로 픽스처를 연다(새 탭 View 는 숨겨져 bounds 가 적용되지 않음). [사이드바 닫기] → 사이드바 안 보임·`app.evaluate` 로 `BrowserWindow.getAllWindows()[0].contentView.children` 중 `getVisible()` 이 true 인 View 의 `getBounds().width` 가 `탭 콘텐츠` region 폭과 같아짐(poll) → [에이전트] → 다시 보임·같은 확인 / (가짜 모델 `approval-wait`) runTask 직후 [사이드바 닫기] → 사이드바 안 보임 → 승인 카드와 함께 자동으로 보이고 [거부] 포커스 / 승인 카드가 뜬 채 닫으면 [에이전트] 의 `aria-description` 이 `확인 필요` → [에이전트] 로 다시 열면 같은 승인 카드·상태 배지 `확인 필요` → [에이전트가 누르기] → `__clickLog` 가 `['confirm']` / 닫고 `app.close()` 후 같은 userData 로 다시 켜면 닫힌 채 시작
    - `e2e/window-frame.spec.ts` — 사이드바 헤더 관련 단언(y=0·탭 줄과 같은 높이·drag)은 FR-1·8 로 바뀌므로 「탭 줄·툴바가 창 전체 폭이고 [에이전트] 버튼이 툴바 오른쪽 끝」·「사이드바 헤더는 드래그 영역이 아니다(none)」로 교체, [새 대화]·상태 배지 no-drag 단언은 삭제(드래그 영역 밖)
  - **실행**: `pnpm test src/renderer` + `make e2e SPEC=e2e/agent-toggle.spec.ts` + `make e2e SPEC=e2e/window-frame.spec.ts`
  - **검증**: `desktop/app-check` — 위 흐름 + 스크린샷(열림·닫힘), 콘솔·main 에러 0 + e2e 통과
  - **통과 기준**: 테스트 + 검증 통과, 기존 sidebar-chat·agent-approval·agent-mvp e2e 셀렉터 수정 없이 통과
  - **커밋**: `feat: 툴바 [에이전트] 버튼으로 사이드바 열기·닫기 (spec 011 Task 2)`

- [ ] **Task 3: 디자인·설계 문서 갱신**
  - **묶음**: 기반
  - **작업**: design SKILL §1 그림(전체 폭 툴바 + [에이전트]·패널 X)·§3, DESIGN.md §2 의 spec 010 문장 보정
  - **파일**: `.claude/skills/desktop/design/SKILL.md`, `docs/DESIGN.md`
  - **테스트**: 코드 변경 없음 — 전체 `make e2e` 회귀
  - **실행**: `make e2e`
  - **검증**: `pnpm type-check` + 전체 e2e
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `docs: 에이전트 사이드바 열기·닫기 디자인 반영 (spec 011 Task 3)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
