# Spec: 할 일 시작 시 현재 탭 캡처 첨부

> **상태**: ✅ 완료
> **생성일**: 2026-11-13
> **묶음**: 기반 (단일 묶음 — 직접 방식)
> **관련 spec**: 003 (루프), 004 (스크린샷·픽셀), 007 (모델 프로필), 020 (실제 사이트 평가 세트)
> **설계 참조**: docs/DESIGN.md §3 「모델·API」·「도구 (2층)」

---

## 1. 요구사항

### 배경 / 목적
사용자 (2026-11-13): "프롬프트 한번에 자동으로 화면 캡쳐해서 보내서 성능 향상해보자". 지금 첫 메시지는 텍스트(오늘·현재 탭 URL·제목·할 일)뿐이라, 모델은 snapshot 을 부르기 전까지 팝업·로그인 유도·배너·레이아웃을 모른다. 할 일을 실행할 때 현재 탭 화면 1장을 첫 메시지에 함께 보내 첫 판단을 돕는다. 효과는 spec 020 평가 세트로 켬/끔을 비교해 본다.

### 기능 요구사항
- **FR-1 (첫 메시지 캡처)**: run 을 시작할 때(사이드바 Enter·[작업 실행] 1번) 에이전트 드라이버의 `takeScreenshot()`(1280×800 이하 PNG, spec 004)으로 활성 탭을 **1번** 찍고, 첫 user 메시지를 `[image 블록(base64 PNG), text 블록]` 으로 보낸다. 이후 턴에는 새로 찍지 않는다.
- **FR-2 (안내 문장)**: 캡처를 붙였을 때 text 블록 끝에 `첨부: 할 일을 시작할 때의 현재 탭 화면이다. 화면 파악에만 쓰고, 클릭·입력은 snapshot 의 ref 로 한다.` 한 줄을 붙인다. 안 붙였으면 지금 문장 그대로(문자열 content).
- **FR-3 (실패 시 텍스트만)**: 캡처가 실패하면(`ok: false` 또는 throw) 지금처럼 텍스트만 보내고 run 은 그대로 진행한다. 로그는 `warn` 1줄(사유만). 캡처가 **5초** 안에 끝나지 않아도 실패로 보고 텍스트만 보낸다(`Promise.race` 타임아웃, 늦게 온 캡처 결과는 버린다) — 기본이 켬이라 모든 run 시작이 이 경로를 지난다.
- **FR-4 (켜고 끄기)**: 환경변수 `MYBROWSER_FIRST_SCREENSHOT`(`'0' | '1'`, 선택). 없으면 **켬**(기본), `'0'` 이면 끔. 그 밖의 값은 시작 시 실패.
- **FR-5 (평가 기록)**: `pnpm eval` 결과 `report.json`(픽스처·사이트 세트 모두)에 `firstScreenshot: boolean` 을 적는다 — `cli.mjs` 가 `process.env.MYBROWSER_FIRST_SCREENSHOT !== '0'` 로 정한다. 평가 앱은 셸 환경변수를 그대로 물려받으므로 `MYBROWSER_FIRST_SCREENSHOT=0 pnpm eval -- --real --yes-spend --set sites` 로 끈 쪽을 잰다.

### 안전 요구사항
- **SR-1**: 가드·승인 흐름(`guard.ts`, 승인 대기)은 바꾸지 않는다. 캡처는 읽기(화면 찍기)만 하고 페이지를 조작하지 않는다.
- **SR-2**: 캡처 이미지는 모델 요청에만 쓰고 DB(runs·steps)·로그·파일에 남기지 않는다.
- **SR-3**: 비밀번호 입력칸은 브라우저가 가린 채로 찍힌다(값을 따로 읽지 않는다) — 기존 SR(비밀번호 미입력)과 충돌 없음.

### 비기능 요구사항 / 제약
- 토큰: 1280×800 캡처 1장 ≈ 입력 1.4k 토큰, 이후 턴마다 대화 기록으로 다시 보낸다(캐시 적용). 실측은 spec 020 세트로 사용자가 명령할 때만(비용).
- 이미지 블록은 첫 user 메시지에만 있고 `clear_tool_uses`(도구 결과 정리)는 건드리지 않는다.
- 위험: 사내 GenAI 프록시(dev)·게이트웨이(prod)가 user 메시지의 image 블록을 거부할 수 있다 — 미검증. 거부되면 `MYBROWSER_FIRST_SCREENSHOT=0` 으로 끄고 보고한다. 구현·검증 중 실제 API 는 부르지 않는다.

