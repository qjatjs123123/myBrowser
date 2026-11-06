# Spec: e2e 격리(가상 디스플레이·외부 요청 차단) + 이름 없는 입력칸 픽셀 입력 승인

> **상태**: ✅ 완료
> **생성일**: 2026-11-06
> **묶음**: 기반
> **관련 spec**: 002, 004, 005
> **설계 참조**: docs/DESIGN.md §3 (안전 게이트), §6 (하네스)

---

## 1. 요구사항

### 배경 / 목적
- **주소창 `nhttp://…` (spec 004 TROUBLESHOOTING)** 은 앱 버그가 아니었다. e2e 가 WSLg 데스크톱에 창을 띄우면 OS 포커스를 가져가고, 그 사이 사용자가 친 실제 키보드·한글 IME 입력이 테스트 창으로 들어간다. 재현: 시작 직후 `pressSequentially` 16회 중 5회 오염(`로그이`·`chttp`·body 로 간 `w k`/`r m d` 키), 같은 테스트를 xvfb 가상 디스플레이에서 돌리면 16/16 통과 (2026-11-06). → e2e 를 기본으로 가상 디스플레이에서 돌린다 (사용자 결정).
- e2e 중 탭이 외부 사이트로 나가면 테스트가 외부에 의존하게 된다 — 지금은 막는 장치가 없다.
- 픽셀 `type` 은 이름 없는 입력칸에도 승인 없이 입력한다. 무엇을 채우는지 사용자가 알 수 없는 칸이므로 칸마다 승인을 받는다 (사용자 결정 — 안전 게이트 **강화**).

### 기능 요구사항
- **FR-1**: `pnpm test:e2e`(= `make e2e`, 품질 게이트)는 Linux 에서 `xvfb-run` 이 있으면 가상 디스플레이에서 Playwright 를 돌린다 — `WAYLAND_DISPLAY` 를 지우고 `xvfb-run -a`. `E2E_HEADED=1` 이면 지금처럼 화면에 띄운다. `xvfb-run` 이 없거나 Linux 가 아니면 그대로 돈다. 인자(`SPEC` 경로·`-c` 설정)는 Playwright 에 그대로 넘긴다.
- **FR-2**: `pnpm e2e:packaged` 도 같은 실행기를 쓴다.
- **FR-3**: e2e 픽스처는 앱을 띄운 직후 브라우징 세션(`persist:browsing`)의 요청 중 외부 host 를 **취소**하고, 취소한 URL 을 `[e2e.external] {url}` 로 errorList 에 넣는다 → 테스트 실패. 허용: `127.0.0.1`·`localhost`·`[::1]` host, `about:`·`data:`·`blob:`·`devtools:`·`chrome:`·`file:` 스킴.
- **FR-3b**: (FR-3 작업 중 발견) 앱 종료 직전에 탭 로드가 실패하면 늦게 온 탭 상태 이벤트가 이미 파괴된 메인 창의 `webContents` 를 읽어 `uncaughtException: Object has been destroyed` 가 난다. 사이드바 이벤트 발신은 창이 파괴됐으면 조용히 건너뛴다 (`src/main/index.ts` 의 `createSidebarEmitter` getter).
- **FR-4**: 픽셀 `type`(가드 tool `type_text`) 의 포커스 대상이 **이름·텍스트·값이 모두 빈** 요소면 `require_approval` — reason `이름 없는 입력칸`, display `{ action: submit ? '입력 후 제출' : '입력', target: '이름 없는 입력칸' }` — 픽셀 `type` 가드 호출에는 좌표(point)가 없으므로(`computer/toolset.ts` 의 `type_`) 고정 문구를 쓴다. [에이전트가 누르기] 재판정 때 `isSameDisplay` 가 같은 값을 내도록 display 는 입력값·시점과 무관해야 한다.
- **FR-5**: FR-4 보다 비밀 입력 차단이 먼저다 — 이름 없는 `type=password` 칸은 지금처럼 `block`. 확정 패턴(submit 의 formSubmitText)에 걸리면 그 승인 판정을 그대로 쓴다.
- **FR-6**: 이름 있는 칸(예: `검색어`)의 픽셀 `type` 은 지금처럼 `allow`. 구조 도구 `type_text` 는 바뀌지 않는다 (ref 로 고른 요소라 모델·사용자가 대상을 안다).

### 안전 요구사항
- **SR-1**: 가드 변경은 **강화만** 한다 — 기존 block·require_approval 판정은 하나도 allow 로 바뀌지 않는다. `guard.test.ts` 에 FR-4~6 케이스를 추가한다 (rules/agent/guard.md 「불변 조건」).
- **SR-2**: 승인 창 display 는 고정 문구만 쓴다 — 모델 문자열 없음 (SR-3 of spec 004).
- **SR-3**: 연속 승인 상한(`MAX_APPROVAL_COUNT` 5)은 그대로 — 이름 없는 칸이 많은 페이지에서 상한에 걸리면 run 이 멈추는 것이 의도된 동작이다.
- **SR-4**: e2e 외부 요청 차단은 테스트 픽스처에만 있다 — 앱 코드(`src/`)에 테스트용 우회·플래그를 넣지 않는다.

