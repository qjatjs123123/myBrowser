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
| UI (렌더러) | React 19 + Vite + Tailwind 4 + shadcn/ui, zustand | 크롬형 상단바(탭·뒤로/앞으로·주소창) + 오른쪽 에이전트 사이드바(대화형 — 할 일 말풍선·에이전트 턴, Enter 실행, spec 009) |
| 에이전트 | **`@anthropic-ai/sdk`** `client.beta.messages.toolRunner` + `betaZodTool`, zod | 도구 루프를 SDK 가 돌리고, 턴별 훅으로 승인 게이트·로그 |
| 브라우저 제어 | **`playwright-core`** `chromium.connectOverCDP('http://127.0.0.1:9222')` (+ Electron `webContents` API) | 접근성 스냅샷(`ariaSnapshot`)·locator·click/type 을 그대로. Electron 은 `app.commandLine.appendSwitch('remote-debugging-port','9222')` 로 노출 |
| 저장 | **내장 `node:sqlite`** (`DatabaseSync` — runs/steps/히스토리), `electron-store` (설정), `safeStorage` (구독 **기기 토큰** 암호화 — spec 005, 사용자 API 키는 받지 않는다) |
| 과금·모델 경유 (설치판) | **게이트웨이 서버** — 별도 레포 `mybrowser-gateway`(FastAPI·Postgres·토스페이먼츠). 진짜 Anthropic 키는 서버에만, 앱은 구매 후 자동 저장된 기기 토큰으로 `/v1/messages` 를 부른다(Anthropic 호환 SSE 중계 + 원가 기준 크레딧 차감). dev 는 `.env` 키로 직접 (spec 005) | 서버·DB 서비스 없이 로컬 완결. better-sqlite3 는 Electron ABI rebuild 가 vitest(Node)와 충돌해 바꿈 (spec 003) |
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

