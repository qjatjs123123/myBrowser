# myBrowser — Claude 브라우저 에이전트 설계 (v2: Electron 단일 패키지)

> 작성 2026-11-05. 목표: 설치된 myBrowser 를 더블클릭하면 크롬처럼 브라우저가 뜨고, 사이드바에
> "오늘 저녁 7시 2명 강남 ○○ 예약해줘" 라고 쓰면 에이전트가 탭 안에서 직접 이동·읽기·입력·클릭을 하고
> **예약 확정 직전에 멈춰** 사용자 승인을 받는다. Next.js·FastAPI 는 쓰지 않는다.

## 1. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 브라우저 셸 | **Electron 33+** (Chromium 내장, `WebContentsView` 로 탭) | Chromium 그대로 + 탭/주소창/프로필을 우리가 그림. CEF·Chromium 포크는 과하고, Tauri 는 OS 웹뷰라 자동화 제어가 약함 |
| 언어·빌드 | TypeScript, **electron-vite**, pnpm | main/preload/renderer 3 번들을 한 설정으로 |
| 배포 | **electron-builder** → Windows `.exe`(NSIS)·macOS `.dmg`·Linux `.AppImage` | "클릭하면 켜지는" 설치형 앱 |
| UI (렌더러) | React 19 + Vite + Tailwind 4 + shadcn/ui, zustand | 크롬형 상단바(탭·뒤로/앞으로·주소창) + 오른쪽 에이전트 사이드바 |
| 에이전트 | **`@anthropic-ai/sdk`** `client.beta.messages.toolRunner` + `betaZodTool`, zod | 도구 루프를 SDK 가 돌리고, 턴별 훅으로 승인 게이트·로그 |
| 브라우저 제어 | **`playwright-core`** `chromium.connectOverCDP('http://127.0.0.1:9222')` (+ Electron `webContents` API) | 접근성 스냅샷(`ariaSnapshot`)·locator·click/type 을 그대로. Electron 은 `app.commandLine.appendSwitch('remote-debugging-port','9222')` 로 노출 |
| 저장 | **내장 `node:sqlite`** (`DatabaseSync` — runs/steps/히스토리), `electron-store` (설정), `safeStorage` (API 키 암호화) | 서버·DB 서비스 없이 로컬 완결. better-sqlite3 는 Electron ABI rebuild 가 vitest(Node)와 충돌해 바꿈 (spec 003) |
| 테스트 | vitest (unit) · Playwright `_electron.launch` (e2e) | 실제 앱을 띄워 에이전트 흐름 검증 |
| 품질 | eslint + prettier + tsc, husky 대신 `.claude` 훅 + `.githooks` | boilerplate 하네스 재사용 |

### 확정 버전 (spec 001, 2026-11-05)
Electron 45 · electron-vite 6 · Vite 8 · React 19.3 · Tailwind 4.3 · Zod 4 · vitest 5 + jsdom 30 · TypeScript 5.9 · ESLint 10 · Playwright 1.64 · **Node 22 (Volta pin, Electron 40+ 설치 요건)**. shadcn 은 쓰는 spec 에서 추가한다. spec 003: `@anthropic-ai/sdk` 1.5.0, `playwright-core` 1.64.1, SQLite 는 내장 `node:sqlite`.

## 2. 프로세스 구조

```
┌ main (Node) ──────────────────────────────────────────────────┐
│ app/        창 생성, 메뉴, 프로필(userData, 로그인 세션 영속)       │
│ tabs/       TabManager — WebContentsView 생성/전환/닫기, 네비게이션 │
│ browser/    cdp.ts(connectOverCDP) · snapshot.ts · actions.ts   │
│ agent/      loop.ts(toolRunner) · tools/ · guard.ts · prompts/  │
│ store/      sqlite(runs, steps, screenshots) · settings          │
│ ipc/        zod 로 검증된 IPC 핸들러 (렌더러 ↔ main)               │
└───────────────▲──────────────────────────────▲─────────────────┘
        preload (contextBridge, 타입 API)      CDP :9222
                │                                │
┌ renderer (React) ─────────────┐   ┌ WebContentsView (탭) ──────┐
│ chrome/  TabBar · AddressBar   │   │ 실제 웹페이지 (naver, catch)  │
│ sidebar/ AgentPanel · Timeline │   │ + 에이전트 커서 오버레이 주입   │
│          ApprovalModal · Ask   │   └────────────────────────────┘
└────────────────────────────────┘
```

