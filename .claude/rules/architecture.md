---
description: 전체 구조 지도 — src/ 아래 파일을 만들거나 수정하기 전에 먼저 읽는다 (프로세스 경계·import 허용 방향·폴더 책임)
paths:
  - "src/**"
  - "e2e/**"
---

# Architecture — 전체 지도 (Electron 단일 패키지)

구조의 **단일 출처**. 설계 배경은 `docs/DESIGN.md`. 규칙이 바뀌면 이 파일을 고친다. `@/` alias = `src/renderer/`, `@shared/` = `src/shared/`, `@main/` = `src/main/`.

## 1. 프로세스 4개와 의존 방향

```
renderer (React, 브라우저 샌드박스)  ──window.api(preload)──▶  main (Node, Electron)
        │                                                        │
        └──────────── shared (zod 스키마·타입·상수) ◀─────────────┘
                                   ▲
                               preload (contextBridge, 로직 없음)
```

| 프로세스 | 위치 | 책임 | import 허용 |
|---|---|---|---|
| **shared** | `src/shared/` | IPC 채널명·요청/응답 zod 스키마, 도구 입력 스키마, 공용 타입·상수. **순수 TS** | 아무 것도 import 하지 않는다 (zod 만) |
| **main** | `src/main/` | 창·탭·브라우저 제어·에이전트 루프·저장·IPC 핸들러 | `shared`, `electron`, `node:*`, 라이브러리 |
| **preload** | `src/preload/` | `contextBridge.exposeInMainWorld('api', …)` — 채널별 얇은 래퍼만 | `shared`, `electron` (ipcRenderer 만) |
| **renderer** | `src/renderer/` | 크롬(탭·주소창)·사이드바 UI | `shared`, `window.api`, React 생태계. **`electron`·`node:*` 금지** |

- renderer → main 은 **반드시 preload 의 `window.api` 를 거친다**. `ipcRenderer` 직접 노출 금지 (`rules/electron/preload.md`).
- main 은 DOM·React 를 모른다. renderer 는 파일·프로세스·CDP 를 모른다.
- ESLint `no-restricted-imports` 가 경계를 강제한다 (`eslint.config.mjs`).

## 2. main 의 모듈

```
src/main/
├── index.ts            앱 진입 — app.whenReady, 창 생성, IPC 등록, 단축키. 로직 없음
├── app/                창(BrowserWindow + 사이드바 View)·메뉴·프로필(userData)·단축키
├── tabs/               TabManager — WebContentsView 생성/전환/닫기/bounds, 탭 상태 이벤트
├── browser/            에이전트가 쓰는 브라우저 제어 — cdp.ts(playwright-core connectOverCDP), snapshot.ts(접근성 트리+ref), actions.ts(click/type/scroll …), overlay.ts(커서·하이라이트 주입)
├── agent/              loop.ts(toolRunner), tools/(도구 1개 = 파일 1개), guard.ts(결정적 안전 게이트), prompts/(시스템 프롬프트), fake/(가짜 모델 — e2e 용), runs.ts(상태 머신)
├── store/              node:sqlite — db.ts, migrations/{NNN}_{snake}.sql, repos/(runs, settings)
└── ipc/                registry.ts(채널 ↔ 핸들러 등록표), handlers/{모듈}.ts(safeParse → 모듈 호출 → ok/fail)
```

- **의존 방향**: `ipc → agent → browser → tabs`, `agent → store`, `app → tabs`. 역방향 금지 (tabs 가 agent 를 알지 않는다).
- **모듈 간 호출은 공개 함수/클래스로만**, 다른 모듈의 내부 파일 import 금지 (`agent/tools/click.ts` → `browser/actions.ts` ✅, `browser/cdp.ts` 내부 헬퍼 ❌).
- 상세: `rules/electron/main.md`, `rules/agent/tools.md`, `rules/agent/guard.md`.

## 3. renderer 의 구조

