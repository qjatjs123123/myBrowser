# Spec: 사이드바 대화형 UI — Claude 스타일 입력창·Enter 실행·번호 선택 목록

> **상태**: ✅ 완료
> **생성일**: 2026-11-06
> **묶음**: renderer-sidebar
> **관련 spec**: 003, 004, 005
> **설계 참조**: docs/DESIGN.md §2 (사이드바), `.claude/skills/desktop/design` §3·§4

---

## 1. 요구사항

### 배경 / 목적
사이드바는 "상태 배지 + 타임라인 + 하단 Textarea/[실행]" 이고 Ctrl+Enter 로만 실행된다. 사용자는 Claude Code 패널처럼 대화형 화면(할 일 말풍선 → 에이전트 턴), 둥근 입력창 + 원형 전송 버튼, **Enter 로 실행**, 승인·질문은 **번호 선택 목록**(↑↓·숫자키·Enter)을 원한다 (사용자 결정 2026-11-06).

### 기능 요구사항
- **FR-1 (대화 기록)**: 한 세션 안에서 실행한 할 일들이 위에서 아래로 쌓인다 — 할 일은 오른쪽 말풍선, 에이전트 응답은 그 아래 턴. 기록은 renderer 메모리에만 있고(앱 재시작 시 사라짐) main·DB 는 바뀌지 않는다.
- **FR-2 (에이전트 턴)**: 턴 맨 위 접기 헤더 `N단계` (N = 단계 수, 0 이면 `생각 중…`/`단계 없음`), 펼치면 기존 타임라인(list "진행 단계"). **접히는 것은 `pastTurnList` 로 넘어간 지난 턴뿐이다** — 현재 턴(마지막 턴)은 실행이 끝나도 펼친 상태를 유지하고, 다음 할 일이 시작되면 그때 접힌다(사용자가 헤더로 다시 펼칠 수 있음). 헤더 아래에 결과 문단(region "실행 결과" — ● 점 + 본문), 맨 아래 줄에 상태 문구(완료·중지됨·실패·확정 직전 정지·실행 중) + [복사] 버튼(결과 문구를 클립보드로).
- **FR-3 (말풍선 복사)**: 할 일 말풍선 아래 [복사] 버튼 — 할 일 문구를 클립보드로.
- **FR-4 (새 대화)**: 사이드바 헤더에 [새 대화] 버튼 — 기록을 비운다. 실행·대기 중에는 비활성.
- **FR-5 (헤더)**: 헤더에 제목 `에이전트`(heading 유지) + 상태 배지(role=status "실행 상태", 문구·강조 규칙 그대로) + [새 대화].
- **FR-6 (입력창)**: 하단 둥근 카드형 입력창 — 자동 높이 Textarea(aria "할 일", 최대 약 8줄 후 스크롤) + 오른쪽 아래 원형 버튼. 대기 시 위쪽 화살표(aria "작업 실행"), 실행 중엔 같은 자리 정지(aria "작업 중지"). 실행이 시작되면(start 성공) 입력창을 비운다 — 할 일은 말풍선으로 올라간다. 시작 실패면 입력을 그대로 둔다.
- **FR-7 (Enter 실행)**: Textarea 에서 **Enter = [작업 실행] 클릭과 같다**. Shift+Enter 는 줄바꿈. Ctrl/Cmd+Enter 도 실행. **IME 조합 중 Enter(`isComposing` 또는 keyCode 229)는 무시** — 한글 마지막 글자가 두 번 실행되지 않게. 빈 입력·실행 중이면 아무 일도 없다.
- **FR-8 (선택 목록)**: 공용 `ChoiceList` — 행마다 번호(`1.`) + 라벨, 강조 행은 배경 + `›`. ↑↓ 로 강조 이동(끝에서 순환), 숫자키 1~9 로 해당 행 바로 선택, Enter·Space·클릭 = 강조 행 선택. **Enter·Space 는 keydown 에서 `preventDefault()` 하고 `onChoose` 를 한 번만 부른다** (네이티브 button 의 키→click 과 중복 전송 금지). 강조 행에 실제 DOM 포커스(roving tabindex). 번호·`›` 는 `aria-hidden` 이라 버튼 접근 이름 = 라벨. 마운트 시 `defaultIndex` 행에 포커스.
- **FR-9 (승인 창)**: `GuardChoice`(직접 누를게요 / 에이전트가 누르기 / 거부)와 `ModelChoice`(승인 / 거부)를 `ChoiceList` 로 — **기본 강조·포커스 = 거부**. 직접 누르기 후 [계속] 단계는 그대로.
- **FR-10 (질문 카드)**: 선택지가 있으면 `ChoiceList`(기본 강조 = 첫 선택지) + 아래 자유 입력(aria "답변" + [보내기]). 선택지가 없으면 자유 입력에 포커스. 비밀값 안내 문구 유지.
- **FR-11 (카드 모양)**: 승인·질문 카드는 대화 끝(입력창 위)에 붙는 `rounded-xl` 카드 — 제목 줄 아이콘·테두리만 `--warning`(상태 강조 원칙 유지).
- **FR-12 (빈 상태)**: 대화가 비면 기존 문구 `할 일을 입력하면 여기에 진행 상황이 표시됩니다` 를 그대로 보여준다 ([새 대화] 후 포함).