### 범위 제외 (Out of Scope)
매 턴 최신 캡처, 이어 말하기(같은 run 의 두 번째 메시지) 캡처, 캡처 크기·화질 조절, prod 게이트웨이 쪽 변경, 효과 실측(사용자 명령 시).

---

## 2. 설계 개요

### 영향받는 프로세스 / 파일
- `src/main/env.ts` — `MYBROWSER_FIRST_SCREENSHOT: z.enum(['0','1']).optional()` → `IEnv.isFirstScreenshotEnabled: boolean` (없으면 true)
- `src/main/agent/prompts/system.ts` — `buildFirstUserMessage` 는 그대로. 새 `buildFirstUserContent({ text, screenshot }): string | TFirstUserBlock[]` — screenshot 이 있으면 `[ { type:'image', source:{ type:'base64', media_type:'image/png', data } }, { type:'text', text: text + '\n\n' + FIRST_SCREENSHOT_NOTE } ]`, 없으면 text 문자열. 상수 `FIRST_SCREENSHOT_NOTE` export.
- `src/main/agent/loop.ts` — `IRunAgentLoopOptions.firstUserMessage: string | TFirstUserBlock[]` (그대로 `messages[0].content`)
- `src/main/agent/service.ts` — `IAgentServiceDeps.isFirstScreenshotEnabled?: boolean`(없으면 false — 기존 단위 테스트 유지). `runLoopFor` 에서 켜져 있으면 `session.driver.takeScreenshot()` → 성공이면 pngBase64 를 `buildFirstUserContent` 에 넘김, 실패·throw·5초 타임아웃이면 `log.warn` 후 텍스트만.
- `src/main/index.ts` — `isFirstScreenshotEnabled: env.isFirstScreenshotEnabled`
- `src/main/agent/fake/fakeFetch.ts` — text 자리표시자 `{{firstImage}}` → 첫 user 메시지 content 에 image 블록이 있으면 `있음`, 없으면 `없음` (e2e 확인용, `{{skillNames}}` 와 같은 방식)
- `e2e/fixtures/model/first-image-echo.json` (신규) — `첫 화면 캡처: {{firstImage}}` 텍스트 1턴
- `eval/cli.mjs`, `eval/report.ts` — report.json 에 `firstScreenshot`
- 문서: `docs/DESIGN.md` §3 모델·API 에 한 줄

### IPC 계약
변경 없음

### 도구 계약
변경 없음 (도구 목록·스키마 그대로. 첫 메시지 content 만 바뀐다)

### 데이터
DB 변경 없음

### 열린 질문
없음 — 사용자 확정(2026-11-13): Enter 1번 = 캡처 1장, 자동(기본 켬).

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 **테스트와 검증이 모두 에러 0**이 될 때까지 수정 → 재실행을 반복하고, 전부 통과했을 때만 체크박스를 채우고 **Task 단위로 커밋**한 뒤 다음 Task 로 진행한다.
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**

