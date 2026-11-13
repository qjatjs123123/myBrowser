# Spec: 에이전트 입력창 추천 문구 — 흐린 글씨로 보여주고 Tab 으로 입력

> **상태**: ✅ 완료
> **생성일**: 2026-11-13
> **묶음**: 기반 (단일 묶음 — 직접 방식)
> **관련 spec**: 009 (할 일 입력), 012 (실행 기록 runs:list)
> **설계 참조**: docs/DESIGN.md §2 사이드바

---

## 1. 요구사항

### 배경 / 목적
사용자 (2026-11-13): "그 에이전트 입력창에 placeholder처럼 추천문구를 보여주고 탭누르면 자동으로 추천문구 입력되는 기능". 확정: 추천 출처 = **현재 탭 + 지난 작업 기반(규칙, 모델 호출 없음)**, 표시 = **치는 중에도 이어쓰기**.

### 기능 요구사항
- **FR-1 (추천 목록)**: 추천 목록 = [현재 탭 사이트 추천 1개] + [최근 실행한 작업(task) 최대 5개, 최신순, 앞뒤 공백 제거·빈 값·중복 제외]. 사이트 추천 규칙(현재 활성 탭 URL 의 host 기준, 위에서부터 첫 일치):
  | 조건 | 추천 문구 |
  |---|---|
  | `about:blank`(새 탭) 또는 활성 탭 없음 | `네이버에서 맛집 검색해서 평점 높은 곳 3개 알려줘` |
  | host 가 `map.naver.com`·`m.map.naver.com`·`pcmap.place.naver.com`·`m.place.naver.com` (또는 그 하위) | `이 가게 오늘 저녁 7시 2명 예약해줘` |
  | host 가 `coupang.com`·`11st.co.kr`·`gmarket.co.kr`·`smartstore.naver.com`·`shopping.naver.com` (또는 그 하위) | `이 상품 다른 쇼핑몰 최저가랑 비교해줘` |
  | 그 밖의 http·https 페이지 | `이 페이지 핵심만 3줄로 요약해줘` |
- **FR-2 (빈 입력)**: 입력창이 비어 있으면 추천 목록의 첫 문구를 placeholder 자리에 흐리게 보인다 (기존 `할 일을 입력하세요` 대신). 추천이 하나도 없으면 기존 placeholder.
- **FR-3 (이어쓰기)**: 입력값이 비어 있지 않고 줄바꿈이 없으면, 추천 목록 순서대로 입력값으로 **시작하고 더 긴** 첫 문구의 나머지를 입력 글자 바로 뒤에 흐리게 이어 보인다 (대소문자 구분 없음은 하지 않는다 — 그대로 비교). 일치가 없으면 아무것도 보이지 않는다.
- **FR-4 (Tab 입력)**: 흐린 추천이 보일 때 Tab(Shift·Ctrl·Alt·Meta 없음, IME 조합 중 아님)을 누르면 입력값이 그 추천 문구 전체가 되고 포커스는 입력창에 남는다. 실행은 하지 않는다(Enter 로 실행 — 기존 그대로). 추천이 없을 때 Tab 은 기본 동작(포커스 이동) 그대로.
- **FR-5 (안내)**: 흐린 추천이 보일 때 아래 안내 줄을 `Tab 추천 입력 · Enter 실행 · Shift+Enter 줄바꿈` 으로, 아니면 기존 `Enter 실행 · Shift+Enter 줄바꿈`.
- **FR-6 (갱신)**: 탭 이동·전환(`tabs:changed`)마다 사이트 추천이 바뀐다. 최근 작업은 패널이 뜰 때와 run 이 끝날 때(실행 중 → 실행 중 아님) `runs:list` 로 다시 읽는다. 읽기 실패는 조용히 무시하고 사이트 추천만 쓴다 (부가 기능이라 toast 없음).
- **FR-7 (실행 중)**: 실행 중(입력 잠김)에는 추천을 보이지 않는다.

