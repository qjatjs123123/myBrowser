# Spec: 실제 사이트 평가 세트 — 성공률·비용 측정

> **상태**: ✅ 완료
> **생성일**: 2026-11-13
> **묶음**: agent-budget, eval-sites
> **관련 spec**: 005 (평가 세트), 007 (모델 프로필), 008 (e2e 외부 요청 차단), 015 (에이전트 정확도)
> **번호 변경**: 작업 중 다른 세션이 dev 에 spec 019(입력창 추천 문구)를 먼저 합쳐 이 spec 은 020 으로 옮겼다 — 이 기능의 묶음·Task 커밋 메시지는 `(spec 019 …)` 로 남아 있다 (커밋 76dc6db·c1b9f13·52dbddf·453bde4·8f11958·10f0e0c).
> **설계 참조**: docs/DESIGN.md §5 로드맵 (단계 6 원가 실측)

---

## 1. 요구사항

### 배경 / 목적
사용자 (2026-11-13): 브라우저 에이전트에서 가장 필요한 것 = 실제 사이트에서 일을 끝내는 비율을 재고 올리는 것. 지금 `pnpm eval` 은 로컬 픽스처 7개(가짜 모델)만 있어 실제 사이트 성공률·단계 수·토큰을 모른다 (기록된 실제 run 은 코레일 1건, 60회 한도 실패·입력 2.8M). 이번 spec 은 **측정 도구**를 만든다 — 실측 실행(비용)은 사용자가 따로 명령한다.

사용자 결정: 로그인 불필요 작업만 / 규칙 판정 + 사람 확인 / 작업당 3회 반복 + run 별 입력 토큰 상한.

### 기능 요구사항
- **FR-1 (입력 토큰 상한)**: 환경변수 `MYBROWSER_MAX_INPUT_TOKENS`(양의 정수, 선택)가 있으면, 한 run 의 누적 입력 토큰이 이 값을 넘는 순간 그 run 을 `failed` 로 끝내고 사유 `입력 토큰 한도({N})를 넘었습니다` 를 남긴다 (도구 호출 한도와 같은 방식). 없으면 지금처럼 상한 없음.
- **FR-2 (실제 사이트 시나리오)**: `eval/siteScenarios.ts` 에 로그인 없이 되는 실제 사이트 작업 10개 내외를 둔다. 각 시나리오: `id`, `task`(사이드바 입력), `startUrl`(시작 페이지), `judge`(판정 규칙: 허용 끝 상태 목록 `statusList`, 답에 들어가야 할 낱말 `keywordList`(하나라도), 끝 URL 패턴 `urlPattern`(선택), 최소 승인 창 수 `minApprovals`(선택)).
- **FR-3 (실행)**: `pnpm eval -- --real --yes-spend --set sites [--repeat N]` 로 실제 사이트 세트를 dev 프로필(사내 GenAI 프록시)로 돌린다. `--set sites` 는 `--real` 없이 쓰면 거부(종료 코드 2, `EVAL_MESSAGE.needRealForSites`). `--set` 값이 `sites` 가 아니거나 값이 없으면 종료 코드 2(`EVAL_MESSAGE.unknownSet`). `--repeat` 기본 3, 1~10 정수 — 그 밖이면 종료 코드 2, `--set sites` 없이 `--repeat` 를 쓰면 종료 코드 2. sites 세트의 종료 코드는 결과 줄 수가 시나리오 수 × repeat 와 같으면 0, 아니면 1 (판정 결과와 무관). 실행마다 깨끗한 임시 프로필, `MYBROWSER_MAX_INPUT_TOKENS=1500000`.
- **FR-4 (기록)**: `cli.mjs` 가 playwright 를 띄우기 **전에** `eval/results/{YYYYMMDD-HHmmss}/` 를 만들고 env `MYBROWSER_EVAL_OUT_DIR` 로 러너에 넘긴다. 러너는 실행 1회마다 그 디렉터리에 결과 JSON + 끝난 시점의 활성 탭 스크린샷(`{id}-{n}.png`) + 단계 로그(`{id}-{n}.steps.json` — steps 행의 n·tool·status·summary)를 남긴다. `cli.mjs` 는 끝난 뒤 같은 디렉터리에 `report.json` 을 쓴다. 결과 1줄(`SiteResultSchema`): id, 회차, 판정(성공/실패/확인 필요), 끝 상태, 답(summary/reason), 끝 URL, 도구 호출 수, 승인 창 수, 입력/출력 토큰, 걸린 시간, 오류(`error`, 선택). `sites.eval.ts` 는 판정과 관계없이 결과 줄만 쓰고 판정을 assert 하지 않는다. 오류(앱 실행·errorList·시작 페이지 열기 실패 등)로 끝난 회차도 `error` 열을 채워 결과 줄을 남긴다.
- **FR-5 (판정)**: 규칙 판정 — 끝 상태가 `statusList` 에 없거나 실행 오류면 `실패`. 상태가 맞고 `keywordList`·`urlPattern`·`minApprovals` 가 모두 맞으면 `성공`. 상태는 맞는데 나머지가 하나라도 안 맞으면 `확인 필요`(사람이 스크린샷·단계 로그로 판정).
- **FR-6 (집계 보고)**: stdout 에 시나리오별 표 — 성공/확인 필요/실패 수(`2/0/1`), 평균 도구 호출 수, 평균 입력·출력 토큰, 평균 시간 — 와 전체 성공률·합계 토큰. 같은 내용이 결과 JSON 의 `summary` 에 들어간다.
- **FR-8 (모델 접속 값 전달)**: 평가 앱은 e2e fixtures 로 떠서 `NODE_ENV=test` 라 앱이 `.env` 를 읽지 않는다 (기존 `--real` 도 같은 문제). `--real` 이면 `cli.mjs` 가 `.env` 를 `node:util` `parseEnv` 로 읽어 `ANTHROPIC_API_KEY`·`ANTHROPIC_BASE_URL` **두 키만**, 셸 환경변수에 없을 때 자식 env 에 넣는다 (셸 값 우선). 고르는 로직은 `eval/cliArgs.ts` 의 순수 함수 `pickModelEnv({ dotEnv, processEnv })`. 값은 출력·로그하지 않는다.
- **FR-7 (기존 평가 유지)**: `--set` 없는 `pnpm eval` / `pnpm eval -- --real --yes-spend` 는 지금 그대로(픽스처 7개).

