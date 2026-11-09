# Spec: 창 바깥 모서리 둥글게

> **상태**: ✅ 완료
> **생성일**: 2026-11-06
> **묶음**: 기반 (단일 묶음 — 직접 방식)
> **관련 spec**: 010, 011, 012
> **설계 참조**: docs/DESIGN.md §2 「창은 mac Chrome형 프레임」

---

## 1. 요구사항

### 배경 / 목적
사용자: "프레임 너무 직각이다. 살짝 레디우스 줘라" → 창 바깥 네 모서리 (사용자 선택 2026-11-06). spec 010 에서 Linux·Windows 는 `frame: false` 라 Linux 에서는 OS 가 모서리를 그리지 않아 직각이다. macOS(hiddenInset)·Windows 11(프레임 없는 창 기본 `roundedCorners: true`)은 OS 가 이미 둥글게 그린다.

### 기능 요구사항
- **FR-1**: Linux 에서 창 네 모서리가 반지름 **10px** 로 둥글다 — 크롬(탭 줄·툴바)·사이드바·탭 페이지 어느 것이 모서리에 닿아도 모서리 밖은 투명하다. 창 가장자리에 1px 테두리(`border` 토큰)로 배경과 구분한다(투명 창은 OS 그림자가 없을 수 있다).
- **FR-2**: 창이 **최대화·전체 화면**이면 모서리를 직각(0)으로, 되돌아오면 다시 10px.
- **FR-3**: macOS·Windows 는 지금과 같다 (창 옵션·화면 변화 없음 — OS 가 그린다).
- **FR-4**: 탭 페이지(WebContentsView)도 같은 반지름으로 깎는다(`setBorderRadius`) — View 는 네 모서리가 같이 깎이므로 툴바 아래 위쪽 두 모서리도 살짝 둥글어진다(카드처럼 보임, 의도된 결과). 최대화 시 0.

### 안전 요구사항
해당 없음 (에이전트·가드 무관).

### 비기능 요구사항 / 제약
- 렌더러는 명령형 DOM 조작 없이 — 루트 `<main>` 의 `data-window-frame` 속성과 CSS(`body:has(...)`)로만.
- 보안 기본값(webPreferences) 변경 없음.
- **요구사항 변경으로 바뀌는 기존 테스트**: `e2e/sidebar-layout.spec.ts` 다크 테스트가 `body` 배경색을 본다 — Linux 둥근 창에서는 body 가 투명해야 하므로 앱 루트(`main` "브라우징 영역") 배경색을 보도록 바꾼다 (같은 토큰 `oklch(0.21 0.006 285.9)`, 약화 아님). `src/main/app/__tests__/window.test.ts` 의 linux 창 옵션 기대값에 `transparent: true` 추가.
- 테두리는 레이아웃을 밀지 않게 `<main>` 의 `after:` 덧그림(absolute inset-0, pointer-events-none)으로 그린다 → `e2e/window-frame.spec.ts` 38행 `topBox.y === 0`·44행 `width === viewportWidth` 는 그대로 유지된다. 탭 View(네이티브)가 덮는 가장자리에는 테두리가 보이지 않는다(허용).
- **위험**: Electron 문서상 투명 창은 일부 플랫폼에서 크기 조절이 제한될 수 있다. app-check 에서 Linux(WSLg) 창 가장자리 크기 조절·드래그 이동·최대화 버튼을 확인하고, 안 되면 중단하고 사용자에게 보고한다(둥근 모서리 vs 크기 조절 결정).
  → **결과 (2026-11-09)**: WSLg 에서는 드래그 이동이 spec 014 이전(spec 010 의 CSS 드래그 영역)부터 동작하지 않았다. 사용자 결정으로 014 는 그대로 합치고, 드래그 이동·더블클릭 최대화·가장자리 크기 조절은 spec 016 에서 직접 구현한다.

### 범위 제외
Windows 10 이하 둥근 모서리, 창 그림자 직접 그리기, 반지름 설정 UI.

---

## 2. 설계 개요