### 안전 요구사항
- **SR-1**: 추천은 입력창 값만 바꾼다 — run 시작·도구 실행·승인 흐름과 무관하다 (Tab 으로 실행되지 않음).
- **SR-2**: 최근 작업은 이미 로컬 DB 에 있는 task 문자열만 쓴다 (runs:list, spec 012 SR-2 범위 — 도구 입력·결과 원문은 쓰지 않는다). 외부 전송 없음.

### 비기능 요구사항 / 제약
- IPC 계약 변경 없음 (`tabs:list`·`tabs:changed`·`runs:list` 재사용).
- 흐린 이어쓰기 글자는 textarea 위에 같은 글꼴·여백으로 겹친 `aria-hidden` 표시층(pointer-events 없음)으로 그린다. 색은 `text-muted-foreground` 토큰.
- **기존 e2e 영향**: placeholder 문구가 바뀐다 — `할 일을 입력하세요`·`Enter 실행` 을 선택자로 쓰는 e2e 는 없음(확인함). 입력창은 `aria-label="할 일"` 그대로.

### 범위 제외 (Out of Scope)
모델로 추천 생성, 여러 추천 사이 순환(↑/↓), 추천 문구 사용자 편집, 음성 입력.

---

## 2. 설계 개요

### 영향받는 프로세스 / 파일 (renderer 만)
- `src/renderer/utils/taskSuggestion.ts` (신규, 순수) — `getSiteSuggestion(url: string | null): string`, `createSuggestionList({ activeUrl, recentTaskList }): string[]`, `findSuggestion(input: string, suggestionList: string[]): string | null` (FR-2·3: 빈 입력이면 첫 문구, 아니면 이어쓸 첫 문구 전체, 없으면 null).
- `src/renderer/hooks/useTaskSuggestion.ts` (신규) — `useTaskSuggestion({ isRunActive }): string[]` — `useTabs().activeTab?.url` + `useRunHistory().list()` 결과의 task 로 추천 목록. run 이 끝날 때 다시 읽는다.
- `src/renderer/sidebar/AgentPanel/TaskInput.tsx` — prop `suggestion: string | null` 추가. placeholder·흐린 이어쓰기·Tab 처리·안내 줄 (FR-2~5, 7).
- `src/renderer/sidebar/AgentPanel/index.tsx` — `useTaskSuggestion` → `findSuggestion(task, list)` 를 `TaskInput` 에 넘긴다.
- e2e: `e2e/task-suggestion.spec.ts` (신규)

### IPC 계약
변경 없음

### 도구 계약
변경 없음

### 데이터
변경 없음

### 열린 질문
없음

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 **테스트와 검증이 모두 에러 0**이 될 때까지 수정 → 재실행을 반복하고, 전부 통과했을 때만 체크박스를 채우고 **Task 단위로 커밋**한 뒤 다음 Task 로 진행한다.
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**

