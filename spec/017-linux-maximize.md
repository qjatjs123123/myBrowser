# Spec: Linux 최대화를 모니터 작업 영역 (0,0) 에 직접 배치

> **상태**: 🚧 진행중
> **생성일**: 2026-11-13
> **묶음**: 기반 (단일 묶음 — 직접 방식)
> **관련 spec**: 014, 016
> **설계 참조**: docs/DESIGN.md §2 「창은 mac Chrome형 프레임」

---

## 1. 요구사항

### 배경 / 목적
사용자 (2026-11-13): "더블클릭해도 최대화 되긴하는데 모니터 전체 0,0 좌표에서 최대화가 안됨, 최대화 된 상태에서 다시 더블클릭하면 안줄어들음" → "모니터 기준으로 왼쪽 0,0 위치에서 최대화 하도록 해라".

실측 (WSLg, 모니터 3대):
- 창 관리자(WM) 최대화(`BrowserWindow.maximize()`) 상태에서는 X 창 bounds 가 맞는데도(예: `{1920,130,1920,1032}` = 모니터 작업 영역) **화면에는 내용이 약 32px 오른쪽·아래로 밀려 그려진다** (`_NET_FRAME_EXTENTS` 6,6,27,6). 프레임 없는 Electron 창이면 투명 여부와 무관 — 앱 밖 순수 Electron 창으로도 재현.
- 그래서 입력 좌표와 화면이 어긋나 사용자가 보이는 탭 줄을 누르면 renderer 에는 y≈40~57(주소창)로 들어온다 → 최대화 중 더블클릭 복원·끌기가 안 된다.
- 최대화가 아닌 창을 `setBounds(작업 영역)` 하면 모니터 (0,0) 에 정확히 그려진다. WSLg 는 Windows 작업 표시줄을 `display.workArea` 에 반영하지 않으므로(workArea = bounds) 작업 영역 크기는 WM 최대화로 한 번 측정한다 — 사용자 선택: 「WM 크기 측정 후 직접 배치」.

### 기능 요구사항 (Linux 만 — macOS·Windows 는 그대로 OS 최대화)
- **FR-1 (최대화 = 작업 영역 배치)**: 최대화하면 창은 WM 최대화 상태로 남지 않고, WM 이 정한 최대화 bounds(=그 모니터 작업 영역)로 `setBounds` 된 **일반 창**이 된다. 화면 내용이 모니터 작업 영역 왼쪽 위 (0,0) 에서 시작한다.
- **FR-2 (측정)**: 최대화 bounds 는 `maximize()` 뒤 창 bounds 가 바뀔 때까지 기다려 읽는다 (20ms 간격, 최대 500ms). 그동안 바뀌지 않으면 그 창이 걸친 디스플레이의 `workArea` 를 쓴다. 측정 뒤 `unmaximize()` → `setBounds(측정값)` 하고, WM 의 늦은 복원(unmaximize 뒤 ~80ms 에 예전 위치로 되돌림)에 대비해 200ms 뒤 bounds 가 다르면 1회 다시 적용한다. **최대화 상태 알림(`isMaximized:true`)은 이 재적용 확인이 끝나 변환이 끝날 때 보낸다** — 알림을 받은 뒤의 toggle 은 항상 복원으로 처리된다.
- **FR-3 (어떤 최대화든)**: 창의 `maximize` 이벤트가 오면(더블클릭·[창 최대화] 버튼·OS 단축키 모두) FR-1·2 로 바꾼다. 변환 중 들어온 `maximize`·`unmaximize` 이벤트·toggle 은 무시한다. 이미 앱 최대화 상태에서 `maximize` 이벤트가 오면(예: OS 단축키 — WM 은 일반 창으로 안다) 직전 bounds 는 그대로 두고 측정·배치만 다시 한다.
- **FR-4 (복원)**: 최대화 상태에서 탭 줄 빈 곳 더블클릭·[창 최대화] 버튼을 누르면 최대화 직전 bounds 로 `setBounds` 하고 최대화가 풀린다.
- **FR-5 (최대화 중 끌기)**: spec 016 FR-3 그대로 — 최대화 상태에서 끌기 시작하면 직전 bounds 크기로 돌아와 커서를 따른다. WM 최대화가 아니므로 `unmaximize()`·늦은 복원 재적용은 하지 않는다.
- **FR-6 (상태)**: Linux 의 `window:stateChanged.isMaximized`·둥근 모서리(spec 014)·가장자리 손잡이(spec 016)는 이 앱 최대화 상태를 따른다 (WM `maximize`/`unmaximize` 이벤트가 아니라). 전체 화면 이벤트 처리는 그대로.

### 안전 요구사항
해당 없음 — 에이전트·가드·승인 흐름과 무관. 창 위치·크기만 바꾼다.