### 안전 요구사항
- **SR-1**: 승인 창은 **Enter 한 번으로 승인되지 않는다** — 마운트 직후 강조·포커스는 [거부]이므로 Enter 는 `denied` 다. 승인/에이전트가 누르기는 ↑↓ 이동·숫자키·클릭으로만. 단위 테스트로 고정.
- **SR-2**: 입력창 Enter 는 `agent:start` 만 부른다 — 승인·질문에 답하지 않는다 (승인 카드가 떠 있어도 입력창 Enter 는 실행 중이라 무시).
- **SR-3**: `guard.ts`·승인 IPC·결정 값(`agent`·`user_done`·`denied`·`approved`)은 바뀌지 않는다. 승인 창 행동·대상·이유 표시(`ApprovalDetail`)도 그대로.

### 비기능 요구사항 / 제약
- 색은 토큰만 — 전송 버튼·✻ 아이콘용 `--brand`/`--brand-foreground` 토큰 추가(라이트·다크). 크롬(상단바)에는 쓰지 않는다.
- 기존 e2e 의 접근 이름(`할 일`, `작업 실행`, `작업 중지`, `실행 상태`, `진행 단계`, `실행 결과`, `승인 필요`, `에이전트 질문`, `답변`, 각 선택 버튼 라벨, heading `에이전트`)을 유지한다.
- 애니메이션 150ms 이내.

### 범위 제외 (Out of Scope)
- SQLite 기록 불러오기(기록 목록), 스크린샷 상단의 웹·이미지·플러그인·알림 아이콘, 토큰·크레딧 통계 줄, 추론 강도 선택, 파일 첨부, 사이드바 폭 조절.

---

## 2. 설계 개요

