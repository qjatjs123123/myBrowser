# Spec: 프로젝트 뼈대 (electron-vite + React + 테스트 하네스)

> **상태**: ✅ 완료
> **생성일**: 2026-11-05
> **묶음**: 기반
> **관련 spec**: —
> **설계 참조**: docs/DESIGN.md §1 · §2 · §4 · §5(로드맵 0단계)

---

## 1. 요구사항

### 배경 / 목적
`.claude` 하네스는 적용됐지만 코드가 없어 `make setup`·`make check`·`make e2e` 와 품질 게이트가 동작하지 않는다. 이후 모든 기능 spec 이 올라탈 최소 뼈대를 만든다 — 창이 뜨고, main ↔ preload ↔ renderer IPC 한 줄이 계약(zod)대로 왕복하고, 단위·e2e 테스트와 경계 lint 가 돈다.

### 기능 요구사항
- **FR-1**: `pnpm dev` 로 myBrowser 창이 뜨고, 오른쪽에 사이드바 자리(제목 "에이전트"), 왼쪽에 브라우징 영역 자리(제목 "새 탭")가 보인다.
- **FR-2**: 사이드바 하단에 앱 이름·버전·실행 모드(개발/테스트)가 표시된다 — `app:getInfo` IPC 왕복으로 가져온다.
- **FR-3**: 원격 디버깅 포트가 127.0.0.1 에만 열린다 (기본 9222, `MYBROWSER_CDP_PORT` 로 변경, 0 이면 임의 포트). 패키징된 앱에서는 기본으로 열지 않는다.
- **FR-4**: `make check`(lint·type-check·vitest·build) 와 `make e2e`(Playwright `_electron`, 창 열림·앱 정보 표시·콘솔/메인 에러 0) 가 통과한다.
- **FR-5**: ESLint 가 프로세스 경계를 강제한다 — renderer 에서 `electron`·`node:*`·`src/main` import, shared 에서 `electron`·`node:*` import 시 에러.