### 비기능 요구사항 / 제약
- 처음 최대화할 때 WM 최대화가 잠깐(~50ms + 측정) 보였다 바로 바뀌는 깜빡임은 허용한다 (사용자 선택).
- IPC 계약 변경 없음 — 기존 `window:toggleMaximize`·`window:pointer*`·`window:stateChanged` 그대로.
- 보안 기본값·spec 014 투명 창 옵션은 바꾸지 않는다.
- **요구사항 변경으로 바뀌는 기존 테스트**: `e2e/window-frame.spec.ts` 의 「Linux 는 창 모서리가 둥글고 최대화하면 직각, 풀면 다시 둥글다 (spec 014)」·「최대화되면 가장자리 손잡이가 없어지고, 풀리면 8개가 돌아온다」는 `emit('unmaximize')` 로 풀었는데, Linux 는 이제 WM `unmaximize` 이벤트를 상태로 쓰지 않으므로(FR-6) **탭 줄 빈 곳 더블클릭(FR-4)으로 푸는** 것으로 바꾼다. `src/main/app/__tests__/windowPointer.test.ts` 의 「늦은 복원 재적용」 테스트들은 FR-5 로 없어지는 동작이라 「unmaximize 를 부르지 않고 최대화 상태만 푼다」로 바꾼다.
- **위험**: OS 단축키 등으로 WM 최대화가 된 뒤 이 변환이 실패하면 예전 증상이 남는다 → 7단계 실창 확인(픽셀)에서 본다.

### 범위 제외 (Out of Scope)
모니터별 측정값 캐시(깜빡임 제거), 화면 위 끝으로 끌어 최대화·반쪽 스냅, macOS·Windows 동작 변경, 전체 화면 동작 변경.

---

## 2. 설계 개요

### 영향받는 프로세스 / 파일
- main:
  - `src/main/app/windowMaximize.ts` (신규) — `createBoundsMaximizer(window: TMaximizeWindow, { onChange, getWorkArea, schedule? }): IBoundsMaximizer`.
    - `TMaximizeWindow = Pick<BrowserWindow, 'on' | 'getBounds' | 'setBounds' | 'getNormalBounds' | 'maximize' | 'unmaximize'>` — 메서드는 부를 때마다 창에서 찾는다(e2e 대역).
    - `IBoundsMaximizer`: `isMaximized(): boolean`, `getNormalBounds(): Rectangle` (최대화 중이면 직전 bounds, 아니면 지금 bounds), `toggle(): void`, `release(): void` (위치는 그대로 두고 최대화 상태만 푼다 — 끌기 복원용).
    - 상수 export: `MAXIMIZE_POLL_MS = 20`, `MAXIMIZE_MEASURE_LIMIT_MS = 500`, `RESTORE_SETTLE_MS = 200` (windowPointer.ts 에서 옮김).
    - 동작: `toggle()` — 변환 중이면 무시 / 최대화면 `setBounds(직전)` + `onChange({isMaximized:false})` / 아니면 직전 = `getBounds()` 기억 후 `maximize()`. `maximize` 이벤트 — 변환 중이면 무시, 아니면 변환 시작: 직전 = (이미 최대화 상태면 기존 직전) ?? 기억한 값 ?? `getNormalBounds()`, 기억한 값은 여기서 꺼내고 바로 비운다 → FR-2 측정 → `unmaximize()` → `setBounds(area)` → 200ms 뒤 다르면 재적용 → 변환 끝 + `onChange({isMaximized:true})`. `unmaximize` 이벤트는 구독하지 않는다.
  - `src/main/app/windowPointer.ts` — `createWindowPointerSession(window: TPointerWindow, frame: TPointerFrame, minSize)`. `TPointerWindow = Pick<BrowserWindow, 'getBounds' | 'setBounds'>`, `TPointerFrame = Pick<IBoundsMaximizer, 'isMaximized' | 'getNormalBounds' | 'release'>`. 최대화 중 move 시작이면 `computeRestoredBounds(getBounds(), frame.getNormalBounds(), point)` → `frame.release()` → `setBounds(restored)`. 늦은 복원 재적용(`once('unmaximize')`·`schedule`) 제거.
  - `src/main/app/window.ts` — `watchWindowState` 를 `watchMaximizeEvents(window, onChange)`(기존 maximize/unmaximize 처리) + `watchFullScreen(window, onChange, isMaximized)`(전체 화면, 풀 때 `isMaximized()` 로 판정)로 나눈다. `createNativeFrame(window): TPointerFrame` (`isMaximized`·`getNormalBounds`·`release = unmaximize`) — 비 Linux 용.
  - `src/main/index.ts` — Linux(`hasRoundedCorners`)면 `createBoundsMaximizer(window, { onChange: applyState, getWorkArea: (b) => screen.getDisplayMatching(b).workArea })` 를 만들어 `toggleMaximize`·포인터 세션·전체 화면·첫 로드 상태에 쓴다. 아니면 지금처럼 `watchMaximizeEvents` + `createNativeFrame`.
- e2e: `e2e/window-frame.spec.ts`
- 문서: `docs/DESIGN.md` §2 Linux 창 문단, `docs/TROUBLESHOOTING.md` (WSLg 최대화 32px 밀림)

### IPC 계약
변경 없음

### 도구 계약
변경 없음

### 데이터
변경 없음

