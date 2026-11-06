# Spec: mac 브라우저 프레임 — 신호등·탭 줄 통합 + 질문 카드 보내기 아이콘

> **상태**: ✅ 완료
> **생성일**: 2026-11-06
> **묶음**: 기반
> **관련 spec**: 002, 009
> **설계 참조**: docs/DESIGN.md §2 (창·프로세스 구조), `.claude/skills/desktop/design` §1·§2

---

## 1. 요구사항

### 배경 / 목적
지금 창은 OS 제목 표시줄(Linux: `myBrowser _ □ X`) 아래에 탭 줄·주소창이 있다. 사용자는 **mac Chrome 처럼** 창 맨 윗줄에 신호등(●●●)과 탭이 함께 있는 프레임을 원한다. 질문 카드의 [보내기] 글자 버튼도 입력창과 같은 원형 보내기 아이콘으로 바꾼다 (사용자 결정 2026-11-06).

### 기능 요구사항
- **FR-1 (프레임 없음)**: Linux·Windows 는 OS 제목 표시줄 없이(`frame: false`) 뜬다. macOS 는 `titleBarStyle: 'hiddenInset'` + 네이티브 신호등 위치를 탭 줄 높이에 맞춘다(`trafficLightPosition`).
- **FR-2 (맨 윗줄)**: 창 맨 윗줄(36px) = 왼쪽 창 버튼 자리 + 탭들 + [새 탭 열기]. 둘째 줄 = ◀ ▶ ⟳ + 주소창 (지금 그대로). 오른쪽 사이드바 헤더(제목·상태 배지·[새 대화])도 같은 36px 줄 높이·같은 배경(`bg-muted`)으로 맞춰 윗줄이 창 전체 폭으로 이어져 보인다.
- **FR-3 (창 버튼 — Linux·Windows)**: 탭 줄 왼쪽에 mac 신호등 모양 버튼 3개를 직접 그린다 — 순서 닫기(빨강)·최소화(노랑)·최대화(초록), 12px 원, 버튼 묶음에 마우스를 올리면 ×·−·+ 기호가 보인다. 접근 이름 `창 닫기`·`창 최소화`·`창 최대화`. 누르면 각각 `window:close`·`window:minimize`·`window:toggleMaximize` (최대화 상태면 원래 크기로).
- **FR-4 (창 버튼 — macOS)**: 직접 그리지 않고 네이티브 신호등이 들어갈 빈 자리(72px)만 둔다. 플랫폼 판정은 renderer 의 `navigator.userAgent` 로 한다 (IPC 추가 없음).
- **FR-5 (창 이동)**: 맨 윗줄의 빈 곳(탭·버튼이 아닌 곳)과 사이드바 헤더의 빈 곳을 끌면 창이 움직인다 (`app-region: drag`). 탭·버튼·배지는 `no-drag` 라 클릭이 그대로 된다.
- **FR-6 (질문 카드 보내기 아이콘)**: 질문 카드의 자유 입력 [보내기] 글자 버튼을 원형 아이콘 버튼(위쪽 화살표, `--brand`)으로 바꾼다. 접근 이름은 `보내기` 그대로, 비활성 조건 그대로.

### 안전 요구사항
해당 없음 — 에이전트·가드·승인 흐름은 바뀌지 않는다. 창 버튼은 사이드바 renderer 만 부를 수 있고(preload), 탭 페이지에는 preload 가 없다(보안 기본값 유지).

### 비기능 요구사항 / 제약
- 보안 기본값(`contextIsolation`·`sandbox`·`nodeIntegration: false`·`webSecurity`)은 그대로.
- 신호등 색은 토큰(`--traffic-close`·`--traffic-minimize`·`--traffic-maximize`, 기호색 `--traffic-glyph`)으로만.
- 탭 콘텐츠 영역 bounds 계산(`useContentBounds`)은 그대로 동작해야 한다 — 윗줄 높이가 바뀌어도 탭 View 가 툴바를 가리지 않는다.