### 영향받는 파일
- shared: `src/shared/ipc/window.ts`(신규 — 상태 이벤트 스키마), `channels.ts`(`window.stateChanged`), `api.ts`(`IApi.window.onStateChanged`)
- preload: `src/preload/index.ts`; `vitest.setup.ts` mock
- main: `src/main/app/window.ts`(linux 투명 창 옵션·`WINDOW_CORNER_RADIUS`·`hasRoundedCorners`·`watchWindowState`), `src/main/tabs/{tabType,electronTabView,tabManager}.ts`(`setBorderRadius` / `setCornerRadius`), `src/main/index.ts`(조립)
- renderer: `src/renderer/hooks/useWindowState.ts`, `src/renderer/utils/platform.ts`(`isLinuxPlatform`), `src/renderer/App.tsx`(루트 속성), `src/renderer/styles/globals.css`
- e2e: `e2e/window-frame.spec.ts`(추가 테스트), `e2e/sidebar-layout.spec.ts`(다크 확인 대상), `e2e/app-shell.spec.ts`(변경 없음 — `window` 키 이미 있음)

### IPC 계약
| 채널 | 방향 | 요청 | 이벤트 |
|---|---|---|---|
| `window:stateChanged` | main→renderer event | — | `WindowStateSchema` |

```ts
// src/shared/ipc/window.ts
/** [window:stateChanged] 창 상태 — 최대화 또는 전체 화면이면 isMaximized true (spec 014) */
export const WindowStateSchema = z.strictObject({ isMaximized: z.boolean() });
export type TWindowState = z.infer<typeof WindowStateSchema>;
```
`IApi.window.onStateChanged(cb: (state: TWindowState) => void): () => void` (해제 함수, 기존 `subscribe` 패턴). 보내는 쪽은 기존 `createSidebarEmitter`(스키마 parse 후 send). 렌더러가 늦게 붙어도 맞도록 main 은 renderer `did-finish-load` 때 현재 상태를 1회 보낸다.

### main
- `createFrameOptions('linux')` → `{ frame: false, transparent: true, backgroundColor: '#00000000' }`, win32 → `{ frame: false }` 그대로, darwin 그대로.
- `export const WINDOW_CORNER_RADIUS = 10;` `export function hasRoundedCorners(platform): boolean` (linux 만 true).
- `export function watchWindowState(window: Pick<BrowserWindow,'on'|'isMaximized'>, onChange: (state: TWindowState) => void): void` — `maximize`·`enter-full-screen` → true, `unmaximize` → false, `leave-full-screen` → `window.isMaximized()` (최대화한 창을 전체 화면 했다 풀어도 직각 유지). 이벤트 종류로 판정하므로 xvfb e2e 에서 `emit('maximize')` 로 확인할 수 있다.
- `ITabView.setBorderRadius(radius: number): void` (electronTabView → `view.setBorderRadius`). `TabManager.setCornerRadius(radius)` — 저장 후 기존 View 전부 적용, 이후 만드는 탭에도 적용.
- `index.ts`: `hasRoundedCorners(process.platform)` 이면 `tabManager.setCornerRadius(WINDOW_CORNER_RADIUS)`, `watchWindowState(window, (state) => { emit window:stateChanged; tabManager.setCornerRadius(state.isMaximized ? 0 : WINDOW_CORNER_RADIUS) })`, `did-finish-load` 때 현재 상태(`isMaximized() || isFullScreen()`) emit. linux 가 아니어도 이벤트는 보낸다(렌더러가 쓰지 않을 뿐).

### renderer
- `useWindowState()` → `{ isMaximized }` (기본 false, `onStateChanged` 구독·해제).
- `isLinuxPlatform(userAgent)` — `/Linux/` 이고 Android 아님.
- `App.tsx` 루트 `<main data-window-frame={IS_ROUNDED ? (isMaximized ? 'square' : 'rounded') : undefined}>` — `IS_ROUNDED = isLinuxPlatform(navigator.userAgent)`.
- `<main>` 은 플랫폼과 무관하게 **항상** `bg-background` 클래스를 갖는다. 반지름·overflow·테두리는 Tailwind data 변형 클래스로: `relative data-[window-frame=rounded]:overflow-hidden data-[window-frame=rounded]:rounded-[var(--window-radius)]` + `after:` 덧그림(`pointer-events-none absolute inset-0 z-50 rounded-[inherit] border border-border`, rounded 일 때만) — 길면 상수로 묶는다.
- `globals.css` 에는 토큰 `--window-radius: 10px`(main `WINDOW_CORNER_RADIUS` 와 주석으로 짝) 와 body 규칙 옆 `body:has([data-window-frame]) { background: transparent; }` 한 줄만.