### 영향받는 프로세스 / 파일
- `src/renderer/styles/globals.css` — `--brand`, `--brand-foreground` (+ `@theme inline` 매핑)
- `src/renderer/hooks/useAgentRun.ts` — `ITurn = { runId, task, status, stepList, result }`, state 에 `pastTurnList: ITurn[]`, `currentTask: string | null`. `started` 액션에 `task` → 직전 run(있으면)을 `pastTurnList` 끝에 넣고 새 run 시작. `reset()` — 활성(queued·running·waiting_user)이 아니면 `INITIAL_STATE`. 기존 반환 필드는 그대로.
- `src/renderer/sidebar/ChoiceList/index.tsx` (신규) — `IChoice { label: string; value: string }`, props `{ choiceList, defaultIndex?, isDisabled, onChoose(value) }`.
- `src/renderer/sidebar/ApprovalPanel/{index,GuardChoice,ModelChoice}.tsx`, `src/renderer/sidebar/QuestionCard/index.tsx` — ChoiceList 사용, 카드 스타일.
- `src/renderer/sidebar/AgentPanel/TaskInput.tsx` — FR-6·7.
- `src/renderer/sidebar/Conversation/` (신규) — `index.tsx`(턴 목록 + 자동 스크롤 + 빈 상태), `UserBubble.tsx`, `AgentTurn.tsx`, `CopyButton.tsx`. 클립보드는 `navigator.clipboard.writeText`(실패 시 toast).
- `src/renderer/sidebar/RunResult/index.tsx` — 평문 스타일(● 점 + 본문), region "실행 결과" 유지.
- `src/renderer/sidebar/AgentPanel/index.tsx` — Conversation + 대기 카드 + TaskInput 조립. `StatusBadge` 는 헤더로 이동.
- `src/renderer/sidebar/SidebarHeader/index.tsx` (신규) — 제목 + 배지 + [새 대화]. 상태를 AgentPanel 이 갖고 있으므로 AgentPanel 이 렌더(`App.tsx` 의 h2 는 제거하고 AgentPanel 위로 AccountCard 순서 유지: 헤더 → AccountCard → 대화 → 입력 → AppInfoFooter). 헤더를 AgentPanel 안에 두려면 AccountCard 를 slot 으로 받는다 (`accountSlot: ReactNode`).
- `e2e/sidebar-chat.spec.ts` (신규)
- 문서: `.claude/skills/desktop/design/SKILL.md` §1·§3·§4, `docs/DESIGN.md` 사이드바 서술(해당 줄 있으면).

### IPC 계약
변경 없음

### 도구 계약
변경 없음

### 데이터
변경 없음

### 열린 질문
없음 — 사용자 확인(2026-11-06): 세션 내 기록, 승인 창에도 선택 목록·기본 거부, 008 먼저 merge.

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 **테스트와 검증이 모두 에러 0**이 될 때까지 수정 → 재실행을 반복하고, 전부 통과했을 때만 체크박스를 채우고 **Task 단위로 커밋**한 뒤 다음 Task 로 진행한다.
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**