### 안전 요구사항
- **SR-1**: 모든 창은 `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- **SR-2**: preload 는 `ipcRenderer` 를 노출하지 않고 `window.api.app.getInfo` 만 노출한다.
- **SR-3**: `test:*` IPC 채널은 이번 범위에 없다 (다음 spec). 테스트 전용 동작은 `MYBROWSER_FAKE_MODEL` / `NODE_ENV=test` 일 때만.

### 비기능 요구사항 / 제약
- Node 22 (Volta 프로젝트 pin) — Electron 40+ 설치에 필요. 전역 Node 는 건드리지 않는다.
- 네이티브 모듈(better-sqlite3)·Anthropic SDK·shadcn 은 이번에 넣지 않는다 (쓰는 spec 에서 추가 — 미사용 의존성 방지).

### 범위 제외
탭(WebContentsView)·주소창·에이전트 루프·저장소·패키징 설정 검증(electron-builder 실행)은 다음 spec.

---

## 2. 설계 개요

### 영향받는 파일
```
package.json(productName "myBrowser", volta node 22) · electron.vite.config.ts · electron-builder.yml · tsconfig.json · tsconfig.node.json · tsconfig.web.json
eslint.config.mjs · .prettierrc.json · vitest.config.ts · vitest.setup.ts · vitest.setup.main.ts · playwright.config.ts
.github/workflows/ci.yml (node 22) · scripts/doctor.sh (Node 22 안내)
src/shared/ipc/{channels,result,app,api}.ts (+ __tests__)
src/main/{index,env,log}.ts · src/main/app/{window,cdp}.ts · src/main/ipc/{registry,handlers/app}.ts (+ __tests__)
src/preload/index.ts
src/renderer/{index.html,main.tsx,App.tsx,env.d.ts} · styles/globals.css · lib/api.ts · hooks/useAppInfo.ts · sidebar/AppInfoFooter/ (+ __tests__)
e2e/fixtures.ts · e2e/app-shell.spec.ts
```

### 결정 사항 (spec-reviewer 1차 지적 반영)
- **앱 이름**: package.json `productName: "myBrowser"` → `app.getName()`.
- **mode 판정** (`env.ts`): `NODE_ENV=test` 또는 `MYBROWSER_FAKE_MODEL=1` → `test`; 아니고 `app.isPackaged` → `production`; 그 밖 → `development`. 표시 문구: 개발 / 테스트 / 배포.
- **userData**: `MYBROWSER_USER_DATA` 가 있으면 ready 전에 `app.setPath('userData', …)`.
- **CDP 스위치**: 순수 함수 `getCdpSwitches({ port, isPackaged, isPortExplicit })` (`src/main/app/cdp.ts`) — 기본 9222, 환경변수 포트, `0` 은 임의 포트, 패키징 시 미적용(단 `MYBROWSER_CDP_PORT` 를 명시하면 적용), 항상 `remote-debugging-address=127.0.0.1`. e2e fixtures 는 `MYBROWSER_CDP_PORT=0` 을 넘긴다 (떠 있는 `pnpm dev` 와 포트 충돌 방지).
- **창 옵션**: `createWindowOptions(preloadPath)` 로 분리해 SR-1 을 단위 테스트한다.
- **스타일**: Tailwind 4 (`tailwindcss` + `@tailwindcss/vite`) — 레이아웃은 Tailwind 클래스만, `globals.css` 는 토큰.

### IPC 계약
| 채널 | 방향 | 요청 스키마 | 응답 스키마 |
|---|---|---|---|
| `app:getInfo` | invoke | 없음 (`z.undefined()`) | `{ name: string, version: string (semver), mode: 'development' \| 'test' \| 'production' }` 를 `TIpcResult` 로 감쌈 |

### 도구 계약
변경 없음.

### 데이터
변경 없음.

### 열린 질문
없음.

---

## 3. 작업 순서 (Tasks)

- [x] **Task 1: 패키지·빌드·린트·테스트 설정 + 최소 진입 스텁 + 봉투 헬퍼**
  - **묶음**: 기반
  - **작업**: package.json(scripts: dev·build·lint·type-check·test·test:e2e·format, productName, volta node 22), electron-vite(+ Tailwind 4 플러그인)·tsconfig 3종(@shared·@main·@ alias), ESLint(경계 규칙 FR-5), Prettier, vitest(main·shared=node + `vitest.setup.main.ts` electron `app` 최소 mock[getName·getVersion·isPackaged·getPath·setPath] / renderer=jsdom + `vitest.setup.ts`), playwright.config, electron-builder.yml, ci.yml·doctor.sh 를 Node 22 로. 각 tsconfig 에 입력이 생기도록 최소 진입 스텁(`src/main/index.ts`, `src/preload/index.ts`, `src/renderer/{index.html,main.tsx,env.d.ts}`)을 두고 Task 2·3 이 채운다. `src/shared/ipc/result.ts`(ok/fail 헬퍼, `TIpcResult`)를 같이 만든다.
  - **파일**: 위 설정 파일들, 진입 스텁, `src/shared/ipc/result.ts`
  - **테스트**: `src/shared/ipc/__tests__/result.test.ts` — ok/fail 모양, fail 의 code·message
  - **실행**: `pnpm lint && pnpm type-check && pnpm test && pnpm build`
  - **검증**: 위 명령 통과 + 경계 위반 샘플(renderer 에서 `electron` import)이 lint 에러가 나는지 일회성 확인
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `chore: electron-vite 프로젝트 설정 추가 (spec 001 Task 1)`

- [x] **Task 2: shared IPC 계약 + main(env·log·cdp·창·IPC 등록·진입) + preload**
  - **묶음**: 기반
  - **작업**: `channels`·`app:getInfo` 스키마·`IApi` 타입 / `env.ts`(zod, 결정 사항의 mode·userData·포트) / `log.ts`(`[main.error]` 접두사) / `app/cdp.ts`(`getCdpSwitches`) / `app/window.ts`(`createWindowOptions` SR-1, `createMainWindow`) / `ipc/registry.ts`·`handlers/app.ts` / `index.ts`(조립만: userData·CDP 스위치·unhandled 로그·ready 후 창·IPC 등록) / preload(SR-2, `app.getInfo` 만)
  - **파일**: `src/shared/ipc/*`, `src/main/**`, `src/preload/index.ts`
  - **테스트**: `src/shared/ipc/__tests__/app.test.ts`(유효·무효 응답) · `src/main/__tests__/env.test.ts`(mode 판정 3가지·포트 파싱·잘못된 값·USER_DATA) · `src/main/__tests__/log.test.ts`(error 접두사) · `src/main/app/__tests__/cdp.test.ts`(9222·환경변수·0·패키징 시 미적용/명시 시 적용·127.0.0.1) · `src/main/app/__tests__/window.test.ts`(contextIsolation·nodeIntegration·sandbox) · `src/main/ipc/__tests__/app.test.ts`(봉투 모양) · `src/main/ipc/__tests__/registry.test.ts`(`app:getInfo` 등록, `test:*` 미등록)
  - **실행**: `pnpm test src/shared src/main`
  - **검증**: `pnpm type-check` + 단위 테스트 + `pnpm build`
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 메인 프로세스와 app:getInfo IPC 계약 추가 (spec 001 Task 2)`

- [x] **Task 3: renderer 셸 + 앱 정보 표시**
  - **묶음**: 기반
  - **작업**: index.html·main.tsx·App.tsx(브라우징 영역 "새 탭" + 사이드바 "에이전트", FR-1, Tailwind 클래스만), globals.css(토큰·다크모드), `lib/api.ts`(`window.api` 타입 래퍼), `hooks/useAppInfo.ts`, `sidebar/AppInfoFooter`(FR-2 "myBrowser v{버전} · {모드 문구}", 로딩·에러 상태)
  - **파일**: `src/renderer/**`
  - **테스트**: `lib/__tests__/api.test.ts`(`window.api` 위임) · `hooks/__tests__/useAppInfo.test.ts`(성공·ok:false) · `sidebar/AppInfoFooter/__tests__/AppInfoFooter.test.tsx`(표시·에러 문구) · `__tests__/App.test.tsx`(두 영역 제목)
  - **실행**: `pnpm test src/renderer`
  - **검증**: renderer 단위 테스트 + `pnpm build`. 앱 셸 흐름의 app-check·e2e 판정은 Task 4.
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 렌더러 셸과 앱 정보 표시 추가 (spec 001 Task 3)`

- [x] **Task 4: e2e 하네스 + 앱 셸 e2e**
  - **묶음**: 기반
  - **작업**: `e2e/fixtures.ts`(`_electron.launch`, 임시 userData(`MYBROWSER_USER_DATA`), `MYBROWSER_FAKE_MODEL=1`, `MYBROWSER_CDP_PORT=0`, 콘솔 error·pageerror·`[main.error]` 수집 → `HARNESS_RUN_DIR/console-errors.log`, 1건이라도 있으면 실패), `e2e/app-shell.spec.ts`
  - **파일**: `e2e/*`
  - **테스트**: `e2e/app-shell.spec.ts` — "에이전트"·"새 탭" 제목, "myBrowser v{package.json version} · 테스트" 표시, `Object.keys(window.api)` 가 `['app']`, `typeof require === 'undefined'` (SR-1·SR-2)
  - **실행**: `make e2e` (창 없으면 `xvfb-run -a make e2e`)
  - **검증**: `desktop/app-check` — 흐름: 앱 실행 → 두 제목 → 앱 정보 → 에러 0
  - **통과 기준**: `make setup`(재실행) · `make check` · `make e2e` 통과
  - **커밋**: `test: 앱 셸 e2e 와 Electron 픽스처 추가 (spec 001 Task 4)`

---

## 4. 진행 로그


| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
| 2026-11-05 | 1 | lint·type-check·vitest 3·build ✅, 경계 lint 위반 3건 검출 확인 | 미커밋 | 저장소 첫 커밋 전 — 커밋은 사용자 |
| 2026-11-05 | 2 | vitest 누적 24 ✅ (env·log·cdp·window·ipc·registry) | 미커밋 | preload 번들이 CJS + require("electron") 만인지 확인 |
| 2026-11-05 | 3 | vitest 누적 31 ✅ (api·useAppInfo·AppInfoFooter·App) | 미커밋 | VOLTA_FEATURE_PNPM 없이는 pnpm 이 node 20 으로 돌아 jsdom 실패 → 해결 |
| 2026-11-05 | 4 | e2e 2 ✅ (WSLg·xvfb, 에러 0) · make setup ✅ · make check ✅(vitest 32) · 품질 게이트 ✅ | 미커밋 | 에러 수집 음성 대조(console.error 주입 → 실패) 확인. 리팩토링: window.ts 의 process.env 를 env.ts 로 이동 |

### 결정 기록
- 버전: Electron 45.2.3 · electron-vite 6 · Vite 8 · React 19.3 · Tailwind 4.3 · Zod 4 · vitest 5 · jsdom 30 · TypeScript 5.9(typescript-eslint 가 6.1 미만만 지원 — 7.x 보류) · ESLint 10 · Playwright 1.64.
- Node 22.23.4 + pnpm 10.34.4 를 Volta 로 프로젝트 pin. Volta 는 `VOLTA_FEATURE_PNPM=1` 일 때만 pnpm 에 pin 을 적용하므로 Makefile·훅이 이 값을 넣는다. Claude Code 가 Volta 로 실행되면 상속되는 `_VOLTA_TOOL_RECURSION` 도 지운다.
- `package.json` 에 `type: module` 을 두지 않는다 — sandbox preload 는 CJS 여야 한다. 대신 `vitest.config.mts`.
- pnpm 10 은 install script 를 기본 차단 — `pnpm.onlyBuiltDependencies: ["electron"]` 만 허용.

