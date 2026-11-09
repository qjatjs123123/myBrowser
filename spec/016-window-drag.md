# Spec: 브라우저식 창 이동·더블클릭 최대화·가장자리 크기 조절 (Linux)

> **상태**: 📝 계획됨
> **생성일**: 2026-11-09
> **묶음**: 기반 (단일 묶음 — 직접 방식)
> **관련 spec**: 010, 014
> **설계 참조**: docs/DESIGN.md §2 「창은 mac Chrome형 프레임」

---

## 1. 요구사항

### 배경 / 목적
사용자: "화면 브라우저처럼 움직이고 더블클릭했을 때 화면 꽉차게" (2026-11-09). WSLg(Linux)에서는 맨 윗줄을 끌어도 창이 **움직이지 않는다**. spec 010 은 CSS `-webkit-app-region: drag` 에만 기댔는데, WSLg(XWayland)는 프레임 없는 Electron 창의 드래그 영역을 처리하지 않는다. 드래그 영역은 renderer 가 마우스 이벤트를 받지 못해 더블클릭도 잡을 수 없다(spec 010 범위 제외). 그래서 Linux 는 창 이동·최대화 토글·크기 조절을 앱이 직접 처리한다. 사용자가 고른 범위는 드래그 이동·더블클릭·최대화 중 끌기·가장자리 크기 조절이다.

### 기능 요구사항 (Linux 만 — macOS·Windows 는 OS 기본 동작이 되므로 지금 그대로 CSS 드래그 영역)
- **FR-1 (드래그 이동)**: 탭 줄(`window-top-bar`)의 빈 곳에서 누르고 3px 넘게 끌면 창이 커서를 따라 움직이고, 놓으면 멈춘다. 탭·[새 탭 열기]·신호등 버튼에서 시작한 누름은 지금처럼 클릭으로 동작하고 창을 옮기지 않는다.
- **FR-2 (더블클릭)**: 탭 줄 빈 곳을 더블클릭하면 최대화 ↔ 원래 크기가 바뀐다 (기존 `window:toggleMaximize`).
- **FR-3 (최대화 중 끌기)**: 최대화 상태에서 끌기 시작하면 창이 원래 크기(`getNormalBounds`)로 돌아온다. 이때 창 안에서 커서의 가로 위치 **비율**과 위쪽에서의 **세로 거리**를 유지해 커서 밑에 탭 줄이 오고, 이후 계속 커서를 따라 움직인다.
- **FR-4 (가장자리 크기 조절)**: 최대화가 아닐 때 창 네 변(두께 4px)과 네 모서리(10×10px)에 손잡이가 있고, 마우스를 올리면 방향에 맞는 커서(`ns-resize`·`ew-resize`·`nwse-resize`·`nesw-resize`)가 보인다. 끌면 그 변·모서리 방향으로 크기가 바뀌고 최소 크기(900×600)보다 작아지지 않는다. 왼쪽·위쪽 변을 줄이다 최소 크기에 닿으면 반대쪽 변은 고정된다. 최대화 중에는 손잡이가 없다.
- **FR-5 (탭 View 안쪽 여백)**: 탭 페이지 View(네이티브)가 renderer 의 이벤트를 가리므로, Linux 이고 최대화가 아닐 때는 탭 콘텐츠 영역을 창 왼쪽·아래 가장자리에서 4px 안쪽에 두고, 사이드바가 닫혀 있으면 오른쪽에도 4px 를 둔다. 최대화 중에는 여백이 없다.
- **FR-6 (Linux 탭 줄)**: Linux 탭 줄에는 `app-region: drag` 를 주지 않는다 (CSS 드래그 영역과 직접 처리가 겹치지 않게).

### 안전 요구사항
해당 없음 — 에이전트·가드·승인 흐름과 무관. 새 채널은 사이드바 renderer(preload 가 있는 유일한 webContents)만 부를 수 있고, 창 위치·크기만 바꾼다.