### 안전 요구사항
- **SR-1**: 실제 사이트 세트는 **모든 승인 창에 [거부]** 로 답한다 (시나리오별 승인 답 설정 없음 — 코드에서 고정). 실제 예약·결제·주문·전송은 일어나지 않는다.
- **SR-2**: 가드·승인 흐름(`guard.ts`, 승인 대기)은 바꾸지 않는다. FR-1 은 run 을 **끝내는** 방향만 추가한다.
- **SR-3**: 외부 요청 차단(spec 008)은 e2e 기본값 그대로 켜 두고, 평가 러너의 실제 사이트 세트에서만 fixture 옵션으로 끈다. vitest·e2e·CI·품질 게이트는 실제 사이트에 접속하지 않는다.
- **SR-4**: 로그인·비밀번호가 필요한 작업은 넣지 않는다. 질문 카드가 뜨면 첫 선택지를 누르고, 결과는 그대로 판정한다.

### 비기능 요구사항 / 제약
- 실제 사이트 세트 실행은 **비용 발생** — 사용자가 명시적으로 실행할 때만. 구현·검증 단계에서 돌리지 않는다.
- 시나리오당 시간 상한은 기존 real 설정(600s) 그대로.
- `eval/report.ts`·`eval/cliArgs.ts`·`eval/siteJudge.ts`·`eval/siteScenarios.ts` 는 `eval/cli.mjs` 가 Node type stripping 으로 부르므로 지울 수 있는 TS 문법만, 로컬 import 는 `.ts` 확장자를 붙이고 경로 alias 를 쓰지 않는다 (기존 파일 머리 주석).