```
src/renderer/
├── main.tsx            React 루트 + Providers + <Toaster/>
├── App.tsx             레이아웃 조립 (Chrome + Sidebar)
├── chrome/             상단바·탭 영역 — BrowserChrome/(조립), TabBar/, AddressBar/, NavButtons/, NewTabPage/(시작 화면 — 북마크), HistoryPage/(방문 기록 전용 페이지), MoreMenuButton/(툴바 [메뉴] — 네이티브 팝업), FindBar/(페이지 내 찾기 줄), BookmarkButton/, ZoomBadge/(배율), AgentToggleButton/, WindowControls/(신호등), WindowResizeEdges/(Linux 창 가장자리 손잡이), SidebarResizer/(폭 손잡이)
├── sidebar/            에이전트 패널 — AgentPanel/(조립), SidebarHeader/, Conversation/(말풍선·에이전트 턴), Timeline/, RunResult/, ApprovalPanel/, QuestionCard/, ChoiceList/, AccountCard/, AppInfoFooter/, RunHistory/(지난 실행 기록), Settings/(설정 보기 — 스킬)
├── components/ui/      shadcn 부품 (CLI 생성, 규칙 예외)
├── components/shared/  두 영역 이상이 쓰는 복합 부품 (필요할 때만)
├── hooks/              IPC 구독·호출 훅 (useTabs, useAgentRun, useApproval …) — 컴포넌트는 IPC 를 직접 부르지 않는다
├── store/              zustand — UI 상태만 (사이드바 폭, 선택 탭 id). 서버 격인 main 상태는 복제하지 않고 이벤트로 받는다
├── lib/                toast.ts, api.ts(window.api 타입 래퍼), callSafely.ts(IPC 호출 throw → INTERNAL 봉투)
├── utils/              순수 함수 (errors.ts, formatStep.ts)
└── styles/globals.css  토큰
```

- **컴포넌트 = 폴더(`<PascalCase>/index.tsx`)**, 전용 하위 부품·훅·테스트는 같은 폴더 (`rules/renderer/react-convention.md`).
- **main 의 상태(탭 목록, run 상태)는 main 이 단일 출처** — renderer 는 `window.api.on*` 이벤트로 받아 훅의 state 로 들고, zustand 에 복제하지 않는다.

## 4. 새 기능 하나가 거치는 파일 (만드는 순서)

```
src/shared/ipc/{모듈}.ts                 채널명 + 요청/응답 스키마            (기반)
src/shared/tools/{도구}.ts               도구 입력 스키마 (에이전트 도구면)    (기반)
src/main/{모듈}/…                        로직 + __tests__/
src/main/agent/tools/{도구}.ts           도구 구현 + __tests__/ (로컬 HTML 픽스처)
src/main/agent/guard.ts                  가드 대상이면 패턴·규칙 추가 + 테스트
src/main/ipc/handlers/{모듈}.ts          핸들러 (safeParse → 호출) + registry 등록
src/preload/index.ts                     window.api 에 메서드 추가             (기반)
src/renderer/hooks/use{X}.ts             IPC 훅 + __tests__/
src/renderer/{chrome|sidebar}/{Name}/    컴포넌트 + __tests__/
e2e/{기능}.spec.ts                        실제 앱 흐름 고정
```

## 5. 테스트 위치

| 대상 | 도구 | 위치 |
|---|---|---|
| main 모듈·도구·가드 | vitest (node env) | 대상 옆 `__tests__/{name}.test.ts` |
| 브라우저 조작 | vitest + playwright-core (headless chromium) + `e2e/fixtures/pages/*.html` | `src/main/browser/__tests__/` (도구는 가짜 드라이버로 `src/main/agent/tools/__tests__/`) |
| renderer 컴포넌트·훅 | vitest (jsdom) + Testing Library, `window.api` 는 `vitest.setup.ts` 의 mock | 대상 옆 `__tests__/` |
| 전체 흐름 | Playwright `_electron` (가짜 모델 모드) | `e2e/*.spec.ts` |

실제 Claude API·외부 사이트를 부르는 테스트는 **어디에도 두지 않는다**.