- 모델 호출 경로 = **모델 프로필(전략)** (spec 007, `env.profileKind` → `agent/profiles/` 의 `IModelProfile`: 클라이언트·모델 id·요청 옵션·도구 구성 한 묶음). `fake`(`MYBROWSER_FAKE_MODEL=1` — e2e) / `dev`(사내 GenAI 프록시 — `.env` 의 `ANTHROPIC_API_KEY` + 필수 `ANTHROPIC_BASE_URL`, 기본 모델 `bedrock.anthropic.claude-opus-5-5`, 프록시 비호환이라 computer toolset·`fallbacks`·server-side-fallback 베타를 보내지 않는다) / `prod`(Claude API 비즈니스 — 기기 토큰 → `mybrowser-gateway` → Anthropic, 전체 옵션). 판정: fake → 설치판은 항상 prod → 개발 실행은 `MYBROWSER_PROFILE=dev|prod` **필수**(없으면 시작 실패). 콘솔 키 직접 호출(direct)은 없앴다 (spec 007). 기기 토큰은 `account/` 모듈이 기기 코드 방식(구매 탭 + 폴링)으로 받아 `app/credentialStore.ts`(safeStorage)에 둔다. 원격 디버깅은 항상 127.0.0.1, 설치판 기본 port 0.
- 에이전트 루프는 **main 프로세스**에서 돈다 (1차). 무거워지면 `utilityProcess` 로 분리.
- 렌더러는 Node 접근 금지(`contextIsolation: true`, `nodeIntegration: false`), 모든 통신은 preload 의 타입 API.
- 사이드바 UI 와 탭은 같은 창 안의 별도 View 라 사용자 조작과 에이전트 조작이 한 화면에서 보인다.
- 창은 mac Chrome형 프레임 (spec 010): Linux·Windows 는 `frame: false` + renderer 가 그린 신호등(`window:minimize|toggleMaximize|close` IPC → `app/window.ts` 의 `createWindowControls`), macOS 는 `titleBarStyle: 'hiddenInset'` 네이티브 신호등. 맨 윗줄(탭 줄) 빈 곳이 창 드래그 영역 — macOS·Windows 는 CSS `app-region: drag`(OS 처리). **Linux 는 앱이 직접 처리한다 (spec 016)**: WSLg(XWayland)가 프레임 없는 창의 드래그 영역을 처리하지 않으므로 탭 줄 빈 곳 끌기·더블클릭(최대화 토글)·가장자리 8방향 손잡이를 renderer 가 받아 `window:pointerStart|pointerMove|pointerEnd` 로 보내고, main 의 `app/windowPointer.ts` 세션이 `setBounds` 한다. 최대화 중 끌면 원래 크기로 돌아오며 커서 비율을 유지한다. **Linux 최대화는 창 관리자 최대화 상태로 두지 않는다 (spec 017)**: WSLg 는 최대화된 프레임 없는 창 내용을 ~32px 밀어 그려 입력 좌표가 어긋나므로, `app/windowMaximize.ts` 가 `maximize` 이벤트에서 창 관리자가 정한 bounds(=모니터 작업 영역, 작업 표시줄 제외)를 읽고 `unmaximize` → `setBounds` 한 일반 창으로 바꾸며(창 관리자의 늦은 복원은 배치 후 1초 동안 move·resize 를 지켜 최대 3회 다시 적용), 최대화 여부·직전 bounds 를 앱이 들고 `window:stateChanged` 로 알린다. 토글하면 직전 bounds 로 돌아간다. 잰 최대화 bounds 는 모니터별로 실행 동안 기억해 두 번째부터는 창 관리자 최대화 없이 바로 배치한다 — 깜빡임은 모니터마다 첫 최대화에서만 (spec 018). 디스플레이 구성이 바뀌면 기억을 비운다. 최대화가 아닐 때 탭 View 는 가장자리에서 4px 안쪽(손잡이가 마우스를 받게).
- 에이전트 사이드바는 Edge Copilot 처럼 툴바 끝 [에이전트] 버튼·패널 ✕ 로 열고 닫는다 (spec 011). 탭 줄·툴바는 창 전체 폭, 그 아래 [탭 콘텐츠 | 패널]. 닫아도 run 은 계속되고, 승인·질문이 오면 패널이 자동으로 보인다(닫기·열기는 승인 결정을 보내지 않음). 폭 조절(300~640, 기억)·Ctrl/Cmd+Shift+A 토글, 패널의 [실행 기록] 은 `runs:list`/`runs:get` 으로 SQLite 의 지난 run 을 읽기 전용으로 보여준다(요약·상태만, 입력값 원문 없음) (spec 012). 할 일 입력창은 현재 탭 사이트·최근 작업 기반 추천 문구를 흐리게(빈 입력은 placeholder, 치는 중엔 이어쓰기) 보이고 Tab 으로 채운다 — 규칙 기반·모델 호출 없음, 실행은 Enter 그대로 (spec 019).

## 3. 에이전트 설계

### 모델·API
- `claude-opus-5-5`, 스트리밍, `output_config: { effort: "high" }`, thinking 은 기본(adaptive).
- `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`).
- 프롬프트 캐싱: 시스템 프롬프트 + 도구 목록 고정 prefix, 날짜·위치는 첫 user 메시지. 사용자 지침(스킬)은 cache_control 없는 system **두 번째 블록** — 고정 블록 캐시는 그대로, run 내내 같은 값이라 user 메시지에 섞지 않는다 (spec 013).
- 첫 user 메시지에 할 일을 시작할 때의 현재 탭 캡처(1280×800 이하 PNG) 1장을 `[image, text]` 로 붙인다 — 첫 판단(팝업·로그인 유도·배치)을 돕고, 조작은 여전히 snapshot ref. 기본 켬, `MYBROWSER_FIRST_SCREENSHOT=0` 이면 끔, 캡처 실패·5초 초과면 텍스트만. 효과는 spec 020 평가 세트로 켬/끔 비교 (spec 022).