### 비기능 요구사항 / 제약
- 끄는 중의 `pointerMove` IPC 는 한 애니메이션 프레임(rAF)에 최대 1회만 보낸다.
- 좌표는 renderer `PointerEvent.screenX/screenY`(DIP)를 정수로 반올림해 보낸다. Electron `BrowserWindow` bounds 도 DIP 라 변환하지 않는다.
- 이동할 때는 `setBounds` 로 시작 크기를 함께 넘긴다 (`setPosition` 만 쓰면 배율 화면에서 크기가 조금씩 바뀌는 문제를 피한다).
- 보안 기본값·spec 014 둥근 창(투명 창) 옵션은 바꾸지 않는다.
- **요구사항 변경으로 바뀌는 기존 테스트**: `e2e/window-frame.spec.ts` 「맨 윗줄 빈 곳은 창 드래그 영역이고…」는 Linux 에서 탭 줄 `app-region` 이 `drag` 가 아니게 되므로(FR-6), 플랫폼별 기대값(Linux `none`, 그 외 `drag`)으로 바꾼다. 탭·버튼의 `no-drag` 단언과 사이드바 헤더 `none` 단언은 그대로 둔다.
- **위험**: WSLg 창 관리자가 `setBounds` 를 무시하면 이 방식도 동작하지 않는다 → 7단계 실창 확인에서 안 되면 멈추고 보고한다.

### 범위 제외 (Out of Scope)
화면 위 끝으로 끌어 최대화·좌우 반쪽 스냅, 툴바 줄·사이드바 헤더에서 끌기, macOS·Windows 동작 변경, 창 그림자.

---

## 2. 설계 개요

### 영향받는 프로세스 / 파일
- shared: `src/shared/ipc/window.ts` (요청 스키마), `channels.ts` (채널 3개), `api.ts` (`IApi.window` 3개)
- preload: `src/preload/index.ts`; mock: `vitest.setup.ts`
- main:
  - `src/main/app/windowPointer.ts` (신규) — 순수 계산 함수 `computeMovedBounds(origin, start, current)`, `computeResizedBounds(origin, edge, start, current, minSize)`, `computeRestoredBounds(maximized, normal, cursor)`, 세션 `createWindowPointerSession(window: TPointerWindow, minSize): IWindowPointerSession` (`start(request)`·`move(point)`·`end()`). `TPointerWindow = Pick<BrowserWindow, 'getBounds' | 'setBounds' | 'isMaximized' | 'unmaximize' | 'getNormalBounds'>` — 메서드는 부를 때마다 창에서 찾는다(e2e 대역).
  - `src/main/app/window.ts` — `WINDOW_MIN_SIZE = { width: 900, height: 600 }` export (`WINDOW_SIZE` 가 이 값을 씀)
  - `src/main/ipc/handlers/window.ts` — `createWindowHandlers(controls, pointer)` 에 3채널 추가 (safeParse → 실패 `INVALID_INPUT`)
  - `src/main/index.ts` — `createWindowPointerSession(window, WINDOW_MIN_SIZE)` 를 핸들러에 넘긴다
- renderer:
  - `src/renderer/hooks/useWindowPointer.ts` (신규) — `useWindowPointer({ onError }): { onPointerDown(kind, event) }`. pointerdown 에서 `setPointerCapture` 후 window pointermove/pointerup 을 듣는다. 3px 이상 움직이면 `pointerStart`(누른 지점 좌표), 이후 rAF 마다 마지막 좌표로 `pointerMove`, pointerup·pointercancel 이면(시작했을 때만) `pointerEnd`. 크기 조절(`kind !== 'move'`)은 임계 없이 바로 시작한다. 좌표는 `Math.round` 로 정수화. IPC 호출은 `callSafely(…, '창을 조작하지 못했습니다')` 로 감싸고, 실패 봉투면 `onError(error.message)` 를 같은 끌기에서 1회만 부른다 — toast 는 App 이 `onError` 안에서 부른다(훅은 toast 를 부르지 않는다). 더블클릭은 기존 `useWindowControls().toggleMaximize` 를 쓰고 실패하면 App 이 toast.
  - `src/renderer/chrome/TabBar/index.tsx` — prop `windowDrag?: { onPointerDown(event), onDoubleClick() }`. 주어지면 drag CSS 대신 bar 에 핸들러를 붙이고, 시작 지점이 `[role="tab"]`·`button` 안이면 무시한다. 없으면 지금 그대로 CSS drag.
  - `src/renderer/chrome/WindowResizeEdges/index.tsx` (신규) — 손잡이 8개(`aria-hidden`, `data-testid="window-resize-edge"`, `data-resize-edge="n|s|e|w|ne|nw|se|sw"`, absolute, z-50, 방향 커서). pointerdown 이면 `onPointerDown(edge, event)`.
  - `src/renderer/chrome/BrowserChrome/index.tsx` — prop `windowFrame?: { drag; hasEdgeInset: boolean }` 을 TabBar 에 넘기고, `hasEdgeInset` 이면 콘텐츠 줄에 `pl-1 pb-1` + 사이드바가 hidden 일 때 `pr-1` (`has-[>aside[hidden]]:pr-1`).
  - `src/renderer/App.tsx` — Linux(`isLinuxPlatform`, spec 014 의 `IS_ROUNDED_FRAME`)일 때만 `useWindowPointer` 를 연결하고, 최대화가 아니면 `WindowResizeEdges` 와 `hasEdgeInset` 을 켠다.