- 에이전트 루프는 **main 프로세스**에서 돈다 (1차). 무거워지면 `utilityProcess` 로 분리.
- 렌더러는 Node 접근 금지(`contextIsolation: true`, `nodeIntegration: false`), 모든 통신은 preload 의 타입 API.
- 사이드바 UI 와 탭은 같은 창 안의 별도 View 라 사용자 조작과 에이전트 조작이 한 화면에서 보인다.

## 3. 에이전트 설계

### 모델·API
- `claude-opus-5-5`, 스트리밍, `output_config: { effort: "high" }`, thinking 은 기본(adaptive).
- `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`).
- 프롬프트 캐싱: 시스템 프롬프트 + 도구 목록 고정 prefix, 날짜·위치는 첫 user 메시지.
- 컨텍스트 편집 `clear_tool_uses_20250919` 로 오래된 스냅샷/스크린샷 제거.
- 스트리밍 + 클라이언트 도구 → `eager_input_streaming: true`, 파싱 결과는 zod 로 검증.

### 도구 (2층)
| 층 | 도구 | 구현 |
|---|---|---|
| 구조 도구 (기본) | `navigate`, `snapshot`(접근성 트리 + ref), `click(ref)`, `type(ref, text)`, `select`, `scroll`, `wait_for`, `back`, `tabs`, `read_text` | playwright-core locator/ariaSnapshot. 싸고 안정적 |
| 픽셀 도구 (폴백) | `computer_toolset_20260801` | 달력·지도처럼 트리로 못 잡는 UI. Phase 4 |
| 사람 개입 | `ask_user(question, options?)`, `request_approval(summary, action)` | 루프 pause → 사이드바 모달 → 답/승인 후 resume |

### 안전 게이트 (2중)
1. 프롬프트 규칙: 결제·예약 확정·주문·전송 전에 반드시 `request_approval`.
2. `guard.ts` 결정적 가드: `click` 대상 텍스트·URL 이 패턴(예약 확정, 결제, 주문, confirm, pay, checkout …)이면 모델 판단과 무관하게 pause. 기본 모드는 "최종 확정은 사용자가 직접 클릭".
3. 비밀번호·카드번호는 입력하지 않고 `ask_user` 로 사용자에게 넘긴다.

### 상태·기록
- run: `queued → running → waiting_user → running → stopped_before_confirm | done | failed`
- sqlite: `runs(id, task, status, usage)`, `steps(run_id, n, tool, input, result, screenshot_path)`
- 메시지 히스토리는 append-only (preserved thinking 호환, 재개 가능).

## 4. 디렉터리

```
myBrowser/
├── package.json · electron.vite.config.ts · electron-builder.yml · tsconfig.json
├── src/
│   ├── main/      app/ tabs/ browser/ agent/{loop.ts,tools/,guard.ts,prompts/} store/ ipc/
│   ├── preload/   index.ts (contextBridge)
│   ├── renderer/  chrome/ sidebar/ components/ui/ store/ lib/
│   └── shared/    ipc-schemas.ts(zod) · types.ts
├── e2e/           Playwright _electron
├── spec/          요청별 spec (하네스)
└── docs/          DESIGN.md · TROUBLESHOOTING.md
```

