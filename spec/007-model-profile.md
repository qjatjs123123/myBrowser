# Spec: 모델 프로필 전략 (MYBROWSER_PROFILE=dev|prod)

> **상태**: 📝 계획됨
> **생성일**: 2026-11-06
> **묶음**: 기반
> **관련 spec**: 003, 004, 005, 006
> **설계 참조**: docs/DESIGN.md §2 (모델 호출 경로)

---

## 1. 요구사항

### 배경 / 목적
개발 중 사내 GenAI(LiteLLM) 프록시로 모델을 부르자 두 가지가 깨졌다 — ① `.env` 에 `ANTHROPIC_BASE_URL` 이 빠지면 프록시 키가 조용히 `api.anthropic.com` 으로 가 401, ② 프록시가 `computer_toolset_20260801` 항목에 `name` 을 붙여 Bedrock 이 400(`name is not accepted on a toolset entry`), `fallbacks: 'default'` 도 LiteLLM 이 자기 fallback 옵션으로 오해한다. 지금 모델 경로는 `fake | gateway | direct` 를 플래그 조합으로 **암묵 판정**하고, 요청 옵션·도구 구성은 경로와 무관하게 하드코딩이다.
→ 모델 경로를 **전략(프로필)** 으로 묶어 env 로 갈아끼운다: `dev` = 사내 GenAI 프록시, `prod` = Claude API 비즈니스 버전(게이트웨이 + 구독 기기 토큰). 콘솔 키 직접 호출(direct)은 없앤다 (사용자 결정 2026-11-06).

### 기능 요구사항
- **FR-1**: 프로필은 위에서부터 첫 일치로 정한다 — `MYBROWSER_FAKE_MODEL=1` → `fake` / 패키징된 앱 → `prod` (`MYBROWSER_PROFILE` 무시) / 그 외 `MYBROWSER_PROFILE` 값(`dev`|`prod`).
- **FR-2**: 패키징·fake 가 아닌데 `MYBROWSER_PROFILE` 이 없거나 `dev|prod` 가 아니면 시작 시점에 `환경변수가 올바르지 않습니다: MYBROWSER_PROFILE` 로 실패한다 (기본값 없음 — 반드시 명시).
- **FR-3**: `dev` 프로필은 `ANTHROPIC_API_KEY` + `ANTHROPIC_BASE_URL` 로 부른다. `ANTHROPIC_BASE_URL` 이 없으면 시작 시점에 `환경변수가 올바르지 않습니다: ANTHROPIC_BASE_URL` 로 실패한다. 키가 없으면 지금처럼 run 시작 시 `AGENT_MESSAGE.missingApiKey`. 재시도는 SDK 기본(2).
- **FR-4**: `dev` 모델 id 는 `MYBROWSER_MODEL ?? 'bedrock.anthropic.claude-opus-5-5'` (날짜 접미사 금지 검증 유지).
- **FR-5**: `dev` 요청은 `fallbacks` 를 보내지 않고, `betas` 는 `context-management-2025-06-27` 만 보낸다. 도구 목록에 픽셀 computer toolset 을 넣지 않는다 (구조 도구 15개는 그대로).
- **FR-6**: `prod` 프로필은 지금의 gateway 경로 그대로다 — 기기 토큰 + `gatewayUrl`(런타임 `MYBROWSER_GATEWAY_URL` → 빌드 상수), 재시도 0, 모델 `claude-opus-5-5` 고정, `betas`·`fallbacks: 'default'`·computer toolset 포함. `ANTHROPIC_API_KEY`·`ANTHROPIC_BASE_URL`·`MYBROWSER_MODEL` 은 무시한다. 401/402/429 구독 문장·계정 해제(spec 005 FR-6)도 그대로.
- **FR-7**: `fake` 프로필은 지금과 요청·도구가 같다 (e2e 회귀 없음).
- **FR-8**: `MYBROWSER_GATEWAY_URL` 만으로는 더 이상 gateway 로 바뀌지 않는다 — `prod` 일 때만 쓰인다.
- **FR-9**: 시작 로그에 프로필과 모델 id 를 남긴다 — `시작 (development, profile=dev, model=bedrock.anthropic.claude-opus-5-5)`. 키·주소는 싣지 않는다.

### 안전 요구사항
- **SR-1**: 가드(`guard.ts`)·승인 흐름·`checkGuard` 호출 경로는 바뀌지 않는다. 프로필은 도구를 **빼기만** 하고 새 도구를 더하지 않는다.
- **SR-2**: 키·기기 토큰은 프로필의 `createClient()` 안에서만 SDK 에 넘긴다 — 프로필 객체의 다른 필드·로그·이벤트·DB 에 싣지 않는다 (spec 003 SR-6, spec 005 SR-1).
- **SR-3**: 설치판은 `.env` 를 읽지 않고(spec 005 SR-3) 항상 `prod` — dev 설정이 배포에 새지 않는다.