- e2e: `e2e/window-frame.spec.ts`
- 문서: `docs/DESIGN.md` §2, `.claude/skills/desktop/design/SKILL.md` §2, `spec/010-mac-frame.md` 범위 제외 문구 옆에 「→ spec 016 (Linux)」

### IPC 계약

| 채널 | 방향 | 요청 스키마 | 응답 |
|---|---|---|---|
| `window:pointerStart` | invoke | `WindowPointerStartRequestSchema` | `TIpcResult<null>` |
| `window:pointerMove` | invoke | `WindowPointerMoveRequestSchema` | `TIpcResult<null>` |
| `window:pointerEnd` | invoke | 없음 | `TIpcResult<null>` |

```ts
// src/shared/ipc/window.ts
/** 창 조작 종류 — 이동 또는 끄는 변·모서리 (spec 016) */
export const WindowPointerKindSchema = z.enum(['move', 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);
/** 화면 좌표(DIP, 정수) — 다중 모니터에서 음수일 수 있다 */
export const WindowPointerPointSchema = z.strictObject({ screenX: z.number().int(), screenY: z.number().int() });
/** [window:pointerStart] 누른 지점과 조작 종류 */
export const WindowPointerStartRequestSchema = WindowPointerPointSchema.extend({ kind: WindowPointerKindSchema });
/** [window:pointerMove] 지금 커서 위치 */
export const WindowPointerMoveRequestSchema = WindowPointerPointSchema;
export type TWindowPointerKind = z.infer<typeof WindowPointerKindSchema>;
export type TWindowPointerPoint = z.infer<typeof WindowPointerPointSchema>;
export type TWindowPointerStartRequest = z.infer<typeof WindowPointerStartRequestSchema>;
export type TWindowPointerMoveRequest = z.infer<typeof WindowPointerMoveRequestSchema>;
```
`WindowPointerPointSchema`·`WindowPointerKindSchema` 는 요청 스키마의 부품으로만 쓴다.
`IApi.window`: `pointerStart(req: TWindowPointerStartRequest)`, `pointerMove(req: TWindowPointerMoveRequest)`, `pointerEnd()` → 모두 `Promise<TIpcResult<null>>`.
`pointerMove`·`pointerEnd` 가 진행 중인 조작 없이 오면 아무것도 하지 않고 `ok(null)` 이다. `pointerStart` 가 다시 오면 이전 조작을 버리고 새로 시작한다.