- [x] **Task 1: env·첫 메시지 content·service 캡처**
  - **묶음**: 기반
  - **작업**: FR-1~4 — env, `buildFirstUserContent`, loop 타입, service 캡처·실패·타임아웃 처리, index.ts 연결. `IAgentLog` 에 `warn(scope: string, message: string, meta?: unknown): void` 를 추가한다(`src/main/log.ts` 의 `log.warn` 과 같은 모양). `service.test.ts` 의 `setup()` 의 log 는 `{ error: vi.fn(), warn: vi.fn() }` 로 바꾼다. 캡처 실패 warn 의 meta 는 `{ reason }` 만 싣고 pngBase64·요청 본문은 넣지 않는다(SR-2).
  - **파일**: `src/main/env.ts`, `src/main/agent/prompts/system.ts`, `src/main/agent/loop.ts`, `src/main/agent/service.ts`, `src/main/index.ts`, `src/main/__tests__/env.test.ts`, `src/main/agent/prompts/__tests__/system.test.ts`, `src/main/agent/__tests__/service.test.ts`
  - **테스트**:
    - `env.test.ts` — 없으면 `isFirstScreenshotEnabled: true` / `'0'` → false / `'1'` → true / `'yes'` 면 시작 실패
    - `system.test.ts` — (기존 유지) + screenshot 이 있으면 `[image(base64·image/png·data), text(본문 + 안내 문장)]` 순서 / 없으면 기존 문자열과 같다
    - `service.test.ts` — (기존 유지, 기본 deps 는 끔) + 켬이고 캡처 성공 → 첫 요청 `messages[0].content[0]` 이 image 블록(data = 가짜 드라이버 pngBase64), `[1]` text 끝이 안내 문장, `takeScreenshot` 1회(도구 여러 턴 뒤에도 1회) / 켬이고 `ok:false` → content 문자열·run 계속·log.warn 1회 / 켬이고 throw → content 문자열·run 계속 / 켬이고 `takeScreenshot` 이 resolve 되지 않으면(fake timers 로 5초 진행) content 문자열·run 계속 / 끔 → `takeScreenshot` 0회
  - **실행**: `pnpm test src/main/__tests__/env.test.ts src/main/agent/prompts/__tests__/system.test.ts src/main/agent/__tests__/service.test.ts`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 할 일 시작 시 현재 탭 캡처를 첫 메시지에 첨부 (spec 021 Task 1)`

- [x] **Task 2: 가짜 모델 자리표시자·e2e**
  - **묶음**: 기반
  - **작업**: `{{firstImage}}` 자리표시자, 시나리오 파일, e2e
  - **파일**: `src/main/agent/fake/fakeFetch.ts`, `src/main/agent/fake/__tests__/fakeFetch.test.ts`, `e2e/fixtures/model/first-image-echo.json`, `e2e/first-screenshot.spec.ts`
  - **테스트**:
    - `fakeFetch.test.ts` — 첫 user content 에 image 블록이 있으면 `{{firstImage}}` → `있음`, 문자열 content 면 `없음`
    - `e2e/first-screenshot.spec.ts` — `fakeScenario: 'first-image-echo'` 로 로컬 픽스처(`basic.html`)에서 실행 → 실행 결과에 `첫 화면 캡처: 있음` ('있음' 케이스는 `test.use({ appEnv: { MYBROWSER_FIRST_SCREENSHOT: undefined } })` 로 셸 값을 지우고 기본 켬을 확인한다) / `appEnv: { MYBROWSER_FIRST_SCREENSHOT: '0' }` 면 `첫 화면 캡처: 없음`
  - **실행**: `pnpm test src/main/agent/fake/__tests__/fakeFetch.test.ts` + `make e2e SPEC=e2e/first-screenshot.spec.ts`
  - **검증**: `desktop/app-check` — 가짜 모델로 위 두 흐름, 콘솔·main 에러 0 + e2e 통과. 기존 `e2e/agent-*.spec.ts` 가 기본 켬 상태로 그대로 통과
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 가짜 모델 첫 화면 자리표시자와 캡처 첨부 e2e (spec 021 Task 2)`

- [x] **Task 3: 평가 기록·문서**
  - **묶음**: 기반
  - **작업**: FR-5, DESIGN.md 한 줄, `eval/cli.mjs` 머리 주석에 끈 쪽 실행법
  - **파일**: `eval/report.ts`, `eval/cli.mjs`, `eval/__tests__/report.test.ts`, `docs/DESIGN.md`
  - **테스트**:
    - `report.test.ts` — (기존 유지) + `writeReportJson`·`writeSiteReportJson` 에 `firstScreenshot` 을 주면 report.json 에 그 값이 있다
  - **실행**: `pnpm test eval/__tests__` + `pnpm eval`(가짜 7/7)
  - **검증**: `pnpm type-check` + 단위 테스트 + `pnpm eval`
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 평가 결과에 첫 화면 캡처 여부 기록 (spec 021 Task 3)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
| 2026-11-13 | 1 | env +4 · system +2 · service +6 (캡처 성공·1회·실패·throw·5초 초과·끔) | bf97f5b | 직접 방식 (워크트리 021-base) |
| 2026-11-13 | 2 | fakeFetch +2 · e2e/first-screenshot 2 | a358247 | |
| 2026-11-13 | 3 | report +2 · `pnpm eval` 가짜 7/7 (report.json firstScreenshot: true) | b4fb514 | |
| 2026-11-13 | 검증 | make check 통과 · make e2e 64 passed · 에러 0 | 검증 반영 커밋 | 검증 2회가 겹쳐 돈 회차에서 agent-approval 1건 창 대기 시간 초과 → 단독 재실행 9/9 통과. 실제 API(사내 프록시가 image 블록을 받는지)는 미확인 |

