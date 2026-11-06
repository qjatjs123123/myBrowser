---
description: src/main/ (Electron 메인 프로세스) 파일 작성·수정 시 — 창·탭·브라우저 제어·저장 모듈 규칙
paths:
  - "src/main/**"
---

# Main 프로세스 규칙

전체 구조·의존 방향은 `rules/architecture.md` §2. 에이전트 쪽은 `rules/agent/*.md`, IPC 는 `rules/electron/ipc.md`.

## 보안 기본값 (바꾸지 않는다)
- 모든 `BrowserWindow`/`WebContentsView` 의 `webPreferences`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. 사이드바 View 만 `preload` 를 갖고, **웹페이지 탭 View 는 preload 없음**.
- 탭 View 에는 `session.fromPartition('persist:browsing')` — 로그인 세션 영속. 사이드바는 기본 세션.
- `will-navigate`·`setWindowOpenHandler` 로 탭 View 가 새 창을 열지 못하게 하고, 팝업은 새 탭으로 돌린다.
- 원격 디버깅 포트(`remote-debugging-port`)는 **항상 127.0.0.1 바인딩**. 개발 기본 9222, **설치판 기본 port 0(임의 포트 — 고정 포트 금지)**, `MYBROWSER_CDP_PORT` 로 덮어쓴다. 스위치와 `resolveCdpEndpoint` 는 같은 `env.cdpPort` 를 쓰고, ready 전에 지난 실행의 `userData/DevToolsActivePort` 를 지운다 (spec 005).

## 모듈 작성 규칙
- 모듈은 **클래스 1개 또는 함수 묶음 1개**를 export 하고, 생성자/팩토리로 의존을 주입받는다 (`new TabManager(window)`, `createAgentLoop({ browser, store, model })`). 모듈 최상위에서 전역 싱글턴을 만들지 않는다 — 테스트에서 가짜를 넣을 수 있어야 한다.
- `electron` 모듈은 `app/`·`tabs/`·`ipc/` 에서만 import 한다. `browser/`·`agent/`·`store/` 는 `electron` 을 모른다 (playwright-core·sqlite·SDK 만) — 그래야 vitest(node)에서 그대로 테스트된다. `WebContents` 가 필요하면 인터페이스(`ITabHandle`)로 받는다.
- 비동기는 `async/await`, 콜백 API 는 `promisify`. 모든 `Promise` 는 await 하거나 `void` 명시. `process.on('unhandledRejection')` 은 `index.ts` 에서 로그(`[main.error]`)로 남긴다.
- 로그는 `src/main/log.ts` 의 `log.{info,warn,error}(scope, msg, meta)` 로만. `console.log` 직접 금지. 에러는 `[main.error]` 접두사로 stderr — e2e fixtures 가 이 접두사를 센다.
- 파일 경로는 `app.getPath('userData')` 기준. 테스트·e2e 는 `MYBROWSER_USER_DATA` 환경변수로 덮어쓴다.
- 환경변수는 `src/main/env.ts` 한 곳에서 zod 로 읽는다 (`MYBROWSER_PROFILE`(dev|prod, 개발 실행 필수 — spec 007), `ANTHROPIC_API_KEY`·`ANTHROPIC_BASE_URL`(dev), `MYBROWSER_GATEWAY_URL`(prod), `MYBROWSER_FAKE_MODEL`, `MYBROWSER_CDP_PORT`, `MYBROWSER_USER_DATA`). 다른 파일에서 `process.env` 직접 접근 금지.

## 탭 (tabs/)
- `TabManager` 가 `WebContentsView` 의 생성·전환·닫기·`setBounds` 를 전담. renderer 가 보낸 레이아웃 rect(사이드바 폭 반영)로 bounds 를 맞춘다.
- 탭 상태(`ITabState`: id, url, title, favicon, isLoading, canGoBack/Forward)는 `tabs:changed` 이벤트로 renderer 에 **전체 목록**을 보낸다 (diff 보내지 않는다 — 단순함 우선).
- 에이전트가 쓸 탭은 `TabManager.getHandle(id): ITabHandle` 로 넘긴다 (webContents 의 CDP 타깃 id·url 만 노출).

## 브라우저 제어 (browser/)
- `cdp.ts`: `playwright-core` 의 `chromium.connectOverCDP(`http://127.0.0.1:${port}`)` 1회 연결, 탭 id ↔ `Page` 매핑. 연결 끊김은 재연결 1회 후 에러.
- `snapshot.ts`: `page.locator('body').ariaSnapshot()` + ref 부여(`e1`, `e2` …) → 텍스트. **최대 길이 제한**(기본 12k 자, 넘으면 `[... 잘림, scroll 로 더 보기]`).
- `actions.ts`: click/type/select/scroll/press/wait_for/navigate/back — 각 함수는 `(page, input) => Promise<IActionResult>`. ref 해석은 `locator(`aria-ref=${ref}`)`. 타임아웃 기본 10s, 실패는 throw 가 아니라 `{ ok: false, reason }`.
- `overlay.ts`: 탭에 커서·하이라이트 DOM 을 주입(`page.addInitScript` + `evaluate`). 페이지 스크립트와 충돌하지 않게 shadow DOM + `data-mybrowser-overlay`.

## 저장 (store/)
- 내장 `node:sqlite`(`DatabaseSync`), 동기 API — better-sqlite3 는 쓰지 않는다(네이티브 rebuild 가 vitest 와 충돌, spec 003). `db.ts` 가 열고 `migrations/{NNN}_{snake}.sql` 을 `?raw` import 로 순서대로 적용(`user_version`).
- 테이블: `runs`, `steps`, `skills`(spec 013), `settings`. 접근은 `repos/{table}.ts` 의 함수로만, SQL 은 repos 안에만.
- 스크린샷은 DB 가 아니라 `userData/screenshots/{runId}/{n}.png`, DB 에는 경로만.

## 테스트
- `__tests__/{name}.test.ts`, vitest node 환경. `electron` 은 `vitest.setup.main.ts` 에서 최소 mock (`app.getPath`).
- `browser/` 는 headless chromium(`chromium.launch()`)으로 `e2e/fixtures/pages/*.html` 을 열어 테스트한다. `agent/tools/` 는 가짜 `IBrowserDriver` 로 위임만 검증한다(실제 행동은 browser/ 테스트가 맡는다).

## 금지
- ❌ `nodeIntegration: true`, `contextIsolation: false`, `webSecurity: false`
- ❌ 탭 View 에 preload 주입, `ipcRenderer` 노출
- ❌ `agent/`·`browser/`·`store/` 에서 `electron` import
- ❌ IPC 핸들러 안에 비즈니스 로직 (모듈 함수 호출만)
- ❌ `process.env` 를 `env.ts` 밖에서 읽기, `console.log`