### 비기능 요구사항 / 제약
- 시스템 프롬프트는 프로필과 무관하게 같다 (캐시 prefix 유지). dev 에서 픽셀 도구가 없으면 모델이 못 쓸 뿐이다.
- 프로필 모듈은 `src/main/agent/profiles/` — `electron` import 금지 (vitest node 로 테스트).

### 범위 제외 (Out of Scope)
- 콘솔 키 직접 호출(direct) 경로 유지, 프로필별 시스템 프롬프트, 프록시 모델 목록 조회, dev 프로필에서 400 원문 표시.

---

## 2. 설계 개요

**설계 변경** (사용자 확정 2026-11-06): DESIGN.md §2 의 모델 호출 경로 `fake|direct|gateway`(GATEWAY_URL 로 암묵 판정)를 `fake|dev|prod` 프로필(`MYBROWSER_PROFILE` 명시 필수)로 바꾸고 direct(콘솔 키 직접 호출)를 없앤다. dev 프로필은 computer toolset·`fallbacks` 를 보내지 않는다.

### 영향받는 프로세스 / 파일
- `src/main/env.ts`
  - `TModelMode` → **`TProfileKind = 'fake' | 'dev' | 'prod'`**. `IEnv.modelMode` → `profileKind`, `anthropicBaseUrl` 은 dev 일 때만 값(필수).
  - `RawEnvSchema.MYBROWSER_PROFILE: z.enum(['dev','prod']).optional()`.
  - `getProfileKind({ isFakeModel, isPackaged, profile })` — FR-1·FR-2. 누락 시 `환경변수가 올바르지 않습니다: MYBROWSER_PROFILE` throw.
  - dev 인데 `ANTHROPIC_BASE_URL` 없으면 `환경변수가 올바르지 않습니다: ANTHROPIC_BASE_URL` throw (FR-3).
  - `model`: prod → `GATEWAY_MODEL`, dev → `MYBROWSER_MODEL ?? DEV_DEFAULT_MODEL('bedrock.anthropic.claude-opus-5-5')`, fake → `MYBROWSER_MODEL ?? 'claude-opus-5-5'`.
- `src/main/agent/loop.ts`
  - `export interface IModelRequestOptions { betaList: readonly string[]; hasFallbacks: boolean }`, `export const DEFAULT_MODEL_REQUEST` (= 지금 값: 두 베타 + fallbacks).
  - `IRunAgentLoopOptions.request?: IModelRequestOptions` (없으면 `DEFAULT_MODEL_REQUEST`). `createRunner` 는 `betas: [...request.betaList]`, `hasFallbacks` 일 때만 `fallbacks: 'default'`.
- `src/main/agent/tools/index.ts` — `createToolList(ctx, { hasComputerToolset = true } = {})`, false 면 `BrowserComputerToolset` 생략.
- `src/main/agent/profiles/` (신규, 전략 패턴)
  - `types.ts`: `IModelProfile { kind: TProfileKind; model: string; createClient(): IModelClient; request: IModelRequestOptions; hasComputerToolset: boolean }`
  - `devProfile.ts`: `createDevProfile({ apiKey?, baseUrl, model })` — `createModelClient({ isFake:false, apiKey, baseURL: baseUrl, missingKeyError: () => new MissingApiKeyError() })`, `request: DEV_MODEL_REQUEST`(context-management 만, fallbacks 없음), `hasComputerToolset: false`.
  - `prodProfile.ts`: `createProdProfile({ gatewayUrl, getDeviceToken, model })` — `createModelClient({ isFake:false, apiKey: getDeviceToken() ?? undefined, baseURL: gatewayUrl, maxRetries: 0 })`(키 없으면 `MissingCredentialError`), `request: DEFAULT_MODEL_REQUEST`, `hasComputerToolset: true`.
  - `fakeProfile.ts`: `createFakeProfile({ model, readScenario })` — `createModelClient({ isFake: true, scenario: readScenario() })`, `DEFAULT_MODEL_REQUEST`, `hasComputerToolset: true`.
  - `index.ts`: `createModelProfile(input)` 팩토리 — `input.kind` 로 분기하는 유일한 곳 + 타입 re-export.