### 사용자 지침(스킬) — spec 013
- 패널 [설정] 에서 사용자가 짧은 지침(사이트 요령·선호)을 추가·편집·켜기·삭제한다. SQLite `skills` 테이블, 최대 30개·켜진 내용 합 12000자. run 시작 때 켜진 스킬을 만든 순서로 `# 사용자 지침` + `## {이름}` 블록으로 붙인다. 머리말은 "안전 규칙·승인 흐름보다 우선하지 않는다" 고정 문장 — 가드는 결정적이라 지침과 무관하게 동작한다.
- **넣지 않은 것 (2026-11-06 결정)**: MCP·커넥터·훅·플러그인·서브에이전트. MCP 는 웹페이지 프롬프트 인젝션으로 브라우저 밖 도구가 실행될 위험(가드가 MCP 동작을 판정 못 함), 한국용 MCP 의 개발자 키·Node/Python 요구, 매 요청 도구 정의 토큰 증가, 지도·검색은 브라우저로 이미 가능하다는 이유. 효과가 큰 것(장소 검색·일정 추가)은 필요하면 내장 도구로 따로 검토한다.
- 컨텍스트 편집 `clear_tool_uses_20250919` 로 오래된 스냅샷/스크린샷 제거 — 트리거 3만 입력 토큰·최근 3개 유지·사용자 답/승인 제외 (spec 015).
- 스트리밍 + 클라이언트 도구 → `eager_input_streaming: true`, 파싱 결과는 zod 로 검증.

### 도구 (2층)
| 층 | 도구 | 구현 |
|---|---|---|
| 구조 도구 (기본) | `navigate`, `snapshot`(접근성 트리 + ref, 압축·열린 대화상자 먼저·`ref` 부분 보기 — spec 015), `click(ref)`, `type(ref, text)`, `select`, `scroll`, `wait_for`, `back`, `tabs`, `read_text` | playwright-core locator/ariaSnapshot. 싸고 안정적 |
| 픽셀 도구 (폴백) | `computer_toolset_20260801` | 달력·지도처럼 트리로 못 잡는 UI. SDK `BetaAbstractComputerToolset20260801` 하위 클래스, 멤버 8개(screenshot·left/double_click·type·key·scroll·mouse_move·wait), 좌표의 요소로 같은 가드 (spec 004) |
| 사람 개입 | `ask_user(question, optionList?)`, `request_approval(action, target, reason)` | 도구 `run` 안에서 대기(루프는 그대로) → 사이드바 안 승인 창·질문 카드(번호 선택 목록, 승인 창 기본 강조 = 거부 — spec 009) → 답/결정 후 재개 (spec 004) |

### 안전 게이트 (2중)
1. 프롬프트 규칙: 결제·예약 확정·주문·전송은 가드의 승인 창에 맡긴다(모델이 스스로 확인받고 싶으면 `request_approval`).
2. `guard.ts` 결정적 가드: 구조·픽셀 클릭·Enter·제출 대상의 텍스트·URL 이 패턴(예약 확정, 결제, 주문, confirm, pay, checkout …)이면 모델 판단과 무관하게 run 을 `waiting_user` 로 두고 **사이드바 승인 창**을 띄운다. 사용자는 매번 **[직접 누를게요]**(에이전트는 실행 안 함, 사용자가 탭에서 누른 뒤 [계속]) / **[에이전트가 누르기]**(실행 직전 대상 재확인 후 그 호출 1회) / **[거부]** 중 고른다 (사용자 결정 2026-11-05, spec 004 — 이전 기본값 "최종 확정은 사용자가 직접 클릭" 을 대체). 자동 승인·항상 허용은 없고, run 당 승인 요청 5회를 넘으면 block. 픽셀 클릭에서 요소를 확인할 수 없으면(canvas 등) 승인을 받는다(fail-closed). 픽셀 `type` 으로 이름·텍스트·값이 모두 빈 입력칸에 입력할 때도 칸마다 승인을 받는다 — 비밀 칸 block 이 먼저 (spec 008).
3. 비밀번호·카드번호는 입력하지 않고 `ask_user` 로 사용자에게 넘긴다.