- [x] **Task 1: 대화 기록 상태 + brand 토큰**
  - **묶음**: renderer-sidebar
  - **작업**: `useAgentRun` 에 `pastTurnList`·`currentTask`·`reset`, `globals.css` 에 `--brand` 토큰
  - **파일**: `src/renderer/hooks/useAgentRun.ts`, `src/renderer/styles/globals.css`
  - **테스트**: `src/renderer/hooks/__tests__/useAgentRun.test.ts` — 두 번째 start 후 첫 run 이 `pastTurnList[0]`(task·stepList·result 포함) / currentTask 가 새 할 일 / 시작 실패면 기록 변화 없음 / reset 은 완료 후 기록·현재 턴 비움 / 실행 중 reset 은 무시
  - **실행**: `pnpm test src/renderer/hooks/__tests__/useAgentRun.test.ts`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 사이드바 대화 기록 상태 (spec 009 Task 1)`

- [x] **Task 2: 번호 선택 목록 + 승인·질문 카드**
  - **묶음**: renderer-sidebar
  - **작업**: `ChoiceList` 신규, GuardChoice·ModelChoice·QuestionCard 적용, 카드 스타일 (FR-8~11, SR-1)
  - **파일**: `src/renderer/sidebar/ChoiceList/index.tsx`, `src/renderer/sidebar/ApprovalPanel/*.tsx`, `src/renderer/sidebar/QuestionCard/index.tsx`
  - **테스트**:
    - `src/renderer/sidebar/ChoiceList/__tests__/ChoiceList.test.tsx` — defaultIndex 행 포커스 / ↓↑ 이동·순환 / 숫자키 선택 / Enter 선택 / 번호가 접근 이름에 없음 / isDisabled 면 선택 안 됨
    - `src/renderer/sidebar/ApprovalPanel/__tests__/ApprovalPanel.test.tsx` — (기존 유지, 단 「모델 승인 창은 [승인]/[거부] 두 버튼만 있다」는 번호·›가 textContent 에 들어가므로 접근 이름 기준으로 — 버튼 2개이고 `{name:'승인'}`·`{name:'거부'}` 존재) + 가드·모델 승인 마운트 직후 Enter → `denied` / ↑ 후 Enter → 다른 결정 / 숫자 2 → `agent`
    - `src/renderer/sidebar/QuestionCard/__tests__/QuestionCard.test.tsx` — (기존 유지, 단 「열리면 답변칸에 포커스가 간다」는 요구사항 변경(FR-10)이라 「선택지가 있으면 첫 선택지에 포커스」로 교체) + Enter 로 첫 선택지 답 / 선택지 없으면 답변칸 포커스(신규)
  - **실행**: `pnpm test src/renderer/sidebar` + `make e2e SPEC=e2e/agent-approval.spec.ts`
  - **검증**: `desktop/app-check` — 가짜 모델 `approval-confirm` 으로 승인 창 열기 → 거부 포커스 확인 → Enter 한 번 → 거부됨, `agent:approve` 1회만(중복 전송 시 NOT_FOUND toast·main 에러가 남으므로 toast·에러 0 확인), 콘솔·main 에러 0 + e2e 통과
  - **통과 기준**: 테스트 + 검증 통과, 승인 전 클릭 0 (기존 e2e `__clickLog`)
  - **커밋**: `feat: 승인·질문 카드를 번호 선택 목록으로 (spec 009 Task 2)`

- [x] **Task 3: 입력창 — 둥근 카드·Enter 실행**
  - **묶음**: renderer-sidebar
  - **작업**: `TaskInput` 재디자인 (FR-6·7, SR-2)
  - **파일**: `src/renderer/sidebar/AgentPanel/TaskInput.tsx`
  - **테스트**: `src/renderer/sidebar/AgentPanel/__tests__/AgentPanel.test.tsx` — Enter 실행 / Shift+Enter 미실행 / 조합 중 Enter(isComposing) 미실행 / 빈 입력 Enter 미실행 / Ctrl+Enter 실행(유지). 기존 「Ctrl 없이 Enter 만 누르면 실행하지 않는다」는 요구사항 변경(FR-7)이라 「Shift+Enter 는 실행하지 않는다」로 교체. 원형 버튼에는 보이는 글자가 없으므로 기존 「실행 중에는 작업 중지 버튼…」의 `toHaveTextContent('중지')` 는 '작업 중지' 접근 이름 확인으로 교체(FR-6)
  - **실행**: `pnpm test src/renderer/sidebar/AgentPanel`
  - **검증**: `pnpm type-check` + 단위 테스트 (e2e 는 Task 4)
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 할 일 입력창 Enter 실행·카드형 디자인 (spec 009 Task 3)`

- [x] **Task 4: 대화 화면 조립 + 헤더**
  - **묶음**: renderer-sidebar
  - **작업**: `Conversation`(UserBubble·AgentTurn·CopyButton), `SidebarHeader`, `RunResult` 평문화, `AgentPanel`·`App.tsx` 조립 (FR-1~5, FR-12)
  - **파일**: `src/renderer/sidebar/Conversation/*`, `src/renderer/sidebar/SidebarHeader/index.tsx`, `src/renderer/sidebar/RunResult/index.tsx`, `src/renderer/sidebar/AgentPanel/index.tsx`, `src/renderer/App.tsx`, `e2e/sidebar-chat.spec.ts`
  - **테스트**:
    - `src/renderer/sidebar/Conversation/__tests__/Conversation.test.tsx` — 빈 상태 문구(FR-12) / 지난 턴 + 현재 턴 순서대로 말풍선·턴 / 지난 턴은 접힘(진행 단계 숨김)·헤더 클릭으로 펼침 / 현재 턴은 완료 후에도 펼침 / 복사 버튼이 `navigator.clipboard.writeText` 호출
    - `src/renderer/sidebar/SidebarHeader/__tests__/SidebarHeader.test.tsx` — heading `에이전트`, 상태 배지, [새 대화] 비활성 조건·클릭 콜백
    - `src/renderer/sidebar/AgentPanel/__tests__/AgentPanel.test.tsx`·`src/renderer/__tests__/App.test.tsx` — 바뀐 구조에 맞춤 (접근 이름 그대로). 「step·종료 이벤트가 오면…」의 마지막 단언(완료 후 [작업 실행] 활성)은 FR-6 입력 비우기 때문에 「입력칸 활성 + 새 할 일을 쓰면 [작업 실행] 활성」으로 교체. 추가: 시작 시 입력 비움·말풍선 / 시작 실패 시 입력 유지 / [새 대화] 비활성 조건·비우기
    - `e2e/sidebar-chat.spec.ts` — (가짜 모델 default) 할 일 입력 후 **Enter** → 상태 `완료`·말풍선·결과 / 두 번째 할 일 Enter → 말풍선 2개·실행 결과 2개 / [새 대화] → 빈 상태 문구 `할 일을 입력하면 여기에 진행 상황이 표시됩니다`
  - **실행**: `pnpm test src/renderer` + `make e2e SPEC=e2e/sidebar-chat.spec.ts` + 전체 `make e2e`
  - **검증**: `desktop/app-check` — 위 흐름 + 승인 흐름(`approval-confirm`)·질문 흐름(`ask-user`)에서 카드 위치·스크린샷 확인, 콘솔·main 에러 0 + e2e 통과
  - **통과 기준**: 테스트 + 검증 통과, 기존 e2e 셀렉터 수정 없이 통과
  - **커밋**: `feat: 사이드바를 대화형 화면으로 (spec 009 Task 4)`

- [x] **Task 5: 디자인 기준 문서 갱신**
  - **묶음**: renderer-sidebar
  - **작업**: design SKILL §1(레이아웃 그림)·§3(대화형·Enter 실행)·§4(번호 선택 목록·기본 강조 거부·Enter=거부), DESIGN.md 사이드바 서술
  - **파일**: `.claude/skills/desktop/design/SKILL.md`, `docs/DESIGN.md`
  - **테스트**: 코드 변경 없음 — 전체 `make e2e` 회귀
  - **실행**: `make e2e`
  - **검증**: `pnpm type-check` + 전체 e2e
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `docs: 사이드바 대화형 디자인 기준 반영 (spec 009 Task 5)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
| 2026-11-06 | 1 | useAgentRun +4 (대화 기록·reset) | 검증 반영 커밋 | 직접 방식 |
| 2026-11-06 | 2 | ChoiceList 10 · ApprovalPanel +5 · QuestionCard +2 · agent-approval e2e 9 | 검증 반영 커밋 | |
| 2026-11-06 | 3 | AgentPanel Enter·Shift+Enter·IME·빈 입력 | 검증 반영 커밋 | |
| 2026-11-06 | 4 | Conversation 10 · SidebarHeader 3 · AgentPanel +3 · sidebar-chat e2e 3 | 검증 반영 커밋 | 입력 비우기(FR-6) 반영으로 기존 단언 1개 교체 |
| 2026-11-06 | 5 | 문서만 | 검증 반영 커밋 | |
| 2026-11-06 | 검증 | make check 1394 · make e2e 35 · 에러 0 | 검증 반영 커밋 | 다크 모드는 xvfb 에서 화면 확인 못 함(토큰만) |