### main 세션 동작
- `start({kind:'move'})`: 최대화 상태면 `computeRestoredBounds(getBounds(), getNormalBounds(), point)` → `unmaximize()` → `setBounds(restored)` 후 그 bounds 를 시작 bounds 로 둔다. 아니면 `getBounds()` 가 시작 bounds 다.
- `start({kind: 변·모서리})`: 최대화 상태면 무시한다(조작 없음). 아니면 `getBounds()` 를 시작 bounds 로 둔다.
- `move(point)`: move 면 `computeMovedBounds`, 변·모서리면 `computeResizedBounds` → `setBounds`.
- `computeRestoredBounds(max, normal, cursor)`: `ratio = (cursor.x - max.x) / max.width`, `x = round(cursor.x - ratio * normal.width)`, `y = cursor.y - (cursor.y - max.y)` = `max.y`, 크기 = normal 크기.
- `computeResizedBounds`: dx·dy 를 변에 따라 width/height 에 더하거나 빼고, `w`·`n` 이면 x·y 도 옮긴다. 최소 크기로 자를 때 `w`·`n` 은 오른쪽·아래 변을 고정한다(`x = origin.x + origin.width - width`).

### 도구 계약
변경 없음

### 데이터
변경 없음

### 열린 질문
없음 — 사용자 확인(2026-11-09): WSLg 에서 드래그가 안 됨, 범위 4개 모두 포함, 014 를 먼저 dev 에 합침.

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 **테스트와 검증이 모두 에러 0**이 될 때까지 수정 → 재실행을 반복하고, 전부 통과했을 때만 체크박스를 채우고 **Task 단위로 커밋**한 뒤 다음 Task 로 진행한다.
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**