### 비기능 요구사항 / 제약
- 가상 디스플레이에서도 기존 e2e 28개가 그대로 통과해야 한다 (스크린샷 e2e 포함).

### 범위 제외 (Out of Scope)
- 주소창 코드 수정 (원인이 앱 밖), 승인 창 버튼 문구("에이전트가 누르기")를 입력용으로 바꾸기, eval(`pnpm eval`) 실행기 변경.

---

## 2. 설계 개요

### 영향받는 프로세스 / 파일
- `scripts/e2eRun.ts` (신규) — `buildE2eCommand({ platform, env, hasXvfb, argList })` 순수 함수 → `{ command, argList, env }`. 본문은 `playwright test {argList}` 를 FR-1 규칙으로 감싸 `spawn`(stdio inherit) 하고 종료 코드를 그대로 낸다. `hasXvfb` 는 PATH 에서 `xvfb-run` 존재로 판정. **직접 실행됐을 때만 spawn** 한다 (`scripts/checkAsar.ts` 처럼 `import.meta.url === pathToFileURL(process.argv[1]).href` 검사 — vitest 가 import 할 때 playwright 가 돌지 않게).
- `.github/workflows/ci.yml` — `xvfb-run -a pnpm test:e2e` → `pnpm test:e2e` (실행기가 xvfb 를 감싸므로 두 겹 방지).
- `package.json` — `"test:e2e": "electron-vite build && node --experimental-strip-types scripts/e2eRun.ts"`, `"e2e:packaged": "pnpm dist:linux && pnpm check:asar && node --experimental-strip-types scripts/e2eRun.ts -c playwright.packaged.config.ts"`.
- `e2e/fixtures.ts` — `launchElectron` 이 띄운 직후 `blockExternalRequests(app)`: `app.evaluate` 로 `session.fromPartition('persist:browsing').webRequest.onBeforeRequest` 를 걸어 FR-3 판정 → 취소 + `process.stderr.write('[e2e.external] …')`. stderr 리스너가 이 접두사도 errorList 에 넣는다. 허용 판정 `isLocalRequestUrl(url)` 은 `app.evaluate` 안에 직렬화되므로 함수 본문 안에 둔다.
- `src/main/agent/guard.ts` — `judgePixel` 의 `type_text`: `checkTypeText` 결과가 `allow` 이고 `isNamelessTarget(target)` 이면 `toNamelessTypeApproval(input)`. `DISPLAY_ACTION.type = '입력'`, `NAMELESS_INPUT_REASON = '이름 없는 입력칸'`.
- 문서: `.claude/rules/agent/guard.md` 규칙 6 표의 `type` 행, `.claude/rules/test-convention.md` e2e 절(가상 디스플레이·외부 요청 차단·`E2E_HEADED`), `docs/TROUBLESHOOTING.md` 의 `nhttp://` 항목(원인 정정), `docs/DESIGN.md` §3 픽셀 가드 문장.

### IPC 계약
변경 없음

### 도구 계약
변경 없음 — 도구 정의·입력 스키마 그대로. 가드 판정만 강화 (픽셀 `type` → 이름 없는 칸 승인).

### 데이터
변경 없음

### 열린 질문
없음 — 사용자 확인(2026-11-06): ① e2e 가상 디스플레이 기본, ② e2e 외부 이동 차단, ③ 픽셀 입력 칸마다 승인.

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 **테스트와 검증이 모두 에러 0**이 될 때까지 수정 → 재실행을 반복하고, 전부 통과했을 때만 체크박스를 채우고 **Task 단위로 커밋**한 뒤 다음 Task 로 진행한다.
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**

- [x] **Task 1: e2e 실행기 — 가상 디스플레이 기본**
  - **묶음**: 기반
  - **작업**: `scripts/e2eRun.ts` + `package.json` 두 스크립트 교체 + CI 의 `xvfb-run` 제거
  - **파일**: `scripts/e2eRun.ts`, `package.json`, `.github/workflows/ci.yml`
  - **테스트**: `scripts/__tests__/e2eRun.test.ts` — linux·xvfb 있음 → `xvfb-run -a playwright test …` 이고 env 에 `WAYLAND_DISPLAY` 없음 / `E2E_HEADED=1` 이면 `playwright test …` 그대로 / xvfb 없음 → 그대로 / darwin·win32 → 그대로 / argList(`e2e/a.spec.ts`, `-c x.ts`)가 순서대로 뒤에 붙는다
  - **실행**: `pnpm test scripts/__tests__/e2eRun.test.ts` + `make e2e SPEC=e2e/app-shell.spec.ts` (가상 디스플레이에서 통과, 데스크톱에 창이 뜨지 않음)
  - **검증**: `pnpm type-check` + 단위 테스트 + 위 e2e
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `chore: e2e 를 가상 디스플레이에서 실행 (spec 008 Task 1)`