### 상태·기록
- run: `queued → running → waiting_user → running → stopped_before_confirm | done | failed`
- sqlite: `runs(id, task, status, usage)`, `steps(run_id, n, tool, input, result, screenshot_path)`
- 브라우저 데이터 (spec 021): `bookmarks(url 고유, 최대 500)`, `history(url·제목·시각만, 최대 5000, 새로 고침은 갱신)` — 에이전트 도구는 읽지 않는다.
- 방문 기록 화면 (spec 023): 새 탭 시작 화면에는 없고, 툴바 [⋮] 메뉴(네이티브 팝업 — 탭 View 가 DOM 을 덮으므로)「방문 기록」·Ctrl+H 로 여는 전용 탭(about:blank View + 탭 상태 `internalPage: 'history'`, renderer 가 그림, 열린 탭 재사용).
- 실행 상태 표시 (spec 021): run 이 다루는 탭(시작 탭 → switch_tab·open_tab 대상)에 작업 중·응답 대기 점(표시용, 가드·루프는 읽지 않음). 창에 포커스가 없으면 승인·질문·완료·실패를 OS 알림 — 알림은 창 포커스만, 승인은 사이드바에서만.
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
| 3 | 예약 시나리오: 날짜·시간·인원 폼, ask/approval, 확정 직전 가드 — **구현 (spec 004, 2026-11-05)**: e2e 로 거부·직접·에이전트 누르기·중지 경로의 승인 전 미실행 확인 | 확정 모달 직전 정지 100% |
| 4 | computer_toolset 폴백 + 커서 오버레이 — **구현 (spec 004, 2026-11-05)**: 로컬 canvas 달력 픽셀 선택 e2e 통과, 실제 사이트는 수동 확인 | 달력 위젯 선택 성공 |
| 5 | electron-builder 패키징 + 평가 세트 — **구현 (spec 005, 2026-11-05)**: `pnpm dist:linux`(AppImage) + 설치판 e2e(`pnpm e2e:packaged`), `pnpm eval`(가짜 모델 7 시나리오 표, `--real --yes-spend` 는 비용 승인 후), 구독 계정 활성화(gateway 모드). Win/mac 은 설정만 | 설치 파일 더블클릭 실행, 회귀 측정 |
| 6 | 게이트웨이 운영 — 실제 Postgres·토스 샌드박스 검증, 배포, 실측(`eval --real`)으로 가격·크레딧 확정. **실제 사이트 평가 세트 (spec 020, 2026-11-13)**: `pnpm eval -- --real --yes-spend --set sites [--repeat N]` — 로그인 불필요 실제 작업 10개 × 3회, 규칙 판정(성공/확인 필요/실패) + 끝 화면·단계 로그로 사람 확인, 승인 창은 항상 거부, run 입력 토큰 상한(`MYBROWSER_MAX_INPUT_TOKENS`, 평가 1.5M) — 성공률·토큰이 정확도·원가 개선의 기준 | 결제→활성화→run→차감 실환경 1회 |
| 7 | 출시 — 코드 서명·자동 업데이트, 약관·개인정보처리방침, 사업자·통신판매업 | 외부 사용자 설치·결제 |

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
- 과금(spec 005): 원가는 USD, 판매는 KRW → 환율 버퍼를 크레딧 환산에 둔다. 정기결제 실패(past_due)·환불 정책 필요. 게이트웨이는 웹페이지 내용을 중계하므로 본문 미로깅 + 개인정보처리방침 명시. 설치판 CDP(127.0.0.1 임의 포트)는 같은 PC 의 다른 프로세스가 접속할 수 있다 — 외부 노출은 없음.