### 범위 제외 (Out of Scope)
로그인 필요 작업·로그인된 프로필 재사용, LLM 채점, CI 정기 실행, 실패 원인 자동 분류, 에이전트 정확도 개선 자체(측정 결과를 보고 다음 spec 에서).

---

## 2. 설계 개요

### 영향받는 프로세스 / 파일
- main (묶음 agent-budget):
  - `src/main/env.ts` — `MYBROWSER_MAX_INPUT_TOKENS: z.coerce.number().int().positive().optional()` → `IEnv.maxInputTokens?: number`
  - `src/main/agent/service.ts` — `IAgentServiceDeps.maxInputTokens?: number`. `addUsage` 뒤 누적 입력 토큰이 상한을 넘으면 `countToolCall` 의 한도 처리와 같은 방식(`endRun(fail, reason)` + `halt(failed)`)으로 끝낸다. 메시지 상수는 `src/main/agent/service.ts` 안에.
  - `src/main/index.ts` — 공유 파일이라 묶음에서 고치지 않는다 → Task 5(합친 뒤 메인)에서 `maxInputTokens: env.maxInputTokens` 연결
- eval (묶음 eval-sites):
  - `e2e/fixtures.ts` — fixture 옵션 `allowExternalRequests: boolean`(기본 false). true 면 `blockExternalRequests` 를 건너뛴다.
  - `eval/cliArgs.ts` — `--set sites`(real 필수, 아니면 code 2 `EVAL_MESSAGE.needRealForSites`), `--repeat N`(1~10, 틀리면 code 2). env 로 `MYBROWSER_EVAL_SET=sites`, `MYBROWSER_EVAL_REPEAT=N` 을 러너에 넘긴다.
  - `eval/siteScenarios.ts` (신규) — FR-2 목록 (`ISiteScenario`). 초기 작업 예: 네이버 날씨·환율, 네이버 지도 장소 검색, 코레일 열차 시간 조회, 다나와 최저가, 11번가 상품 검색, 위키백과 사실 조회, 카카오맵 대중교통 소요 시간, 야놀자 숙소 최저가, 쇼핑몰 장바구니 담기 직전(승인 창 거부) — 실제 목록은 구현 시 사이트 접근성을 보고 10개 내외로.
  - `eval/siteJudge.ts` (신규, 순수) — `SiteResultSchema`/`TSiteResult`(FR-4 의 열 + `judgement`), `parseSiteResultLines(text)`(틀린 줄이면 throw), `judgeSiteRun(judge, observed): '성공' | '확인 필요' | '실패'`, `summarizeSiteResults(resultList)` (시나리오별 집계 + 전체), `convertSiteToMarkdown(summary)`. `cli.mjs` 가 직접 부른다 (type stripping 제약).
  - `eval/sites.eval.ts` (신규) — `MYBROWSER_EVAL_SET=sites` 일 때만 테스트를 만든다(아니면 0개). 시나리오 × 회차마다 앱 실행(`allowExternalRequests: true`, REAL_APP_ENV + `MYBROWSER_MAX_INPUT_TOKENS`) → 시작 URL 로 이동(`eval/drive.ts` 의 사이트용 열기: 주소창에 `startUrl` 입력 + Enter → `findTabPage(app, startUrl 의 host)` 가 잡히고 `domcontentloaded` 까지 기다림, 제목 비교 안 함. 실패하면 `error: '시작 페이지 열기 실패'` 결과 줄) → 할 일 입력 → 승인은 항상 거부·질문은 첫 선택지 → 끝 상태 → 활성 탭 스크린샷·끝 URL → 앱 닫고 DB 에서 run(status·summary·reason·usage)·steps 읽기 → `MYBROWSER_EVAL_OUT_DIR` 에 png·steps.json, 결과 파일에 결과 1줄. `agent.eval.ts` 의 끝까지 진행 로직(`driveUntilEnd` 등)은 공용 모듈로 빼서 함께 쓴다 (`eval/drive.ts`).
  - `eval/agent.eval.ts` — `MYBROWSER_EVAL_SET=sites` 이면 테스트 0개(기존 세트와 섞이지 않게), 공용 모듈 사용.
  - `eval/report.ts` — run 의 summary·reason 과 steps 목록을 읽는 함수 추가, 세트별 결과 디렉터리 쓰기.
  - `eval/cli.mjs` — spawn 전에 결과 디렉터리를 만들어 `MYBROWSER_EVAL_OUT_DIR` 로 넘긴다. 세트가 sites 면 `parseSiteResultLines` → 사이트 집계 표·`report.json`(summary 포함)·FR-3 종료 코드, 아니면 기존 표·기존 종료 코드(기존 세트도 같은 디렉터리의 `report.json`). 가짜 세트의 시작 페이지 열기는 기존 제목 방식 유지.