- [x] **Task 2: e2e 외부 요청 차단**
  - **묶음**: 기반
  - **작업**: `e2e/fixtures.ts` 에 `blockExternalRequests` + stderr `[e2e.external]` 수집
  - **파일**: `e2e/fixtures.ts`, `e2e/external-block.spec.ts`(신규), `src/main/index.ts`(FR-3b)
  - **테스트**: `e2e/external-block.spec.ts` — 주소창으로 `http://example.invalid/` 이동 → errorList 에 `[e2e.external] http://example.invalid/` 가 들어오고(확인 후 테스트에서 비움) 탭은 그 페이지를 열지 않는다 / 로컬 픽스처(`basic.html`) 이동은 차단 기록 없음
  - **실행**: `make e2e SPEC=e2e/external-block.spec.ts` + 전체 `make e2e`(기존 테스트에 외부 요청 0)
  - **검증**: `desktop/app-check` — 위 흐름, 콘솔·main 에러 0(차단 확인 테스트 제외) + e2e 통과
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `test: e2e 중 외부 사이트 요청 차단 (spec 008 Task 2)`

- [x] **Task 3: 이름 없는 입력칸 픽셀 type 승인**
  - **묶음**: 기반
  - **작업**: guard.ts FR-4·FR-5, 픽스처 페이지 + 가짜 시나리오 + e2e
  - **파일**: `src/main/agent/guard.ts`, `e2e/fixtures/pages/pixel-type.html`(신규 — label·placeholder·aria 없는 input 1개, 값 변경을 `window.__inputLog` 에 기록), `e2e/fixtures/model/pixel-type.json`(신규 — screenshot → left_click 입력칸 좌표 → type `강남역` → 끝 text), `e2e/agent-approval.spec.ts`
  - **테스트**:
    - `src/main/agent/__tests__/guard.test.ts` — 이름 없는 칸 픽셀 type submit:false → require_approval·display `{ action: '입력', target: '이름 없는 입력칸' }` / submit:true → action `입력 후 제출` / 이름 없는 password → block / 이름 있는 칸(`검색어`) → allow (기존) / 이름 없는 칸 submit:true + formSubmitText `예약 확정` → 확정 승인 판정 / 구조 도구 type_text 이름 없는 칸 → allow
    - `e2e/agent-approval.spec.ts` 「픽셀 입력」 — 클릭 승인(이름 없는 요소)을 [에이전트가 누르기] → 입력 승인 창에 `이름 없는 입력칸` → [거부] → 칸 값 빈 문자열·`__inputLog` 빈 배열·run 완료 / 같은 흐름에서 입력 승인을 [에이전트가 누르기] → 칸 값 `강남역`
  - **실행**: `pnpm test src/main/agent/__tests__/guard.test.ts` + `make e2e SPEC=e2e/agent-approval.spec.ts`
  - **검증**: `desktop/app-check` — 가짜 모델로 픽셀 입력 흐름, 승인 전 입력 0(`__inputLog`), 콘솔·main 에러 0 + e2e 통과
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 이름 없는 입력칸 픽셀 입력에 승인 요구 (spec 008 Task 3)`

- [x] **Task 4: 규칙·문서 갱신**
  - **묶음**: 기반
  - **작업**: guard.md 규칙 6 `type` 행, test-convention.md e2e 절, TROUBLESHOOTING `nhttp://` 항목 원인 정정 + 새 항목(데스크톱 e2e 에 실제 키 입력 섞임), DESIGN.md §3
  - **파일**: `.claude/rules/agent/guard.md`, `.claude/rules/test-convention.md`, `docs/TROUBLESHOOTING.md`, `docs/DESIGN.md`
  - **테스트**: 코드 변경 없음 — 전체 `make e2e` 회귀
  - **실행**: `make e2e`
  - **검증**: `pnpm type-check` + 전체 e2e
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `docs: e2e 격리·픽셀 입력 승인 규칙 반영 (spec 008 Task 4)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
| 2026-11-06 | 1 | e2eRun 단위 7 · app-shell e2e(Xvfb 확인) | debc848 | |
| 2026-11-06 | 2 | external-block e2e 2 (반복 20/20) · 전체 e2e 30 | c9139e8 | FR-3b 종료 시 파괴된 창 접근 예외 발견·수정 |
| 2026-11-06 | 3 | guard 단위 +5 · 픽셀 입력 e2e 2 (가드 변경 없이 돌리면 2개 실패 확인) | 8c25bb1 | |
| 2026-11-06 | 4 | 문서만 | 3705da2 | |
| 2026-11-06 | 검증 | make check 1354 · make e2e 32 · 에러 0 | 검증 반영 커밋 | spec-reviewer 2회차 PASS |