- [ ] **Task 1: 창 포인터 IPC 계약 + main 세션**
  - **묶음**: 기반
  - **작업**: 스키마·채널·`IApi`·preload·`vitest.setup.ts` mock, `windowPointer.ts`(계산 함수 + 세션), `WINDOW_MIN_SIZE`, 핸들러 3채널, index.ts 조립
  - **파일**: `src/shared/ipc/{window,channels,api}.ts`, `src/preload/index.ts`, `vitest.setup.ts`, `src/main/app/{window,windowPointer}.ts`, `src/main/ipc/handlers/window.ts`, `src/main/index.ts`
  - **테스트**:
    - `src/shared/ipc/__tests__/window.test.ts` — (기존 유지) + 시작 요청 9종 kind 통과·소수/문자열/모르는 kind/남는 키 거부, 음수 좌표 통과
    - `src/main/app/__tests__/windowPointer.test.ts` — 이동: 시작 크기 유지하고 위치만 delta 만큼 / 8방향 크기 조절 각각의 bounds / `w`·`n` 최소 크기에서 오른쪽·아래 고정 / `e`·`s` 최소 크기 자름 / 복원: 커서 가로 비율·세로 거리 유지(예: max {0,0,1920,1080}, normal 1280×800, 커서 (960,10) → {x:320,y:0,1280,800}) / 세션: 시작 없이 move·end 는 setBounds 0회 / 최대화 중 move 시작이면 unmaximize 1회 + 복원 bounds / 최대화 중 변 시작은 무시 / end 뒤 move 무시 / 다시 start 하면 새 시작 bounds
    - `src/main/ipc/__tests__/window.test.ts` — (기존 유지) + 3채널이 세션 start·move·end 를 부르고 `ok(null)` / 잘못된 입력은 `INVALID_INPUT` 이고 세션을 부르지 않는다
  - **실행**: `pnpm test src/shared/ipc/__tests__/window.test.ts src/main/app/__tests__/windowPointer.test.ts src/main/ipc/__tests__/window.test.ts`
  - **검증**: `pnpm type-check` + 단위 테스트 + `make e2e SPEC=e2e/app-shell.spec.ts` (노출 키 변경 없음 확인)
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 창 포인터 이동·크기 조절 IPC 와 main 세션 (spec 016 Task 1)`

- [ ] **Task 2: renderer — 탭 줄 끌기·더블클릭, 가장자리 손잡이, 탭 View 여백**
  - **묶음**: 기반
  - **작업**: FR-1~6 renderer 쪽 — `useWindowPointer`, TabBar `windowDrag`, `WindowResizeEdges`, BrowserChrome `windowFrame`, App 조립
  - **파일**: `src/renderer/hooks/useWindowPointer.ts`, `src/renderer/chrome/TabBar/index.tsx`, `src/renderer/chrome/WindowResizeEdges/index.tsx`, `src/renderer/chrome/BrowserChrome/index.tsx`, `src/renderer/App.tsx`, `src/renderer/__tests__/{App,App.rounded}.test.tsx`, `e2e/window-frame.spec.ts`
  - **테스트**:
    - `src/renderer/hooks/__tests__/useWindowPointer.test.ts` — 3px 미만 이동 후 놓으면 IPC 0회 / 3px 넘으면 누른 지점으로 pointerStart 1회 → pointerMove(rAF) → 놓으면 pointerEnd 1회 / 크기 조절 kind 는 바로 pointerStart / screenX·screenY 가 소수(100.6, 50.4)면 반올림한 정수(101, 50)를 보낸다 / 실패 봉투면 onError 1회(같은 끌기에서 여러 번 실패해도 1회) / IPC 가 throw 해도 onError 1회
    - `src/renderer/chrome/TabBar/__tests__/TabBar.test.tsx` — (기존 유지) + `windowDrag` 가 있으면 빈 곳 pointerdown·dblclick 이 핸들러를 부르고 탭·버튼에서는 부르지 않는다 / `windowDrag` 가 있으면 drag CSS 클래스가 없다
    - `src/renderer/chrome/WindowResizeEdges/__tests__/WindowResizeEdges.test.tsx` — `getAllByTestId('window-resize-edge')` 8개, `data-resize-edge` 값으로 방향·커서 클래스 확인, pointerdown 이면 그 edge 로 콜백 (vitest·e2e 모두 손잡이는 `window-resize-edge` testid 로 찾고 e2e 는 `[data-resize-edge="se"]` 로 방향을 고른다)
    - `src/renderer/__tests__/App.rounded.test.tsx` — (기존 유지) + Linux·최대화 아님이면 손잡이 8개와 콘텐츠 여백, 최대화면 손잡이 0개·여백 없음
    - `src/renderer/__tests__/App.test.tsx` — (기존 유지) + 비 Linux(jsdom UA)면 손잡이 0개·콘텐츠 여백 없음
    - `e2e/window-frame.spec.ts` — (Linux) 탭 줄 빈 곳을 마우스로 끌면 main 창에 심은 `setBounds` 대역이 시작 bounds + 끈 거리만큼 받는다 / 빈 곳 더블클릭 → `maximize` 1회 / 탭을 끌어도 창 bounds 호출 0회 / 오른쪽 아래 손잡이를 끌면 width·height 가 끈 만큼 커진 setBounds / `emit('maximize')` 후 손잡이 0개, `unmaximize` 후 8개 / 탭 콘텐츠 영역 왼쪽이 창 왼쪽에서 4px. 기존 drag 영역 테스트는 위 「요구사항 변경」대로 수정
  - **실행**: `pnpm test src/renderer` + `make e2e SPEC=e2e/window-frame.spec.ts`
  - **검증**: `desktop/app-check` — WSLg 실창(`E2E_HEADED=1`)에서 탭 줄 끌기로 창 이동, 빈 곳 더블클릭으로 최대화·복원, 최대화 중 끌기로 복원 후 이동, 오른쪽 아래 모서리·왼쪽 변 끌기로 크기 조절을 확인하고 스크린샷을 남긴다. 콘솔·main 에러 0 + e2e 통과
  - **통과 기준**: 테스트 + 검증 통과, 기존 browser-chrome·sidebar-layout e2e 그대로 통과
  - **커밋**: `feat: Linux 탭 줄 끌기·더블클릭 최대화·가장자리 크기 조절 (spec 016 Task 2)`

- [ ] **Task 3: 설계·디자인 문서**
  - **묶음**: 기반
  - **작업**: DESIGN.md §2 창 서술(Linux 는 앱이 이동·크기 조절), design SKILL §2 드래그 영역 문단, spec 010 범위 제외 옆 「→ spec 016 (Linux)」
  - **파일**: `docs/DESIGN.md`, `.claude/skills/desktop/design/SKILL.md`, `spec/010-mac-frame.md`
  - **테스트**: 코드 변경 없음 — 전체 `make e2e` 회귀
  - **실행**: `make e2e`
  - **검증**: `pnpm type-check` + 전체 e2e
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `docs: Linux 창 이동·크기 조절 설계 반영 (spec 016 Task 3)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