### 범위 제외 (Out of Scope)
- 창 가장자리 리사이즈 핸들 직접 구현(Electron 기본 동작에 맡김), 탭 줄 더블클릭 최대화(드래그 영역은 renderer 가 클릭을 받지 못함 — OS 기본 동작에 맡김), 전체화면 버튼, Windows 의 스냅 레이아웃.

---

## 2. 설계 개요

### 영향받는 프로세스 / 파일
- shared: `src/shared/ipc/channels.ts` (`window` 모듈), `src/shared/ipc/api.ts` (`IApi.window`)
- main: `src/main/app/window.ts` — `createWindowControls(window: Pick<BrowserWindow, 'minimize' | 'maximize' | 'unmaximize' | 'isMaximized' | 'close'>): IWindowControls` (최대화 토글 분기는 여기 — index.ts 는 조립만), `createWindowOptions(preloadPath, platform)`: darwin → `titleBarStyle: 'hiddenInset'`, `trafficLightPosition: { x: 14, y: 12 }`; 그 외 → `frame: false`. `createMainWindow` 는 `process.platform` 을 넘긴다.
- main: `src/main/ipc/handlers/window.ts` (신규) — `createWindowHandlers(controls: IWindowControls)` (`minimize`·`toggleMaximize`·`close`), `src/main/index.ts` 는 `createWindowControls(window)` 를 `createWindowHandlers` 에 넘겨 `registerIpc` 에 추가만 한다.
- preload: `src/preload/index.ts` — `window: { minimize, toggleMaximize, close }`.
- renderer: `src/renderer/hooks/useWindowControls.ts` (신규, IPC 래퍼), `src/renderer/utils/platform.ts` (신규, `isMacPlatform(userAgent)`), `src/renderer/chrome/WindowControls/index.tsx` (신규), `src/renderer/chrome/TabBar/index.tsx`(왼쪽 slot + 드래그 영역), `src/renderer/chrome/BrowserChrome/index.tsx`(조립), `src/renderer/sidebar/SidebarHeader/index.tsx`(높이·배경·드래그), `src/renderer/sidebar/QuestionCard/index.tsx`(FR-6), `src/renderer/styles/globals.css`(신호등 토큰), `vitest.setup.ts`(window mock).
- e2e: `e2e/app-shell.spec.ts`(노출 키에 `window` 추가), `e2e/window-frame.spec.ts`(신규).
- 문서: `.claude/skills/desktop/design/SKILL.md` §1·§2, `docs/DESIGN.md` §2 창 서술.

### IPC 계약

| 채널 | 방향 | 요청 스키마 | 응답/이벤트 스키마 |
|---|---|---|---|
| `window:minimize` | invoke | 없음 | `TIpcResult<null>` |
| `window:toggleMaximize` | invoke | 없음 | `TIpcResult<null>` — 최대화 상태면 원래 크기, 아니면 최대화 |
| `window:close` | invoke | 없음 | `TIpcResult<null>` — 창을 닫는다(창 하나라 앱 종료) |

요청 인자가 없으므로 검증할 입력이 없다 (`app:getInfo` 와 같은 형태). 핸들러는 controls 호출 → `ok(null)`, controls 가 throw 하면 registry 가 INTERNAL 로 감싼다.

### 도구 계약
변경 없음

### 데이터
변경 없음

### 열린 질문
없음 — 사용자 확인(2026-11-06): mac Chrome형, mac 은 네이티브 신호등·그 외는 직접 그림.

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 **테스트와 검증이 모두 에러 0**이 될 때까지 수정 → 재실행을 반복하고, 전부 통과했을 때만 체크박스를 채우고 **Task 단위로 커밋**한 뒤 다음 Task 로 진행한다.
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**