- `src/main/agent/modelClient.ts` — `toDirectClientOptions` 삭제(devProfile 로 흡수). `createModelClient`·`MissingApiKeyError`·`MissingCredentialError`·`ANTHROPIC_DEFAULT_BASE_URL` 유지.
- `src/main/agent/service.ts` — `IAgentServiceDeps` 의 `createModelClient`·`model`·`modelMode` → **`profile: IModelProfile`**. 시작 시 `profile.createClient()`, 루프에 `model: profile.model`·`request: profile.request`, 도구에 `{ hasComputerToolset: profile.hasComputerToolset }`. `toFailureReason` 은 `profile.kind === 'prod'` 일 때만 구독 문장.
- `src/main/account/accountService.ts` — `modelMode: TModelMode` → `profileKind: TProfileKind`, `isGateway` = `'prod'`.
- `src/main/index.ts` — `createRuntimeModelClient` 삭제, `createModelProfile({...env, getDeviceToken, readScenario})` 1회 → 서비스에 주입, account 에 `profileKind`. 시작 로그 FR-9.
- 바깥: `e2e/account.spec.ts`(appEnv 에 `MYBROWSER_PROFILE: 'prod'`), `eval/agent.eval.ts`(`REAL_APP_ENV` 에 `MYBROWSER_PROFILE: 'dev'`, 주석), `.env.example`, `docs/DESIGN.md` §2 모델 호출 경로 문단, `.claude/rules/agent/tools.md` 「모델 호출」 한 줄, `.claude/rules/electron/main.md` 환경변수 목록.

### IPC 계약
변경 없음

### 도구 계약
변경 없음 — 도구 정의는 그대로, `dev` 프로필에서 computer toolset 을 목록에 **넣지 않을** 뿐 (가드 대상·승인 변화 없음).

### 데이터
변경 없음

### 열린 질문
없음 — 사용자 확인(2026-11-06): direct 제거, dev/prod 두 프로필, 개발 실행은 `MYBROWSER_PROFILE` 필수.

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 **테스트와 검증이 모두 에러 0**이 될 때까지 수정 → 재실행을 반복하고, 전부 통과했을 때만 체크박스를 채우고 **Task 단위로 커밋**한 뒤 다음 Task 로 진행한다.
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**

