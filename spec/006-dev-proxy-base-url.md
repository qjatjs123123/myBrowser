# Spec: 개발 모드 모델 프록시 주소 (ANTHROPIC_BASE_URL)

> **상태**: 📝 계획됨
> **생성일**: 2026-11-06
> **묶음**: 기반
> **관련 spec**: 003, 005
> **설계 참조**: docs/DESIGN.md §2 (모델 호출 경로)

---

## 1. 요구사항

### 배경 / 목적
개발 중에는 Anthropic Console 키 대신 사내 GenAI 프록시(LiteLLM, `https://genai-sharedservice-americas.pwcinternal.com`)의 키로 모델을 부른다. 지금 `.env` 에는 주소 설정이 없어 프록시 키가 `api.anthropic.com` 으로 가 401 이 된다. `ANTHROPIC_BASE_URL` 을 env.ts 검증·direct 전용 설정으로 명시 지원한다 — SDK 가 `process.env.ANTHROPIC_BASE_URL` 을 스스로 읽는 암묵 경로는 막는다. 배포(설치판)는 기존 경로(gateway → Claude API)를 그대로 쓴다.

### 기능 요구사항
- **FR-1**: direct 모드에서 `.env`(또는 셸)의 `ANTHROPIC_BASE_URL` 이 있으면 모델 호출이 그 주소로 간다. 키는 기존 `ANTHROPIC_API_KEY` 를 그대로 쓴다.
- **FR-2**: `ANTHROPIC_BASE_URL` 이 없으면 지금과 똑같이 `api.anthropic.com` 으로 간다. direct 모드는 프록시 여부와 상관없이 SDK 기본 재시도(2)를 쓴다.
- **FR-3**: `ANTHROPIC_BASE_URL` 은 direct 모드에서만 쓴다 — fake·gateway 모드(e2e·설치판)는 값이 있어도 무시한다.
- **FR-4**: `ANTHROPIC_BASE_URL` 이 http(s) URL 이 아니면 시작 시점에 `환경변수가 올바르지 않습니다: ANTHROPIC_BASE_URL` 로 실패한다.
- **FR-5**: 프록시 사용 중에도 키가 없으면 기존 문장(`API 키가 없습니다. .env 에 ANTHROPIC_API_KEY …`)을 낸다 — gateway 의 구독 안내 문장이 아니다.
- **FR-6**: 프록시에서 모델 이름이 다르면 기존 `MYBROWSER_MODEL` 로 바꾼다 (새 설정 없음).

### 안전 요구사항
해당 없음 — 에이전트 도구·가드·승인 흐름은 바뀌지 않는다. 키·주소는 기존대로 main 의 `createModelClient` 안에서만 SDK 에 넘기고 로그·이벤트·DB 에 싣지 않는다 (spec 003 SR-6).

### 비기능 요구사항 / 제약
- 설치판은 `.env` 를 읽지 않고(spec 005 SR-3) gateway 모드이므로 이 설정이 배포에 새지 않는다.

### 범위 제외 (Out of Scope)
- 설치판에서 프록시 사용, 프록시 전용 인증 헤더·사내 CA 인증서 설정, 프록시 모델 목록 조회 UI.

---

## 2. 설계 개요

### 영향받는 프로세스 / 파일
- `src/main/env.ts` — `RawEnvSchema.ANTHROPIC_BASE_URL`(http/https URL, optional), `IEnv.anthropicBaseUrl?: string` (direct 모드일 때만 값, 그 외 undefined)
- `src/main/agent/modelClient.ts`
  - **SDK 는 baseURL 이 undefined 면 `process.env.ANTHROPIC_BASE_URL` 을 스스로 읽으므로, direct·fake 클라이언트도 baseURL 을 항상 명시한다** — direct 는 `anthropicBaseUrl ?? 'https://api.anthropic.com'`, fake 는 `'https://api.anthropic.com'` 고정 (상수 `ANTHROPIC_DEFAULT_BASE_URL`).
  - `ICreateModelClientOptions` 에 `maxRetries?: number` 추가. "baseURL 이 있으면 재시도 0" 규칙을 없애고, 재시도 0 은 gateway 옵션이 `maxRetries: 0` 으로 명시한다. 지정이 없으면 SDK 기본 재시도(2).
  - `toDirectClientOptions({ apiKey, baseUrl })`: direct 모드 옵션 생성 (`baseURL: baseUrl ?? ANTHROPIC_DEFAULT_BASE_URL`, `missingKeyError: () => new MissingApiKeyError()`, maxRetries 미지정)
- `src/main/index.ts` — `createRuntimeModelClient`: gateway 분기에 `maxRetries: 0` 명시, direct 분기가 `toDirectClientOptions` 를 쓴다 (fake 분기는 `isFake: true` 그대로)
- `docs/DESIGN.md` §2 모델 호출 경로 문장, `.env.example` 에 `ANTHROPIC_BASE_URL` 주석 줄

### IPC 계약
변경 없음

### 도구 계약
변경 없음

### 데이터
변경 없음

### 열린 질문
없음 — 사용자 확인: 개발에만 프록시, 배포는 Claude API (2026-11-06).

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 **테스트와 검증이 모두 에러 0**이 될 때까지 수정 → 재실행을 반복하고, 전부 통과했을 때만 체크박스를 채우고 **Task 단위로 커밋**한 뒤 다음 Task 로 진행한다.
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**

- [ ] **Task 1: direct 모드 ANTHROPIC_BASE_URL 지원**
  - **묶음**: 기반
  - **작업**: env.ts 에 `ANTHROPIC_BASE_URL` 파싱·`anthropicBaseUrl`(direct 모드만), modelClient.ts 에 `toDirectClientOptions`, index.ts direct 분기 연결, DESIGN.md·.env.example 갱신
  - **파일**: `src/main/env.ts`, `src/main/agent/modelClient.ts`, `src/main/index.ts`, `docs/DESIGN.md`, `.env.example`
  - **테스트**:
    - `src/main/__tests__/env.test.ts` — direct 모드에서 값 전달 / 없으면 undefined / fake·gateway(패키징·MYBROWSER_GATEWAY_URL) 모드면 undefined / http(s) URL 아니면 실패
    - `src/main/agent/__tests__/modelClient.test.ts` — `toDirectClientOptions` 로 만든 클라이언트: baseUrl 있으면 그 주소·maxRetries 2, 없으면 `https://api.anthropic.com`·maxRetries 2 / 키 없으면 baseUrl 이 있어도 `MissingApiKeyError` / `vi.stubEnv('ANTHROPIC_BASE_URL', 'http://leak.invalid')` 상태에서도 baseUrl 없는 direct 클라이언트와 fake 클라이언트의 baseURL 이 `https://api.anthropic.com` (`afterEach(vi.unstubAllEnvs)`) / gateway 형태(`maxRetries: 0` 명시) → 0 — 기존 'baseURL 을 주면 SDK 재시도를 끈다' 테스트는 `maxRetries: 0` 을 명시하는 형태로 바꾸고 기대값 0 유지
  - **실행**: `pnpm test src/main/__tests__/env.test.ts src/main/agent/__tests__/modelClient.test.ts`
  - **검증**: `pnpm type-check` + 단위 테스트 + 기존 e2e 회귀 없음(`make e2e`, 가짜 모델 모드). 실제 프록시 호출 테스트는 두지 않는다.
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 개발 모드 ANTHROPIC_BASE_URL 프록시 지원 (spec 006 Task 1)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