## 5. 로드맵

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| 0 | 레포 뼈대 + `.claude` 하네스 적용(§6) | `pnpm check`(lint·tsc·vitest) 통과, `pnpm dev` 로 빈 창 |
| 1 | 크롬형 브라우저: 탭·주소창·뒤로/앞으로·프로필 영속 — **구현 (spec 002, 2026-11-05)**: e2e 는 로컬 픽스처 쿠키로 재실행 영속 확인, 실제 네이버 로그인은 수동 확인 | 네이버 로그인 후 재실행해도 세션 유지 |
| 2 | CDP 연결 + 구조 도구 + 루프 MVP + 사이드바 타임라인 — **구현 (spec 003, 2026-11-05)**: 가드 규칙 1~4 포함(확정·결제는 승인 UI 전까지 run 정지), e2e 는 가짜 모델·로컬 픽스처. 실제 사이트 완료 기준은 수동 확인(API 비용) · 패키징 앱의 CDP 경로는 5단계 | "네이버에서 ○○ 검색해 전화번호 알려줘" 성공 |
| 3 | 예약 시나리오: 날짜·시간·인원 폼, ask/approval, 확정 직전 가드 | 확정 모달 직전 정지 100% |
| 4 | computer_toolset 폴백 + 커서 오버레이 | 달력 위젯 선택 성공 |
| 5 | electron-builder 패키징 + 평가 세트 | 설치 파일 더블클릭 실행, 회귀 측정 |

## 6. boilerplate `.claude` 적용 — 완료 (2026-11-05)

아래 표대로 적용했다. 결과 구조는 `.claude/README.md`, 규칙 지도는 `.claude/rules/architecture.md`. 추가로 만든 것: `rules/test-convention.md`, `skills/desktop/design`, `spec/README.md`(빈 색인), `Makefile`·`scripts/doctor.sh`·`.env.example`·`.github/workflows/ci.yml`.

### 적용 표 (원안)

| 가져온다 (수정) | 수정 내용 |
|---|---|
| `hooks/*` 전부 | 검사 범위 `backend frontend` → `src e2e`; 품질 게이트 명령 `pnpm lint && pnpm type-check && pnpm test`; `missing_setup` → `node_modules`·`.env`; DB 관련 줄 삭제 |
| `settings.json` | allow 에 `Bash(npx electron *)`, `Bash(pnpm *)`(기존) 유지; docker·alembic·uv 항목 삭제 |
| `skills/vibe-{setup,build,run,refactor}`, `COMMON.md`, `templates/spec-template.md` | backend/frontend 2영역 → 단일 영역(`spec/{NNN}-*.md`), 묶음 규칙은 `main`·`renderer`·`agent` 로 재정의 |
| `rules/frontend/{react-convention,naming-convention,javascript-convention,types-layer,store-layer}.md` | `rules/renderer/` 로 이동, axios·queries·services 층 삭제 |
| `skills/frontend/{zod-usage,error-toast,refactor,spec-create,spec-run,browser-check}` | 유지. browser-check 는 Playwright MCP 대신 `_electron` e2e 기준으로 |
| `agents/spec-reviewer.md` | 유지. `frontend-dev` → `desktop-dev` 로 이름·범위 변경 |
| 버린다 | `rules/backend/*`, `skills/backend/*`, `agents/{backend-dev,db-design-reviewer}`, `.mcp.json`(선택), 배포 파이프라인, `deploy/`, 사내 디자인 스킬·이미지·폰트 규칙 |
| 신규 | `rules/electron/{main,preload,ipc}.md`, `rules/agent/{tools,guard}.md`, `skills/frontend-design`(사이드바 디자인 기준 재작성) |

`CLAUDE.md`·`AGENTS.md`·`ARCHITECTURE.md` 는 위 스택·디렉터리 기준으로 새로 쓴다.

## 7. 리스크

- WSL2 에서 Electron 창은 WSLg 로 뜨지만 느리다 → 개발·실사용은 Windows 쪽, WSL/CI 는 xvfb.
- SQLite 는 내장 `node:sqlite` 라 네이티브 rebuild 가 없다 (로컬 Node 22 에서는 ExperimentalWarning 출력, Electron 45 의 Node 24 는 안정).
- 봇 차단·앱 전용 흐름은 `ask_user` 로 사용자에게 넘긴다.
- 비용: 스냅샷(텍스트) 위주, 스크린샷은 폴백. 컨텍스트 편집 필수.