- [ ] **Task 1: loop·tools 가 요청 옵션·픽셀 도구 포함 여부를 받는다**
  - **묶음**: 기반
  - **작업**: loop.ts `IModelRequestOptions`·`DEFAULT_MODEL_REQUEST`·`request?` 옵션, tools/index.ts `createToolList(ctx, { hasComputerToolset })`. 기본값이 지금과 같아 소비자 변경 없음.
  - **파일**: `src/main/agent/loop.ts`, `src/main/agent/tools/index.ts`
  - **테스트**:
    - `src/main/agent/__tests__/loop.test.ts` — request 미지정이면 지금처럼 `fallbacks: 'default'` + anthropic-beta 헤더에 두 베타 / `{ betaList: ['context-management-2025-06-27'], hasFallbacks: false }` 면 본문에 `fallbacks` 없음·베타 헤더에 `server-side-fallback` 없음 (가짜 fetch 의 요청 기록)
    - `src/main/agent/tools/__tests__/index.test.ts` — `hasComputerToolset: false` 면 15개·`BrowserComputerToolset` 없음 / 기본은 기존처럼 16개
  - **실행**: `pnpm test src/main/agent/__tests__/loop.test.ts src/main/agent/tools/__tests__/index.test.ts`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 루프 요청 옵션·픽셀 도구 포함 여부 주입 (spec 007 Task 1)`

- [ ] **Task 2: 모델 프로필 전략 3종 + 팩토리**
  - **묶음**: 기반
  - **작업**: `src/main/agent/profiles/{types,devProfile,prodProfile,fakeProfile,index}.ts`. `toDirectClientOptions` 는 이 Task 에서 그대로 둔다 (index.ts 가 아직 쓴다 — 삭제는 Task 3).
  - **파일**: `src/main/agent/profiles/*`
  - **테스트**:
    - `src/main/agent/profiles/__tests__/profiles.test.ts` — dev: `request` 에 fallbacks 없음·베타 1개, `hasComputerToolset` false, 클라이언트 baseURL = 주어진 프록시·maxRetries 2, 키 없으면 `MissingApiKeyError` / prod: 기기 토큰으로 baseURL = gatewayUrl·maxRetries 0, 토큰 없으면 `MissingCredentialError`, `createClient` 는 호출 시점 토큰을 읽는다, `hasComputerToolset` true / fake·dev: `vi.stubEnv('ANTHROPIC_BASE_URL', 'http://leak.invalid')` 상태에서도 fake baseURL 은 `https://api.anthropic.com`, dev 는 주어진 주소 / `createModelProfile` 이 kind 별로 맞는 전략을 돌려준다 / 프로필의 열거 가능한 필드(JSON.stringify)에 키·토큰이 없다 (SR-2)
  - **실행**: `pnpm test src/main/agent/profiles`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 모델 프로필 전략 dev·prod·fake 추가 (spec 007 Task 2)`

- [ ] **Task 3: env 프로필 판정 + 서비스·계정·진입점 배선**
  - **묶음**: 기반
  - **작업**: env.ts FR-1~4·8 (`TProfileKind`·`profileKind`), service.ts deps `profile`, accountService.ts `profileKind`, index.ts 조립·시작 로그(FR-9), modelClient.ts `toDirectClientOptions` 삭제. 앱 실행 env 를 쓰는 곳도 같이: `e2e/account.spec.ts` `toGatewayEnv` 에 `MYBROWSER_PROFILE: 'prod'`, `eval/agent.eval.ts` `REAL_APP_ENV` 에 `MYBROWSER_PROFILE: 'dev'`(주석 갱신). 타입이 바뀌므로 소비자·테스트를 이 Task 에서 함께 고친다.
  - **파일**: `src/main/env.ts`, `src/main/agent/service.ts`, `src/main/account/accountService.ts`, `src/main/index.ts`, `src/main/agent/modelClient.ts`, `src/main/agent/__tests__/modelClient.test.ts`, `e2e/account.spec.ts`, `eval/agent.eval.ts`
  - **테스트**:
    - `src/main/__tests__/env.test.ts` — 개발 실행에서 PROFILE 없으면/잘못된 값이면 `MYBROWSER_PROFILE` throw / fake=1 이면 PROFILE 없어도 fake / 패키징이면 PROFILE=dev 여도 prod / dev 인데 BASE_URL 없으면 `ANTHROPIC_BASE_URL` throw / dev 기본 모델 `bedrock.anthropic.claude-opus-5-5`, MYBROWSER_MODEL 우선 / prod 는 MYBROWSER_MODEL·ANTHROPIC_BASE_URL 무시 / GATEWAY_URL 만으로는 prod 가 아니다(PROFILE 없으면 throw) / NODE_ENV=test·FAKE=0·PROFILE=prod·GATEWAY_URL 이면 prod — 기존 direct·gateway 테스트는 같은 주장을 dev·prod 로 옮긴다
    - `src/main/agent/__tests__/service.test.ts` — setup 이 `profile` 부분 덮어쓰기를 받게 바꾸고 기존 주장 유지 / **dev 프로필이면 요청 tools 에 computer toolset 이 없고 본문에 fallbacks 가 없다** / prod 401·402·429 구독 문장, dev 401 은 API 키 문장
    - `src/main/account/__tests__/accountService.test.ts` — `modelMode` → `profileKind` ('direct'→'dev', 'gateway'→'prod'), 주장 유지
    - `src/main/agent/__tests__/modelClient.test.ts` — `toDirectClientOptions` describe 제거 (같은 주장은 Task 2 profiles 테스트가 덮는다)
    - `e2e/account.spec.ts` — 기존 구독 흐름이 prod 프로필 + 가짜 게이트웨이로 그대로 통과
  - **실행**: `pnpm test src/main`
  - **검증**: `pnpm type-check` + 단위 테스트 + `make e2e` 회귀(가짜 모델 — fake 프로필 요청·도구 불변)
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: MYBROWSER_PROFILE 로 모델 프로필 선택 (spec 007 Task 3)`

- [ ] **Task 4: 설정 안내·설계 문서 갱신**
  - **묶음**: 기반
  - **작업**: `.env.example`(`MYBROWSER_PROFILE=dev`, `ANTHROPIC_BASE_URL`, `MYBROWSER_MODEL=bedrock.anthropic.claude-opus-5-5`), DESIGN.md §2 모델 호출 경로, rules 두 파일 한 줄씩
  - **파일**: `.env.example`, `docs/DESIGN.md`, `.claude/rules/agent/tools.md`, `.claude/rules/electron/main.md`
  - **테스트**: 코드 변경 없음 — 전체 `make e2e` 회귀로 확인
  - **실행**: `make e2e`
  - **검증**: `desktop/app-check` — 가짜 모델로 앱 실행 → 사이드바 할 일 → 완료, 콘솔·main 에러 0 + e2e 통과 + 승인 전 미실행(기존 승인 e2e)
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `docs: 모델 프로필 설정 안내·설계 문서 갱신 (spec 007 Task 4)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