- [x] **Task 1: 창 제어 IPC + 프레임 없는 창 옵션**
  - **묶음**: 기반
  - **작업**: `window` 채널 3개·`IApi.window`·preload·핸들러·registry 연결, `createWindowOptions` 플랫폼별 프레임, `vitest.setup.ts` 의 `window.api.window` mock, app-shell e2e 노출 키 갱신
  - **파일**: `src/shared/ipc/channels.ts`, `src/shared/ipc/api.ts`, `src/preload/index.ts`, `src/main/ipc/handlers/window.ts`, `src/main/index.ts`, `src/main/app/window.ts`, `src/main/app/__tests__/window.test.ts`, `vitest.setup.ts`, `e2e/app-shell.spec.ts`
  - **테스트**:
    - `src/main/ipc/__tests__/window.test.ts` — 세 채널이 각각 controls 의 minimize·toggleMaximize·close 를 1회 부르고 `{ ok: true, data: null }` / registry 로 등록했을 때 controls 가 throw 하면 INTERNAL 봉투
    - `src/main/app/__tests__/window.test.ts` — (기존 유지, 인자 1개 호출 2곳은 `platform` 인자를 받도록 고친다) + 최대화 상태면 unmaximize, 아니면 maximize 를 1회 부른다 / minimize·close 는 같은 이름의 메서드를 부른다 / linux·win32 는 `frame: false` / darwin 은 `titleBarStyle: 'hiddenInset'`·`trafficLightPosition` 이고 `frame` 미지정 / 모든 플랫폼에서 보안 기본값 그대로
    - `e2e/app-shell.spec.ts` — 노출 키 `['app','tabs','shortcut','agent','account','window']`, 테스트 이름의 모듈 목록에도 `window` 추가 (요구사항 변경 — 새 모듈 추가)
  - **실행**: `pnpm test src/main/ipc/__tests__/window.test.ts src/main/app/__tests__/window.test.ts` + `make e2e SPEC=e2e/app-shell.spec.ts`
  - **검증**: `pnpm type-check` + 단위 테스트 + 위 e2e
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 프레임 없는 창과 창 제어 IPC (spec 010 Task 1)`

- [x] **Task 2: 신호등 버튼 + 맨 윗줄 통합**
  - **묶음**: 기반
  - **작업**: `useWindowControls`·`isMacPlatform`·`WindowControls`, TabBar 왼쪽 slot·드래그 영역, SidebarHeader 36px·`bg-muted`·드래그, 신호등 토큰 (FR-2~5)
  - **파일**: `src/renderer/hooks/useWindowControls.ts`, `src/renderer/utils/platform.ts`, `src/renderer/chrome/WindowControls/index.tsx`, `src/renderer/chrome/TabBar/index.tsx`, `src/renderer/chrome/BrowserChrome/index.tsx`, `src/renderer/sidebar/SidebarHeader/index.tsx`, `src/renderer/styles/globals.css`, `e2e/window-frame.spec.ts`
  - **테스트**:
    - `src/renderer/utils/__tests__/platform.test.ts` — Mac userAgent → true / Linux·Windows → false
    - `src/renderer/hooks/__tests__/useWindowControls.test.ts` — 각 함수가 `window.api.window.*` 를 부르고 봉투를 돌려준다 / IPC 가 throw 하면 INTERNAL 봉투
    - `src/renderer/chrome/WindowControls/__tests__/WindowControls.test.tsx` — 비 mac: 버튼 3개 순서(창 닫기·창 최소화·창 최대화), 누르면 해당 함수 1회 / mac: 버튼 없이 자리만(버튼 0개) / 실패 봉투면 toast
    - `src/renderer/chrome/TabBar/__tests__/TabBar.test.tsx` — (기존 유지) + 왼쪽 slot 렌더
    - `e2e/window-frame.spec.ts` — 맨 윗줄에 `창 닫기`·`창 최소화`·`창 최대화` 버튼이 보이고 탭 목록과 같은 줄(y 범위 겹침) / [창 최대화]·[창 최소화] 를 누르면 `app.evaluate` 로 main 창 인스턴스에 심은 대역이 `maximize`·`minimize` 를 1회 받는다 (preload→IPC→main 실제 경로. xvfb 에는 창 관리자가 없어 실제 최대화 상태는 바뀌지 않으므로 화면 확인은 app-check 가, 토글 분기는 Task 1 단위 테스트가 맡는다) / 맨 윗줄 빈 곳과 사이드바 헤더 빈 곳의 계산된 `app-region`(또는 `-webkit-app-region`)이 `drag`, 탭·[새 탭 열기]·창 버튼 3개·[새 대화]·상태 배지는 `no-drag` / 탭 콘텐츠 영역이 툴바 아래에서 시작(기존 bounds 계약) / 사이드바 헤더와 탭 줄 높이 같음
  - **실행**: `pnpm test src/renderer` + `make e2e SPEC=e2e/window-frame.spec.ts`
  - **검증**: `desktop/app-check` — 앱을 화면(WSLg, `E2E_HEADED=1`)에 띄워 신호등·탭 줄·사이드바 헤더가 한 줄인지 스크린샷, 실제 최대화·복원 확인, 콘솔·main 에러 0 + e2e 통과
  - **통과 기준**: 테스트 + 검증 통과, 기존 browser-chrome e2e(탭·주소창·단축키) 그대로 통과
  - **커밋**: `design: mac 브라우저 프레임 — 신호등·탭 줄 통합 (spec 010 Task 2)`

- [x] **Task 3: 질문 카드 보내기 아이콘**
  - **묶음**: 기반
  - **작업**: FR-6
  - **파일**: `src/renderer/sidebar/QuestionCard/index.tsx`
  - **테스트**: `src/renderer/sidebar/QuestionCard/__tests__/QuestionCard.test.tsx` — (기존 유지, 단 「선택지가 없으면 [보내기] 만 있다」의 `textContent` 단언은 아이콘 버튼이라 글자가 없으므로 접근 이름 기준(버튼 1개, 이름 `보내기`)으로 교체 — 요구사항 변경 FR-6)
  - **실행**: `pnpm test src/renderer/sidebar/QuestionCard` + `make e2e SPEC=e2e/agent-approval.spec.ts`
  - **검증**: `desktop/app-check` — 가짜 모델 `ask-user` 로 질문 카드 → 자유 입력 후 보내기 아이콘으로 답 → 완료, 콘솔·main 에러 0
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `design: 질문 카드 보내기를 아이콘으로 (spec 010 Task 3)`

- [x] **Task 4: 디자인·설계 문서 갱신**
  - **묶음**: 기반
  - **작업**: design SKILL §1 그림·§2 크롬 원칙(프레임 없음·신호등·드래그 영역), DESIGN.md §2 창 서술
  - **파일**: `.claude/skills/desktop/design/SKILL.md`, `docs/DESIGN.md`
  - **테스트**: 코드 변경 없음 — 전체 `make e2e` 회귀
  - **실행**: `make e2e`
  - **검증**: `pnpm type-check` + 전체 e2e
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `docs: mac 프레임 디자인 기준 반영 (spec 010 Task 4)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
| 2026-11-06 | 1 | window 핸들러 4 · createWindowOptions/Controls 11 · app-shell e2e 2 | 검증 반영 커밋 | 직접 방식 |
| 2026-11-06 | 2 | platform 3 · useWindowControls 4 · WindowControls 6 · TabBar +1 · window-frame e2e 4 | 검증 반영 커밋 | 실제 최대화·복원은 화면(E2E_HEADED=1, WSLg)에서 확인 |
| 2026-11-06 | 3 | QuestionCard 10 · agent-approval e2e | 검증 반영 커밋 | |
| 2026-11-06 | 4 | 문서만 | 검증 반영 커밋 | |
| 2026-11-06 | 검증 | make check 1421 · make e2e 39 · 에러 0 | 검증 반영 커밋 | 바퀴 1 vitest 5s 타임아웃 2건은 부하(load 14) — 단독 재실행 통과 |