- 문서: `docs/DESIGN.md` §5 단계 6 에 「실제 사이트 평가 세트(spec 020)」 한 줄, `README` 류 사용법은 `eval/` 머리 주석으로.

### IPC 계약
변경 없음

### 도구 계약
변경 없음

### 데이터
DB 변경 없음. 결과 파일: `eval/results/{YYYYMMDD-HHmmss}/{report.json, {id}-{n}.png, {id}-{n}.steps.json}` — `.gitignore` 에 `eval/results/*/` 추가.

### 묶음 간 계약 (병렬)
- 환경변수 이름 `MYBROWSER_MAX_INPUT_TOKENS`, 실패 사유 문구 `입력 토큰 한도({N})를 넘었습니다` — eval-sites 는 이름만 쓰고 main 코드를 import 하지 않는다.
- 두 묶음은 겹치는 파일이 없다 (agent-budget: `src/main/{env,agent/service}.ts` 와 그 테스트, eval-sites: `eval/**`, `e2e/fixtures.ts`, `e2e/fixtures/__tests__/`, `.gitignore`).
- **공유 파일 요청**: `src/main/index.ts` 의 `createAgentService({...})` 에 `maxInputTokens: env.maxInputTokens` 한 줄 — 메인이 두 묶음을 합친 뒤 Task 5 로 반영하고 `e2e/agent-budget.spec.ts` 로 검증한다.

### 열린 질문
없음

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 **테스트와 검증이 모두 에러 0**이 될 때까지 수정 → 재실행을 반복하고, 전부 통과했을 때만 체크박스를 채우고 **Task 단위로 커밋**한 뒤 다음 Task 로 진행한다.
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**