- [x] **Task 1: 추천 규칙(순수 함수) + 훅**
  - **묶음**: 기반
  - **작업**: `taskSuggestion.ts`, `useTaskSuggestion.ts`. `vitest.setup.ts` 에 기본 응답을 둔다 — `tabs.list` → `ok({ tabList: [], activeTabId: null })`, `runs.list` → `ok({ runList: [] })` (skills.list 처럼 구현으로 둬 clearAllMocks 뒤에도 유지). 개별 테스트의 `mockResolvedValue` 는 그대로 우선한다 (Task 2 에서 AgentPanel·App 테스트가 추천 훅 때문에 깨지지 않게)
  - **파일**: `src/renderer/utils/taskSuggestion.ts`, `src/renderer/hooks/useTaskSuggestion.ts`, 각 `__tests__`, `vitest.setup.ts`
  - **테스트**:
    - `src/renderer/utils/__tests__/taskSuggestion.test.ts` — FR-1 표의 각 조건(새 탭·null·지도 하위 도메인·쇼핑몰·일반 페이지·`naver.com` 은 일반) / 최근 작업 최신순·공백 제거·빈 값·중복(사이트 추천과 같은 문구 포함) 제외·최대 5개 / findSuggestion: 빈 입력 → 첫 문구, 접두 일치 → 더 긴 첫 문구, 입력과 같은 길이의 완전 일치는 제외, 일치 없음·줄바꿈 포함 → null, 빈 목록 → null
    - `src/renderer/hooks/__tests__/useTaskSuggestion.test.ts` — runs.list 의 task 가 목록에 들어간다 / 활성 탭이 바뀌면(tabs.onChanged) 사이트 추천이 바뀐다 / isRunActive true→false 이면 runs.list 를 다시 부른다 / runs.list 실패면 사이트 추천만
  - **실행**: `pnpm test src/renderer` (setup 기본값 변경이 renderer 전체에 영향)
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 입력창 추천 문구 규칙과 훅 (spec 019 Task 1)`

- [x] **Task 2: 입력창 흐린 추천·Tab 입력 + 조립 + e2e**
  - **묶음**: 기반
  - **작업**: FR-2~7 — TaskInput 표시·키 처리, AgentPanel 조립
  - **파일**: `src/renderer/sidebar/AgentPanel/{TaskInput,index}.tsx`, `src/renderer/sidebar/AgentPanel/__tests__/{TaskInput,AgentPanel}.test.tsx`, `e2e/task-suggestion.spec.ts`
  - **테스트**:
    - `src/renderer/sidebar/AgentPanel/__tests__/TaskInput.test.tsx` (신규) — 빈 입력 + 추천이면 placeholder 가 추천 문구 / 추천 null 이면 기존 placeholder / 입력 중이면 흐린 나머지 글자가 보인다 / Tab → onTaskChange(추천 전체), 기본 동작 막힘 / Shift+Tab·IME 조합 중 Tab·추천 없음 Tab → onTaskChange 안 부름 / 안내 줄 FR-5 두 문구 / 실행 중이면 추천 표시 없음
    - `src/renderer/sidebar/AgentPanel/__tests__/AgentPanel.test.tsx` — (기존 유지) + 새 탭 상태에서 입력창 placeholder 가 새 탭 추천 문구 + 마운트 때 추천 훅이 runs.list 를 1회 부른다. 기존 「열 때마다 기록 목록을 새로 읽는다」는 마운트 때 추천 훅이 부른 횟수를 기준으로 삼아 `[실행 기록]` 을 열 때마다 1회씩 늘어나는지 확인하도록 고친다 (주장 유지 — 기록을 열 때마다 새로 읽는다)
    - `e2e/task-suggestion.spec.ts` — 새 탭에서 입력창 placeholder = 새 탭 추천 → 입력창 포커스 후 Tab → 값이 그 문구, 실행되지 않음(대화에 말풍선 없음) / 로컬 픽스처 페이지로 이동하면 placeholder = `이 페이지 핵심만 3줄로 요약해줘` / `이 페이지` 입력 후 Tab → 값이 `이 페이지 핵심만 3줄로 요약해줘`
  - **실행**: `pnpm test src/renderer` (App·App.rounded 테스트 포함 renderer 전체 통과) + `make e2e SPEC=e2e/task-suggestion.spec.ts`
  - **검증**: `desktop/app-check` — 실제 앱에서 새 탭·일반 페이지 추천 표시, Tab 입력, 이어쓰기 흐린 글자 위치가 입력 글자 바로 뒤인지 스크린샷 확인. 콘솔·main 에러 0 + e2e 통과
  - **통과 기준**: 테스트 + 검증 통과, 기존 sidebar-chat·agent-mvp e2e 그대로 통과
  - **커밋**: `feat: 에이전트 입력창 흐린 추천 문구와 Tab 입력 (spec 019 Task 2)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
| 2026-11-13 | 1 | taskSuggestion 21 · useTaskSuggestion 5 · renderer 394 | 검증 반영 커밋 | 직접 방식. vitest.setup tabs.list·runs.list 기본 응답 |
| 2026-11-13 | 2 | TaskInput 12 · AgentPanel +2(기록 재조회 기준 조정) · task-suggestion e2e 2 | 검증 반영 커밋 | 실제 앱: 흐린 이어쓰기 위치·줄바꿈 확인 |
| 2026-11-13 | 검증 | make check 1859 · make e2e 61 · 에러 0 | 검증 반영 커밋 | |
