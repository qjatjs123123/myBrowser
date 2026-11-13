# Spec: Linux 최대화 깜빡임 줄이기 — 모니터별 최대화 bounds 기억

> **상태**: 🚧 진행중
> **생성일**: 2026-11-13
> **묶음**: 기반 (단일 묶음 — 직접 방식)
> **관련 spec**: 017
> **설계 참조**: docs/DESIGN.md §2 「창은 mac Chrome형 프레임」

---

## 1. 요구사항

### 배경 / 목적
사용자 (2026-11-13): "더블 클릭하면 한번 깜빡거리고 최대화 되냐" → "최대한 추천하는걸로 진행해라". spec 017 은 최대화마다 창 관리자 최대화(WSLg 에서 32px 밀린 모습) → 측정 → `unmaximize` → `setBounds` 를 거쳐 매번 깜빡인다. 같은 모니터의 작업 영역은 앱 실행 중 거의 바뀌지 않으므로 처음 잰 값을 기억해 두 번째부터는 바로 배치한다.
같이 나온 「WSLg 에서 둥근 모서리가 네모로 보임」은 Weston 이 프레임 없는 창 둘레에 사각 그림자를 그리기 때문이고(투명 모서리는 실측상 정상), WSLg 개발 환경 한정이라 이번 범위에서 바꾸지 않는다 (사용자: 추천안 = 그대로).

### 기능 요구사항 (Linux 만)
- **FR-1 (기억)**: 창 관리자 최대화 bounds 를 **측정으로** 얻으면(bounds 가 바뀐 경우) 그 창이 걸친 디스플레이 id 별로 기억한다. 측정 실패로 `workArea` 대체값을 쓴 경우는 기억하지 않는다. 기억은 앱 실행 동안만(메모리) — 다시 켜면 새로 잰다.
- **FR-2 (바로 배치)**: 최대화가 아닐 때 `toggle()` 하면, 지금 창이 걸친 디스플레이의 기억값이 있으면 `maximize()` 를 부르지 않고 직전 bounds 를 기억한 뒤 `setBounds(기억값)` → 최대화 상태 + `onChange({isMaximized:true})` 를 바로 한다. 기억값이 없으면 spec 017 그대로(측정 경로).
- **FR-3 (갱신)**: 외부 최대화(OS 단축키 등)로 측정 경로를 다시 타면 그 디스플레이의 기억값을 새 측정값으로 바꾼다.
- spec 017 의 복원·끌기 복원·변환 중 무시·이미 최대화 중 maximize 이벤트 동작은 그대로.

### 안전 요구사항
해당 없음 — 에이전트·가드·승인 흐름과 무관.

### 비기능 요구사항 / 제약
- IPC 계약 변경 없음. 디스플레이 id 는 main 이 `screen.getDisplayMatching(bounds).id` 로 구한다(주입).
- 모니터를 새로 연결·해제하거나 작업 표시줄을 바꾸면 그 실행 동안 기억값이 틀릴 수 있다 → `screen` 의 `display-metrics-changed`·`display-added`·`display-removed` 이벤트에서 기억을 모두 비운다.

### 범위 제외 (Out of Scope)
기억값 디스크 저장, WSLg 사각 그림자·둥근 모서리 처리, 처음 최대화의 깜빡임 제거.

---

## 2. 설계 개요

### 영향받는 프로세스 / 파일
- main:
  - `src/main/app/windowMaximize.ts` — 옵션에 `getDisplayId: (bounds: Rectangle) => number` 추가. 내부 `Map<number, Rectangle>` 기억. 측정 성공 시 `areaMap.set(getDisplayId(normal), bounds)`. `toggle()` 기억값 경로. `IBoundsMaximizer` 에 `forgetAreas(): void` (기억 비우기) 추가.
  - `src/main/index.ts` — `createLinuxFrame` 에서 `getDisplayId: (b) => screen.getDisplayMatching(b).id` 를 넘기고, `screen.on('display-metrics-changed' | 'display-added' | 'display-removed', maximizer.forgetAreas)`.
- 문서: `docs/DESIGN.md` §2 Linux 최대화 문장에 「모니터별 기억(실행 동안)」, `docs/TROUBLESHOOTING.md` spec 017 항목 아래 「둥근 모서리가 네모로 보임 = Weston 사각 그림자」.

### IPC 계약
변경 없음

### 도구 계약
변경 없음

### 데이터
변경 없음 (메모리만)

### 열린 질문
없음

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 **테스트와 검증이 모두 에러 0**이 될 때까지 수정 → 재실행을 반복하고, 전부 통과했을 때만 체크박스를 채우고 **Task 단위로 커밋**한 뒤 다음 Task 로 진행한다.
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**

- [ ] **Task 1: 모니터별 최대화 bounds 기억 + 조립 + 문서**
  - **묶음**: 기반
  - **작업**: FR-1~3, index.ts 조립(디스플레이 id·변경 이벤트), DESIGN·TROUBLESHOOTING 갱신
  - **파일**: `src/main/app/windowMaximize.ts`, `src/main/app/__tests__/windowMaximize.test.ts`, `src/main/index.ts`, `docs/DESIGN.md`, `docs/TROUBLESHOOTING.md`
  - **테스트**:
    - `src/main/app/__tests__/windowMaximize.test.ts` — (기존 유지, 대역에 getDisplayId 추가) 측정으로 최대화한 뒤 복원하고 다시 toggle 하면 maximize 0회 추가·바로 setBounds(측정값)·onChange(true) 즉시 / 다른 디스플레이 id 면 다시 maximize / workArea 대체값은 기억하지 않아 다음 toggle 도 maximize / 외부 maximize 로 다시 재면 기억값이 새 값으로 바뀐다 / forgetAreas 뒤 toggle 은 maximize / 기억값으로 최대화한 뒤 toggle 하면 직전 bounds 로 돌아간다
  - **실행**: `pnpm test src/main/app` + `make e2e SPEC=e2e/window-frame.spec.ts` (기존 흐름 회귀)
  - **검증**: `desktop/app-check` — WSLg 실창에서 더블클릭 최대화 → 복원 → 다시 더블클릭 최대화 때 창 관리자 maximize 를 거치지 않는다(최대화 시간이 짧고 X `_NET_WM_STATE` 가 비어 있음), 화면 픽셀로 (0,0) 배치 확인. `pnpm type-check` + 에러 0 + e2e 통과
  - **통과 기준**: 테스트 + 검증 통과, 전체 e2e 회귀 통과
  - **커밋**: `fix: Linux 최대화 크기를 모니터별로 기억해 깜빡임 줄이기 (spec 018 Task 1)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