- [x] **Task 1: run 입력 토큰 상한**
  - **묶음**: agent-budget
  - **작업**: FR-1 — env 스키마·`IEnv`, service deps·상한 처리 (deps 가 optional 이라 index.ts 연결 없이도 green — 연결은 Task 5)
  - **파일**: `src/main/env.ts`, `src/main/agent/service.ts`, `src/main/__tests__/env.test.ts`, `src/main/agent/__tests__/service.test.ts`
  - **테스트**:
    - `src/main/__tests__/env.test.ts` — `MYBROWSER_MAX_INPUT_TOKENS=1500000` → `maxInputTokens: 1500000` / 없으면 undefined / `0`·`-1`·`abc`·`1.5` 는 시작 실패
    - `src/main/agent/__tests__/service.test.ts` — 상한 1000 에서 첫 응답 usage 600 → 계속, 두 번째 600(누적 1200) → run `failed`, reason `입력 토큰 한도(1000)를 넘었습니다`, 다음 모델 호출 없음, usage_json 에 1200 / 상한 없으면 큰 usage 에도 계속
  - **실행**: `pnpm test src/main/__tests__/env.test.ts src/main/agent/__tests__/service.test.ts`
  - **검증**: `pnpm type-check` + 단위 테스트 + `make e2e SPEC=e2e/agent-mvp.spec.ts` (기존 가짜 모델 흐름 영향 없음)
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: run 입력 토큰 상한 MYBROWSER_MAX_INPUT_TOKENS (spec 020 Task 1)`

- [x] **Task 2: 평가 인자·판정·집계 (순수)**
  - **묶음**: eval-sites
  - **작업**: FR-3 인자, FR-5 판정, FR-6 집계, FR-2 시나리오 목록
  - **파일**: `eval/cliArgs.ts`, `eval/siteJudge.ts`, `eval/siteScenarios.ts`, `eval/__tests__/{cliArgs,siteJudge,siteScenarios}.test.ts`
  - **테스트**:
    - `eval/__tests__/cliArgs.test.ts` — (기존 유지) + `--set sites` 단독 → code 2 / `--real --yes-spend --set sites` → env `MYBROWSER_EVAL_SET=sites`, `MYBROWSER_EVAL_REPEAT=3` / `--repeat 5` → 5 / `--repeat 0`·`11`·`x` → code 2 / `pickModelEnv` — 셸에 없는 키만 .env 값으로 채우고 두 키 외는 무시, 셸 값이 있으면 셸 값 / `--set foo`·값 없는 `--set` → code 2 (`unknownSet`) / `--set sites` 없이 `--repeat 3` → code 2 / `--set`·`--repeat` 와 그 값은 playwright 인자로 넘기지 않음 / `--set` 없으면 기존과 같은 결과
    - `eval/__tests__/siteJudge.test.ts` — 상태 불일치 → 실패 / 오류 → 실패 / 상태·낱말·URL·승인 모두 맞음 → 성공 / 상태만 맞고 낱말 없음 → 확인 필요 / urlPattern 없으면 URL 검사 생략 / `parseSiteResultLines` — 정상 줄 파싱, 형식이 틀린 줄이면 throw / 집계: 시나리오별 성공·확인 필요·실패 수, 평균 도구 호출·토큰·시간(null 시간 제외), 전체 성공률
    - `eval/__tests__/siteScenarios.test.ts` — id 중복 없음·kebab-case, startUrl 이 https, statusList 비어 있지 않음, 시나리오에 승인 답 필드가 없음(SR-1), `SITE_APPROVAL_ANSWER === 'denied'`, 8개 이상
  - **실행**: `pnpm test eval/__tests__`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 실제 사이트 평가 인자·판정·시나리오 (spec 020 Task 2)`