### 도구 계약 / 데이터
변경 없음.

### 열린 질문
없음.

---

## 3. 작업 순서 (Tasks)

> ⚠️ 게이트 규칙·vibe-build 우선 규칙은 템플릿과 같다 (`.claude/templates/spec-template.md`).

- [x] **Task 1: 창 상태 IPC 계약·preload·mock**
  - **묶음**: 기반
  - **작업**: `src/shared/ipc/window.ts`, `channels.ts` `window.stateChanged`, `api.ts`, `preload`, `vitest.setup.ts` mock(`window.onStateChanged` 해제 함수 반환).
  - **테스트**: `src/shared/ipc/__tests__/window.test.ts` — strict(여분 키 거부)·boolean 아님 거부.
  - **실행**: `pnpm test src/shared`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 창 상태 이벤트 계약 (spec 014 Task 1)`

- [x] **Task 2: main — linux 투명 창·창 상태 감시·탭 View 반지름**
  - **묶음**: 기반
  - **작업**: 위 「main」 전부 (index.ts 조립 포함).
  - **테스트**: `src/main/app/__tests__/window.test.ts`(linux 옵션 `transparent`·`backgroundColor`, win32·darwin 그대로, `hasRoundedCorners`, `watchWindowState` 4이벤트 → true/false), `src/main/tabs/__tests__/tabManager.test.ts`(`setCornerRadius` 가 기존·새 View 에 적용), `watchWindowState` 에 '최대화 상태에서 leave-full-screen 이면 true'.
  - **실행**: `pnpm test src/main/app src/main/tabs`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: linux 투명 창과 창 상태 감시·탭 반지름 (spec 014 Task 2)`

- [x] **Task 3: renderer — 둥근 루트 + e2e**
  - **묶음**: 기반
  - **작업**: 위 「renderer」 전부, e2e 2곳, `docs/DESIGN.md` §2 프레임 줄에 "Linux 는 `transparent: true` + renderer 둥근 루트·탭 View 반지름, 최대화 시 직각 (spec 014)" 추가.
  - **테스트**: `hooks/__tests__/useWindowState.test.ts`(구독·갱신·해제), `utils/__tests__/platform.test.ts`(`isLinuxPlatform`), `__tests__/App.rounded.test.tsx`(`vi.mock('@/utils/platform')` 로 `isLinuxPlatform` 을 true 로 고정 → `data-window-frame="rounded"`, 상태 이벤트 isMaximized → `square`; 기존 `App.test.tsx` 는 mock 없이 속성이 없는 경우를 확인). e2e `e2e/window-frame.spec.ts` — linux 에서 루트 `border-radius` 10px·body 배경 투명 → `app.evaluate` 로 메인 창 `emit('maximize')` → 0px → `emit('unmaximize')` → 10px (linux 가 아니면 skip 사유 명시). `e2e/sidebar-layout.spec.ts` 다크 확인 대상을 `main` 으로.
  - **실행**: `pnpm test src/renderer` 후 `make e2e SPEC=e2e/window-frame.spec.ts`
  - **검증**: `desktop/app-check` — 앱 실행 → 모서리 둥긂(스크린샷), 최대화 이벤트 → 직각, 콘솔·main 에러 0, **WSLg 실제 창에서 가장자리 크기 조절·드래그 이동·최대화 버튼 동작**(안 되면 중단·보고)
  - **통과 기준**: 새 e2e + 기존 e2e 전부 통과
  - **커밋**: `design: 창 바깥 모서리 둥글게 (spec 014 Task 3)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
| 2026-11-06 | 1~3 | make check · make e2e 51 | 91f21e8 | 직접 방식 — WSLg 실창 확인 대기로 멈춤 |
| 2026-11-09 | 검증 | dev(015) 합친 뒤 make check 1742 · make e2e 52 · 에러 0 | 검증 반영 커밋 | 창 드래그·크기 조절은 spec 016 으로 넘김 (사용자 결정) |