### 열린 질문
없음 — 사용자 확인(2026-11-13): 모니터 작업 영역 (0,0) 배치, 크기는 WM 측정 후 직접 배치.

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 **테스트와 검증이 모두 에러 0**이 될 때까지 수정 → 재실행을 반복하고, 전부 통과했을 때만 체크박스를 채우고 **Task 단위로 커밋**한 뒤 다음 Task 로 진행한다.
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**

- [ ] **Task 1: main 작업 영역 최대화기 + 포인터 세션·창 상태 연결 + e2e**
  - **묶음**: 기반
  - **작업**: `windowMaximize.ts` 신규, `windowPointer.ts` frame 주입·재적용 제거, `window.ts` 상태 구독 분리·`createNativeFrame`, `index.ts` 조립. 같은 Task 에서 `emit('unmaximize')` 의존 e2e 2개를 더블클릭 복원으로 바꾸고 최대화 배치 e2e 를 더한다 (커밋마다 green)
  - **파일**: `src/main/app/{windowMaximize,windowPointer,window}.ts`, `src/main/index.ts`, `src/main/app/__tests__/{windowMaximize,windowPointer,window}.test.ts`, `e2e/window-frame.spec.ts`
  - **테스트**:
    - `src/main/app/__tests__/windowMaximize.test.ts` (가짜 창 + 주입 schedule) — toggle(일반) 이면 maximize 1회 / maximize 이벤트 뒤 bounds 가 바뀌면 그 bounds 로 unmaximize → setBounds / bounds 가 500ms 동안 안 바뀌면 getWorkArea(직전) 로 / 200ms 뒤 bounds 가 다르면 setBounds 1회 재적용, 같으면 0회 / onChange(true)·isMaximized true 는 200ms 확인 뒤에야 / 변환 중 maximize 이벤트·toggle 은 무시 / toggle(최대화) 이면 직전 bounds 로 setBounds + onChange(false) + maximize 0회 / 외부 maximize(toggle 없이)면 직전 = getNormalBounds() / 최대화 중 maximize 이벤트 → 다시 배치하고, 이어서 toggle 하면 처음 직전 bounds 로 setBounds / toggle 이 기억한 값은 변환 시작에 비워져 다음 외부 maximize 는 getNormalBounds() 를 쓴다 / release 는 setBounds 없이 onChange(false), getNormalBounds 는 최대화 중 직전·아니면 getBounds
    - `src/main/app/__tests__/windowPointer.test.ts` — (계산 함수·일반 세션 테스트 유지) 최대화 중 move 시작이면 frame.release 1회 + 복원 bounds setBounds / 최대화 중 변 시작은 무시 / 늦은 복원 재적용 테스트는 제거(요구사항 변경)
    - `src/main/app/__tests__/window.test.ts` — watchMaximizeEvents(기존 watchWindowState 테스트 이전) / watchFullScreen: 진입 true, 풀면 isMaximized() 값 / createNativeFrame: release → unmaximize
    - `e2e/window-frame.spec.ts` (Linux) — 새 테스트: `stubWindowBounds` 후 `emit('maximize')` → 루트 `square`·손잡이 0개를 기다린다(알림 = 변환 끝) → 기록된 마지막 setBounds 가 창이 걸친 디스플레이 `workArea` (xvfb 는 bounds 가 안 바뀌어 FR-2 대체 경로) → 탭 줄 빈 곳 더블클릭 → 마지막 setBounds 가 처음 bounds, `rounded`·손잡이 8개, maximize 호출 0회. 기존 spec 014 둥근 모서리·spec 016 손잡이 테스트는 `square` 를 기다린 뒤 더블클릭 복원으로 수정 (요구사항 변경)
  - **실행**: `pnpm test src/main/app` + `make e2e SPEC=e2e/window-frame.spec.ts`
  - **검증**: `desktop/app-check` — WSLg 실창에서 탭 줄 빈 곳 더블클릭 → Windows 화면 픽셀로 창 내용이 모니터 작업 영역 (0,0) 에서 시작, 다시 더블클릭 → 원래 bounds, 최대화 중 탭 줄 끌기 → 복원 후 이동. `pnpm type-check` + 콘솔·main 에러 0 + e2e 통과
  - **통과 기준**: 테스트 + 검증 통과, 전체 e2e 회귀 통과
  - **커밋**: `fix: Linux 최대화를 작업 영역 setBounds 로 배치 (spec 017 Task 1)`

- [ ] **Task 2: 설계·문제 해결 문서**
  - **묶음**: 기반
  - **작업**: DESIGN.md §2 Linux 창 문단에 「최대화 = 작업 영역 setBounds (WSLg WM 최대화 32px 밀림)」, TROUBLESHOOTING 항목
  - **파일**: `docs/DESIGN.md`, `docs/TROUBLESHOOTING.md`
  - **테스트**: 코드 변경 없음 — 전체 `make e2e` 회귀
  - **실행**: `make e2e`
  - **검증**: `pnpm type-check` + 전체 e2e
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `docs: Linux 최대화 배치 설계 반영 (spec 017 Task 2)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