- [x] **Task 3: 실제 사이트 러너·보고**
  - **묶음**: eval-sites
  - **작업**: FR-3 러너, FR-4 기록, FR-6 보고, FR-7 유지, FR-8 전달, SR-1·SR-3. `eval/drive.ts` 의 끝까지 진행 함수는 승인 답을 인자 `approvalAnswer` 로 받고, `SITE_APPROVAL_ANSWER = 'denied' as const` 는 순수 모듈 `eval/siteScenarios.ts`(Task 2)에 정의·export 하고, `sites.eval.ts` 는 그것을 import 해 `drive.ts` 에 넘긴다. `cli.mjs` 는 sites 종료 코드를 위해 `./siteScenarios.ts` 의 `SITE_SCENARIO_LIST.length` 와 `command.env.MYBROWSER_EVAL_REPEAT` 를 `getSiteExitCode`(report.ts, 순수)에 넘긴다
  - **파일**: `e2e/fixtures.ts`, `e2e/fixtures/__tests__/externalRequests.test.ts`, `eval/drive.ts`, `eval/sites.eval.ts`, `eval/agent.eval.ts`, `eval/report.ts`, `eval/cli.mjs`, `.gitignore`, `eval/__tests__/{report,sitesSafety}.test.ts`
  - **테스트**:
    - `eval/__tests__/report.test.ts` — (기존 유지) + 임시 sqlite(마이그레이션 SQL 적용)에 run·steps 를 넣고 summary·reason·steps 목록을 읽는다 / 사이트 결과 디렉터리에 report.json(`summary` 포함)을 쓴다 / 사이트 집계 마크다운 표 형식
    - `report.test.ts` — 기존 `writeReportJson`·`getResultFileName` 테스트 2개는 FR-4 의 새 위치로 **바꾼다**: `getResultDirName(date)` 가 `20260102-030405` 를 돌려주고, `writeReportJson({ dir })` 은 `{dir}/report.json` 에 쓴다 (FR-4 에 따른 기대값 변경 — 약화 아님). 나머지 기존 테스트는 그대로 / `getSiteExitCode({ lineCount, scenarioCount, repeat })` — 같으면 0, 다르면 1
    - `eval/__tests__/sitesSafety.test.ts` (SR-1) — `sites.eval.ts` 는 **import 하지 않고**(playwright 러너 밖) 소스를 문자열로 읽어 `'agent'`·`'user_done'`·`onApproval` 이 없고 `SITE_APPROVAL_ANSWER` 를 `./siteScenarios` 에서 import 하는지 확인 + `siteScenarios.ts` 를 import 해 `SITE_APPROVAL_ANSWER === 'denied'`
    - `e2e/fixtures/__tests__/externalRequests.test.ts` (vitest) — `e2e/**/*.spec.ts` 어디에도 `allowExternalRequests` 문자열이 없고, `eval/` 에서는 `eval/sites.eval.ts` 에만 있다 (SR-3)
    - 기존 `pnpm eval`(가짜 모델 7개) 그대로 통과 — `allowExternalRequests` 기본값 false 로 외부 차단 유지 확인
  - **실행**: `pnpm test eval/__tests__ e2e/fixtures/__tests__` + `pnpm eval`
  - **검증**: `pnpm type-check` + 단위 테스트 + `pnpm eval`(가짜 모델, 비용 없음) 7/7 + `make e2e`(fixtures 변경 회귀). **`--set sites` 실제 실행은 하지 않는다** (비용 — 사용자 명령 시).
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 실제 사이트 평가 러너·결과 기록 (spec 020 Task 3)`

- [x] **Task 4: 문서**
  - **묶음**: eval-sites
  - **작업**: DESIGN.md §5 한 줄, `eval/cli.mjs` 머리 주석에 사용법
  - **파일**: `docs/DESIGN.md`, `eval/cli.mjs`
  - **테스트**: 코드 변경 없음 — `pnpm test eval/__tests__`
  - **실행**: `pnpm test eval/__tests__`
  - **검증**: `pnpm type-check`
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `docs: 실제 사이트 평가 세트 사용법 (spec 020 Task 4)`

- [x] **Task 5: 입력 토큰 상한 연결 (합친 뒤 메인)**
  - **묶음**: 합친 뒤 (메인 — 공유 파일 `src/main/index.ts`)
  - **작업**: `createAgentService({...})` 에 `maxInputTokens: env.maxInputTokens`
  - **파일**: `src/main/index.ts`, `e2e/agent-budget.spec.ts`
  - **테스트**:
    - `e2e/agent-budget.spec.ts` — `test.use({ fakeScenario: 'search-read', appEnv: { MYBROWSER_MAX_INPUT_TOKENS: '15' } })` (가짜 응답은 턴당 입력 10 토큰) → 상태 배지 `실패`, 사유 `입력 토큰 한도(15)를 넘었습니다` 표시, 두 번째 턴의 도구 step 이 끝까지 실행되지 않음
  - **실행**: `make e2e SPEC=e2e/agent-budget.spec.ts`
  - **검증**: `desktop/app-check` — 가짜 모델로 위 흐름, 콘솔·main 에러 0 + e2e 통과
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 입력 토큰 상한 연결 (spec 020)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
| 2026-11-13 | 1 | env +4 · service +2 | 76dc6db | 워크트리 agent-budget |
| 2026-11-13 | 2 | cliArgs +13 · siteJudge 16 · siteScenarios 6 | c1b9f13 | 워크트리 eval-sites (도우미 중단 → 메인이 이어서) |
| 2026-11-13 | 3 | report +7 · sitesSafety 6 · externalRequests 2 · `pnpm eval` 가짜 7/7 | 52dbddf | stopped_before_confirm 은 새 전이가 없어 시나리오 끝 상태는 done 만 |
| 2026-11-13 | 4 | 문서만 | 453bde4 | |
| 2026-11-13 | 5 | e2e/agent-budget 1 | 8f11958 | 합친 뒤 메인 |
| 2026-11-13 | 검증 | make check 통과 · make e2e 60 passed · 에러 0 | 검증 반영 커밋 | 실제 사이트 실행(`--set sites`)은 하지 않음 — 비용, 사용자 명령 시 |

