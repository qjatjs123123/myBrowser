# Spec: 패키징·평가 세트 + 구독 계정 활성화(게이트웨이 모드)

> **상태**: 📝 계획됨
> **생성일**: 2026-11-05
> **묶음**: 기반, main-account, renderer-sidebar, agent-eval, 연결(메인 직접 — 5단계 merge 뒤)
> **관련 spec**: 003, 004
> **설계 참조**: docs/DESIGN.md §1 · §3 · §5(로드맵 5단계), 설계안 `~/.claude/plans/fluttering-riding-thacker.md`

---

## 1. 요구사항

### 배경 / 목적
로드맵 5단계(설치 파일 + 회귀 측정)를 만든다. 설치판은 `.env` 의 API 키를 쓸 수 없으므로(asar 에서 그대로 추출됨) **유료 구독 모델**로 간다 — 진짜 Anthropic 키는 별도 게이트웨이 서버(새 레포 `mybrowser-gateway`, FastAPI)에만 있고, 앱은 구매 후 자동으로 받은 **기기 토큰**으로 게이트웨이를 부른다. 개발 중에는 지금처럼 `.env` 의 본인 키로 Anthropic 을 직접 부른다(사용자 결정 2026-11-05).

### 기능 요구사항
- **FR-1 패키징**: `pnpm dist:linux` 가 `release/` 에 linux unpacked + AppImage 를 만든다. `electron-builder.yml` 에 win(nsis)·mac(dmg) 설정을 둔다(빌드는 해당 OS·CI). 설치판에는 `out/**`·`package.json`·production 의존성만 들어가고 소스(`src/`)·`e2e/`·`spec/`·`.env` 는 들어가지 않는다.
- **FR-2 설치판 CDP**: 패키징된 앱도 원격 디버깅을 **127.0.0.1 + port 0(임의 포트)** 으로 연다(`MYBROWSER_CDP_PORT` 를 주면 그 값). `env.ts` 가 `isPackaged && !isCdpPortExplicit` 이면 `cdpPort = 0` 으로 정하고, `getCdpSwitches` 와 `resolveCdpEndpoint` 는 **같은 `env.cdpPort`** 를 쓴다(9222 로 바로 붙는 오접속 방지). 앱 시작 시 ready 전에 `userData/DevToolsActivePort` 를 지워, 에이전트는 이번 실행이 쓴 포트만 읽는다(기존 `resolveCdpEndpoint` 폴링 재사용).
- **FR-3 실행 모드 3개** (`src/main/env.ts` 의 `modelMode`):
  | modelMode | 조건 (위에서부터 첫 일치) | 모델 호출 |
  |---|---|---|
  | `fake` | `MYBROWSER_FAKE_MODEL=1` | 가짜 fetch (지금 그대로) |
  | `gateway` | `MYBROWSER_GATEWAY_URL` 지정, 또는 `app.isPackaged` | 기기 토큰 + 게이트웨이 baseURL |
  | `direct` | 그 외 (dev) | `.env`/환경변수 `ANTHROPIC_API_KEY` → api.anthropic.com (지금 그대로) |
  - 게이트웨이 URL 기본값은 빌드 상수 `__GATEWAY_URL__`(electron-vite `define`, 빌드 시 `MYBROWSER_GATEWAY_URL` 환경변수 → 없으면 `https://gateway.mybrowser.app`). 런타임 `MYBROWSER_GATEWAY_URL` 이 우선. `readEnv(source, { isPackaged, defaultGatewayUrl })` 로 기본값을 인자로 받고 `__GATEWAY_URL__` 는 `index.ts` 에서만 읽어 넘긴다(vitest 에 define 불필요).
  - gateway 모드는 `MYBROWSER_MODEL` 을 무시하고 `claude-opus-5-5` 고정(게이트웨이 허용 목록과 일치).
  - 패키징된 앱은 `.env` 를 읽지 않는다(`loadDotEnv` 는 `!isPackaged` 일 때만).
- **FR-4 활성화(구매 → 자동 저장)**: gateway 모드에서 기기 토큰이 없으면 사이드바에 계정 카드(`role="region"`, 이름 “계정”)가 “구독하고 시작하기” 버튼을 보인다. 누르면:
  1. main 이 `POST {gw}/v1/activations` → 받은 `purchase_url` 을 **새 탭**으로 연다. 카드는 “구매 페이지에서 결제를 마치면 자동으로 연결됩니다” + [취소].
  2. main 이 `GET {gw}/v1/activations/{id}` 를 `poll_interval_sec`(기본 3s)마다 `expires_at` 까지 폴링 → `approved` 응답의 `device_token` 을 1회 받으면 자격 저장소에 암호화 저장하고 폴링을 끝낸다. `expired` 면 카드가 “시간이 지나 연결을 취소했습니다 — 다시 시도해 주세요” 로 돌아간다.
  3. 저장되면 카드는 “준비됨 · 크레딧 {n}” + [구독 관리](manage_url 을 새 탭) + [연결 해제].
  - 앱 재시작 후에도 저장된 토큰을 읽어 바로 active 로 시작하고 `GET {gw}/v1/account` 로 크레딧을 갱신한다.
- **FR-5 크레딧 표시**: run 이 끝날 때(done·failed·stopped)와 카드 표시 시 `GET /v1/account` 로 크레딧을 갱신해 `account:changed` 로 보낸다. 크레딧의 출처는 `/v1/account` 하나다(앱은 `x-mybrowser-credits` 헤더를 읽지 않는다). `/v1/account` 가 401 이면 `handleAuthFailure` → inactive.
- **FR-6 게이트웨이 오류 문장**: gateway 모드 run 에서
  - 토큰 없음 → run 을 시작하지 않고 `AGENT_ERROR` “구독을 시작하면 쓸 수 있습니다 — 사이드바의 [구독하고 시작하기]를 눌러 주세요”.
  - 401 → 토큰을 지우고 run `failed` “기기 연결이 해제됐습니다 — 다시 구독 연결을 해 주세요”, 계정 카드 inactive.
  - 402 → run `failed` “크레딧이 부족합니다 — [구독 관리]에서 충전해 주세요”.
  - 429 → run `failed` “요청이 너무 많습니다 — 잠시 후 다시 시도해 주세요”.
- **FR-7 direct·fake 모드**: 계정 카드는 보이지 않는다(`account:getStatus` → `not_required`). 기존 흐름·문장(`missingApiKey`)은 그대로.
- **FR-8 평가 세트**: `pnpm eval` 이 `eval/scenarios.ts` 의 시나리오(할 일 + 로컬 픽스처 페이지 + 가짜 모델 시나리오 + 기대 결과)를 실제 앱(`_electron`)으로 하나씩 돌려, 시나리오별 `성공 | 최종 상태 | 도구 호출 수 | 승인 대기 수 | 입력/출력 토큰 | 걸린 시간` 표를 stdout(마크다운) 과 `eval/results/{YYYYMMDD-HHmmss}.json` 에 낸다. 기대와 다르면 종료 코드 1.
  - `pnpm eval -- --real --yes-spend` 일 때만 가짜 모델 대신 실제 모델(direct 모드, 환경의 `ANTHROPIC_API_KEY`)로 같은 **로컬 픽스처**를 돌린다. `--yes-spend` 없이 `--real` 이면 실행하지 않고 “실제 API 비용이 발생합니다. --yes-spend 를 붙여 다시 실행하세요” 출력 후 종료 코드 2. 품질 게이트·CI·e2e 는 `--real` 을 부르지 않는다.
- **FR-9 패키징 e2e**: 패키징된 실행 파일(`release/linux-unpacked/mybrowser`)을 `_electron.launch({ executablePath })` 로 띄워, 가짜 모델 run 이 임의 CDP 포트로 탭에 붙어 끝까지(done) 가는지 확인한다. 이때 `MYBROWSER_CDP_PORT` 를 env 에서 **빼고** 띄워 설치판 기본 경로(port 0 + DevToolsActivePort)를 확인한다. 설치판 e2e 는 기본 e2e 와 분리한다(`e2e-packaged/`, `pnpm e2e:packaged`) — 산출물이 없으면 skip 하지 않고 실패한다.

### 안전 요구사항
- **SR-1 자격 비노출**: 기기 토큰·API 키는 main 에만 둔다 — renderer·IPC 응답·`account:changed`·agent 이벤트·로그·SQLite·탭 페이지에 싣지 않는다(spec 003 SR-6 확장). 자격 저장소 파일은 `safeStorage` 로 암호화(`userData/credentials.bin`). `safeStorage.isEncryptionAvailable()` 가 false 이거나, **production 에서** `getSelectedStorageBackend() === 'basic_text'`(키링 없는 Linux 의 고정 키 난독화)면 **디스크에 쓰지 않고** 메모리에만 두며 `log.warn`(재시작 시 다시 활성화 — 보수적 기본값, 추후 사용자 결정으로 완화 가능). test 모드는 `app.commandLine.appendSwitch('password-store','basic')` 로 백엔드를 고정하고 basic_text 를 허용해 e2e 를 결정적으로 만든다.
- **SR-2 폴링 비밀**: `poll_secret` 은 main 메모리에만 두고, 활성화가 끝나거나 취소되면 버린다. 구매 탭 URL 에는 `activation_id` 만 있고 `poll_secret` 은 없다.
- **SR-3 설치판 .env 차단**: 패키징된 앱은 `.env` 를 읽지 않고, 설치 산출물(asar)에 `.env` 가 없다(테스트로 확인).
- **SR-4 CDP 바인딩**: 원격 디버깅은 항상 `127.0.0.1` 바인딩. 설치판 기본 포트는 0(고정 포트 금지 — 다른 프로그램과 충돌·오접속 방지).
- **SR-5 가드 불변**: 구매·결제 페이지가 탭에 열려도 가드·승인 흐름은 바꾸지 않는다. 결제는 사용자가 직접 한다(에이전트는 토큰 없이 시작되지 않고, 결제 버튼은 기존 가드 패턴의 승인 대상).
- **SR-6 비용 발생 차단**: `--real` 평가는 `--yes-spend` 명시 없이는 실행되지 않고, 외부 사이트가 아니라 로컬 픽스처만 연다.

### 비기능 요구사항 / 제약
- 모든 테스트는 가짜 모델·가짜 게이트웨이(로컬 HTTP)·로컬 픽스처. 실제 Anthropic·토스·게이트웨이 호출 금지.
- 게이트웨이 HTTP 계약(아래)은 `mybrowser-gateway` 레포와 공유하는 단일 출처 — 앱은 응답을 zod 로 검증한다.

### 범위 제외 (Out of Scope)
게이트웨이 서버 구현(별도 레포), BYOK(사용자 본인 키 입력), 코드 서명·공증·자동 업데이트, Windows/mac 실제 빌드, 가격·플랜 확정(`--real` 실측 후), 계정 로그인 UI(구매 페이지가 웹에서 처리).

---

## 2. 설계 개요

### 영향받는 프로세스 / 파일
- shared: `src/shared/ipc/account.ts`(IPC 스키마), `src/shared/account/gateway.ts`(게이트웨이 HTTP 계약 zod), `src/shared/ipc/{channels,api}.ts`
- main: `src/main/env.ts`, `src/main/app/cdp.ts`, `src/main/app/credentialStore.ts`(safeStorage), `src/main/account/`(gatewayClient·activation·accountService), `src/main/agent/modelClient.ts`(baseURL), `src/main/agent/service.ts`(게이트웨이 오류 문장), `src/main/ipc/handlers/account.ts`, `src/main/ipc/registry.ts`, `src/main/index.ts`
- preload: `src/preload/index.ts`
- renderer: `src/renderer/hooks/useAccount.ts`, `src/renderer/sidebar/AccountCard/`, `src/renderer/App.tsx`
- 빌드: `electron-builder.yml`, `electron.vite.config.ts`(define), `package.json`(scripts `dist:linux`, `eval`)
- 평가: `eval/scenarios.ts`, `eval/run.ts`(러너), `playwright.eval.config.ts`, `eval/results/.gitkeep`(결과 JSON 은 gitignore)
- e2e: `e2e/fixtures.ts`(env 덮어쓰기·executablePath 옵션), `e2e/fixtures/gateway.ts`(가짜 게이트웨이), `e2e/account.spec.ts`, `e2e/packaged.spec.ts`

### IPC 계약
`src/shared/ipc/account.ts`:
```ts
export const AccountStatusSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('not_required') }),                         // direct·fake 모드
  z.strictObject({ state: z.literal('inactive'), message: z.string().optional() }), // 토큰 없음 (message: 만료·해제 안내)
  z.strictObject({ state: z.literal('activating'), activationId: z.uuid(), expiresAt: z.iso.datetime() }),
  z.strictObject({
    state: z.literal('active'),
    credits: z.number().int().nullable(),        // 아직 못 읽었으면 null
    plan: z.string().nullable(),
    renewsAt: z.iso.datetime().nullable(),
  }),
]);
export type TAccountStatus = z.infer<typeof AccountStatusSchema>;
```
| 채널 | 방향 | 요청 | 응답/이벤트 |
|---|---|---|---|
| `account:getStatus` | invoke | 없음 | `TIpcResult<TAccountStatus>` (active 면 크레딧 갱신을 비동기로 시작) |
| `account:startActivation` | invoke | 없음 | `TIpcResult<TAccountStatus>`(activating) — main 이 구매 탭을 연다. 이미 activating 이면 같은 상태, active 면 `BUSY` “이미 연결돼 있습니다”, not_required(direct·fake) 모드면 `AGENT_ERROR` “이 실행 모드에서는 구독이 필요 없습니다”. 게이트웨이 실패면 `AGENT_ERROR` “구독 서버에 연결하지 못했습니다” |
| `account:cancelActivation` | invoke | 없음 | `TIpcResult<TAccountStatus>`(inactive) |
| `account:openManage` | invoke | 없음 | `TIpcResult<null>` — `manage_url`(마지막 `/v1/account` 값, 없으면 `{gw}/account`)을 새 탭 |
| `account:signOut` | invoke | 없음 | `TIpcResult<TAccountStatus>`(inactive) — 저장 토큰 삭제 |
| `account:changed` | main→renderer event | — | `TAccountStatus` (상태가 바뀔 때마다 전체) |

`IApi.account = { getStatus, startActivation, cancelActivation, openManage, signOut, onChanged }`. 모든 요청은 인자가 없으므로 핸들러는 입력 검증을 하지 않는다(응답만 schema parse).

### 게이트웨이 HTTP 계약 (`src/shared/account/gateway.ts`, mybrowser-gateway 와 공유)
- 공통: JSON, 활성화·계정 API 는 envelope `{ "status": "success", "data": … }` / 4xx `{ "status": "fail", "data": { "code": <http>, "message": "<한국어>" } }` / 5xx `{ "status": "error", "data": {…} }`. 키는 snake_case.
- `POST /v1/activations` 요청 `{ "device_name": string(1..64) }` → 201 `data: { "activation_id": uuid, "poll_secret": string(32..128), "purchase_url": url, "expires_at": iso, "poll_interval_sec": int(1..30) }`
- `GET /v1/activations/{activation_id}` 헤더 `x-poll-secret` → 200 `data` 는 status 로 나뉜 union: `{ "status": "pending" }` | `{ "status": "approved", "device_token": string(32..256) }`(토큰 필수) | `{ "status": "expired" }` | `{ "status": "consumed" }` — `device_token` 은 `approved` 응답에 **딱 1번**만 실리고 그 뒤 `consumed`. 비밀이 틀리면 404. 앱은 폴링 중 429·5xx·네트워크 오류를 다음 주기에 재시도하고, `expires_at` 이 지나면 만료로 처리한다.
- `GET /v1/account` 헤더 `x-api-key: {device_token}` → 200 `data: { "credits": int, "plan": string|null, "subscription_status": "active"|"past_due"|"canceled"|"none", "renews_at": iso|null, "manage_url": url }`; 토큰 무효 401.
- 시각은 모두 UTC `Z` 형식(예 `2026-11-05T10:00:00Z` — `z.iso.datetime()` 기본과 일치, `+00:00` 금지).
- `POST /v1/messages` 헤더 `x-api-key: {device_token}` → **Anthropic Messages API 호환**. 앱 SDK 는 `POST /v1/messages?beta=true` 로 부르고 `anthropic-version`·`anthropic-beta: server-side-fallback-2026-07-01,context-management-2025-06-27` 헤더와 본문 `stream`·`output_config`·`fallbacks`·`context_management`·`tools`·`system`·`messages` 를 보낸다 — 게이트웨이는 `?beta=true`·두 헤더를 upstream 에 그대로 전달한다. 허용 목록: model `claude-opus-5-5`, betas 는 위 2개(그 외 beta 400), `max_tokens ≤ 64000`(envelope 아님, SSE 그대로). 오류는 Anthropic 형식 `{ "type": "error", "error": { "type": "...", "message": "..." } }`: 401 `authentication_error`, 402 `insufficient_credits`, 429 `rate_limit_error`, 400 `invalid_request_error`(허용 안 된 model·beta·max_tokens). 응답 헤더 `x-mybrowser-credits: <int>`(남은 크레딧).
- zod: `ActivationCreatedSchema`, `ActivationPollSchema`, `AccountInfoSchema`, `toEnvelopeSchema(data)`. 앱은 SDK 를 `new Anthropic({ apiKey: deviceToken, baseURL: gatewayUrl, maxRetries: 0 })` 로 만든다(SDK 가 `x-api-key` 로 보낸다).

### 도구 계약
변경 없음.

### 데이터
SQLite 변경 없음. 자격은 `userData/credentials.bin`(safeStorage 암호문, JSON `{ "deviceToken": "…" }` 을 암호화).

### main 모듈 설계
- `app/credentialStore.ts` — `createCredentialStore({ filePath, safeStorage, fs? }): ICredentialStore` `{ read(): string | null; write(token): void; clear(): void }`. 파일이 깨졌거나 복호화 실패면 `null` + `log.warn` + 파일 삭제. electron 의존은 이 파일만.
- `account/gatewayClient.ts` — `createGatewayClient({ baseUrl, fetch? })` `{ createActivation(deviceName), pollActivation(id, secret), getAccount(token) }` — envelope·zod 검증, 실패는 `GatewayError { status, message }` throw.
- `account/accountService.ts` — `createAccountService({ modelMode, gateway, store, openTab, emit, now, sleep, deviceName, log })` → `{ getStatus, startActivation, cancelActivation, openManage, signOut, getDeviceToken(): string | null, refreshCredits(): Promise<void>, handleAuthFailure(): void, shutdown() }`. 폴링은 `AbortController` + 주입된 `sleep`(테스트 즉시). 상태 바뀔 때마다 `emit(status)`.
- `agent/service.ts` — run 실패 사유 변환 `toGatewayFailureReason(error)`: SDK `APIError` 의 `status` 401/402/429 → FR-6 문장, 401 이면 `deps.onAuthFailure?.()`. run 종료 시 `deps.onRunEnd?.()`(크레딧 갱신). `createModelClient` 가 `MissingCredentialError` 를 던지면 시작 거부 문장(FR-6 첫 줄).
- `agent/modelClient.ts` — 옵션 `{ isFake, apiKey?, baseURL?, scenario?, missingKeyError? }` : gateway 모드는 `baseURL` + `apiKey=deviceToken`, 토큰 없으면 `MissingCredentialError`.

### 결정 사항
- 게이트웨이 HTTP 계약은 이 spec 이 정한다 — `mybrowser-gateway` 레포가 이 절을 그대로 구현한다(동시 개발).
- 가짜 게이트웨이(`e2e/fixtures/gateway.ts`)는 e2e 픽스처 서버와 같은 프로세스에 붙는 별도 HTTP 서버: 활성화 생성 → 두 번째 폴링에서 approved(토큰 1회) → 이후 consumed, 계정 크레딧 시작 1000, `/v1/messages` 1회 처리마다 크레딧 10 차감(`/v1/account` 는 현재 값), `/v1/messages` 는 텍스트 1블록 `end_turn` SSE(“완료했습니다”) + `x-mybrowser-credits`; 옵션으로 402·401 응답.
- **설계 변경(사용자 확정 2026-11-05)**: ① 설치판 모델 호출은 게이트웨이 경유, safeStorage 는 사용자 API 키가 아니라 기기 토큰용(DESIGN §1 갱신) ② 설치판도 CDP 127.0.0.1 + port 0 상시 활성 — `rules/electron/main.md` 「보안 기본값」 규칙을 Task 2 에서 갱신.
- 계정 e2e 는 `MYBROWSER_FAKE_MODEL=0`, `NODE_ENV=test`, `MYBROWSER_GATEWAY_URL={가짜}` 로 띄운다(`.env` 미로딩, gateway 모드).
- 패키징 e2e 는 가짜 모델 시나리오를 앱 밖에서 읽도록 `MYBROWSER_FAKE_SCENARIO_DIR`(test 모드 전용) 를 env 에 추가한다 — 패키징된 앱에는 `e2e/` 가 없다.
- 평가 러너는 playwright test 프로젝트(`playwright.eval.config.ts` + `eval/*.eval.ts`)로 e2e 픽스처(`e2e/fixtures.ts`)를 재사용한다. **새 IPC 채널을 만들지 않는다** — 화면 조작은 기존 e2e 헬퍼, 결과 수집은 앱을 닫은 뒤 `node:sqlite` 로 `{userData}/mybrowser.db` 의 `runs`(status·usage·시작/종료 시각)와 `steps` 를 읽는다: 도구 호출 수 = 그 run 의 steps 행 수, 승인 수 = 승인 대기를 거친 step 수(가드 승인 + `request_approval`). 정확한 컬럼·값은 `src/main/store/migrations/*.sql`·`src/main/store/repos/runs.ts` 를 기준으로 `eval/report.ts` 에 상수로 둔다.

### 열린 질문
없음 (CDP·API 키·빌드 대상·평가 범위·서버 스택·결제·요금은 2026-11-05 사용자 확정).

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 **테스트와 검증이 모두 에러 0**이 될 때까지 수정 → 재실행을 반복하고, 전부 통과했을 때만 체크박스를 채우고 **Task 단위로 커밋**한 뒤 다음 Task 로 진행한다.
> 모든 Task 는 **테스트 코드 필수**. **UI Task 와 에이전트 동작 Task 는 Playwright `_electron` e2e**(`e2e/*.spec.ts`, 가짜 모델 모드·로컬 픽스처)를 포함해야 한다. 실제 Claude API·외부 사이트에 의존하는 테스트 금지.
> 모든 Task 완료 후 **`desktop/refactor` 적용 모드**가 의무 실행된다 (vibe-build 에서는 6단계).
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**

- [ ] **Task 1: 계정 IPC·게이트웨이 계약 스키마 + preload**
  - **묶음**: 기반
  - **작업**: `src/shared/ipc/account.ts`(AccountStatusSchema), `src/shared/account/gateway.ts`(위 HTTP 계약 zod + `toEnvelopeSchema` + 실패 envelope 스키마), `channels.ts` 에 `IPC.account.*`, `api.ts` 에 `IApi.account`, `preload/index.ts` 에 래퍼. renderer `vitest.setup` 의 `window.api` mock 에 `account` 추가(getStatus → not_required).
  - **파일**: `src/shared/ipc/account.ts`, `src/shared/account/gateway.ts`, `src/shared/ipc/{channels,api}.ts`, `src/preload/index.ts`, `vitest.setup*.ts`
  - **테스트**: `src/shared/ipc/__tests__/account.test.ts` — 4 상태 유효/무효(키 추가·잘못된 uuid); `src/shared/account/__tests__/gateway.test.ts` — 각 응답 유효/무효, `device_token` 길이, envelope fail 파싱
  - **실행**: `pnpm test src/shared`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 계정 IPC·게이트웨이 계약 스키마 (spec 005 Task 1)`

- [ ] **Task 2: 실행 모드·CDP·모델 클라이언트 baseURL**
  - **묶음**: 기반
  - **작업**: `env.ts` — `modelMode`('fake'|'gateway'|'direct', FR-3 순서), `gatewayUrl`(런타임 env → 빌드 상수 `__GATEWAY_URL__`), `fakeScenarioDir`(test 모드에서만 `MYBROWSER_FAKE_SCENARIO_DIR`), `loadDotEnv` 를 패키징 시 건너뛰는 `isPackaged` 옵션. `electron.vite.config.ts` main 에 `define: { __GATEWAY_URL__ }` + `src/main/env.d.ts`(또는 기존 d.ts) 선언. `env.ts` 가 패키징 + 포트 미지정이면 `cdpPort = 0`, `app/cdp.ts` 는 패키징이어도 항상 스위치를 낸다(포트는 `env.cdpPort` 그대로 — `resolveCdpEndpoint` 와 같은 값). `app/cdp.ts` 에 `removeStaleActivePort(userDataDir, fs?)` 추가. `modelClient.ts` — `baseURL` 옵션 + `MissingCredentialError`(gateway 모드 토큰 없음). `index.ts` — `loadDotEnv({ …, isPackaged })`, userData 설정 직후 `removeStaleActivePort`, `readFakeScenario` 가 `env.fakeScenarioDir` 우선, `createModelClient` 호출부는 기존 동작 유지(gateway 연결은 Task 10). `rules/electron/main.md` 「보안 기본값」 CDP 줄을 “항상 127.0.0.1, 설치판 기본 port 0” 으로 갱신.
  - **파일**: `src/main/env.ts`, `src/main/app/cdp.ts`, `src/main/agent/modelClient.ts`, `src/main/index.ts`, `electron.vite.config.ts`, `.claude/rules/electron/main.md`
  - **테스트**: `src/main/__tests__/env.test.ts` — 모드 3개 판정 순서, gatewayUrl 우선순위(`defaultGatewayUrl` 인자), 패키징·미지정 → cdpPort 0, gateway 모드 model 고정, 패키징 시 loadDotEnv 미호출, fakeScenarioDir 은 test 모드만; `src/main/app/__tests__/cdp.test.ts` — 패키징·미지정 → port 0 + 127.0.0.1, 명시 포트 유지, removeStaleActivePort 가 파일 삭제·없으면 무시; `src/main/agent/__tests__/modelClient.test.ts` — baseURL 전달, gateway 토큰 없음 → MissingCredentialError
  - **실행**: `pnpm test src/main/__tests__/env.test.ts src/main/app src/main/agent/__tests__/modelClient.test.ts`
  - **검증**: `pnpm type-check` + 단위 테스트 + 기존 `make e2e`(회귀 없음)
  - **통과 기준**: 기존 e2e 23개 그대로 통과
  - **커밋**: `feat: 실행 모드 판정·설치판 CDP 임의 포트 (spec 005 Task 2)`

- [ ] **Task 3: electron-builder 설정·스크립트·e2e 픽스처 옵션**
  - **묶음**: 기반
  - **작업**: `electron-builder.yml` — `files: [out/**, package.json, "!**/.env*"]`, linux `AppImage` + `dir`, `executableName: mybrowser`, win nsis(`oneClick: false`), mac dmg, `extraMetadata` 불필요. `package.json` scripts: `dist:linux` = `electron-vite build && electron-builder --linux dir AppImage`, `eval` = `electron-vite build && node eval/cli.mjs`(`eval/cli.mjs` 는 Task 8 이 만든다 — 인자를 해석해 `playwright test -c playwright.eval.config.ts` 를 부른다). `.gitignore` 에 `release/`, `eval/results/*.json`. `e2e/fixtures.ts` — `launchApp`·기본 `app` 픽스처에 `appEnv`(env 덮어쓰기, 값이 `undefined` 면 그 키 제거)·`executablePath` 옵션(`test.use({ appEnv, executablePath })`); executablePath 를 주면 `args: [ROOT]` 를 넘기지 않는다. `launchApp({ userDataDir, appEnv? })` 호출 인자로도 `appEnv` 를 받는다(가짜 게이트웨이처럼 실행마다 바뀌는 URL 용). asar 검사: `pnpm add -D @electron/asar`(직접 의존성), 판정 로직 `scripts/checkAsar.ts` — `.env*` 는 어느 위치든 금지, `src/`·`e2e/`·`spec/` 는 **asar 최상위**(`/src/`·`/e2e/`·`/spec/` 로 시작하는 경로)만 금지(production 의존성의 `node_modules/*/src/` 는 허용), `@electron/asar` 의 목록 함수 사용 + 진입은 Node 22 type stripping(`node --experimental-strip-types scripts/checkAsar.ts`), script `check:asar`. 설치판 e2e 분리: `playwright.packaged.config.ts`(testDir `e2e-packaged`), script `e2e:packaged` = `pnpm dist:linux && pnpm check:asar && playwright test -c playwright.packaged.config.ts`. 도구 설정: `vitest.config.mts` node project include 에 `scripts/**/__tests__/**/*.test.ts`·`eval/**/__tests__/**/*.test.ts`·`e2e/fixtures/__tests__/**/*.test.ts`, `tsconfig.node.json` include 에 `scripts/**/*`·`eval/**/*`·`e2e-packaged/**/*`·`playwright.eval.config.ts`·`playwright.packaged.config.ts`, `eslint.config.mjs` node globals files 에 `scripts/**`·`eval/**`·`e2e-packaged/**`(아직 없는 폴더도 미리).
  - **파일**: `electron-builder.yml`, `package.json`, `pnpm-lock.yaml`, `.gitignore`, `e2e/fixtures.ts`, `scripts/checkAsar.ts`, `playwright.packaged.config.ts`, `vitest.config.mts`, `tsconfig.node.json`, `eslint.config.mjs`
  - **테스트**: `scripts/__tests__/checkAsar.test.ts`(vitest) — 가짜 목록으로 포함/미포함 판정(`/.env`·`/node_modules/x/.env.local` 금지, `/src/`·`/e2e/`·`/spec/` 최상위 금지, 오탐 없음: `/node_modules/x/src/index.js` → ok); 기존 e2e 전체(픽스처 변경 회귀)
  - **실행**: `pnpm test scripts` + `make e2e`
  - **검증**: `pnpm type-check` + `pnpm lint` + 단위 테스트 + `pnpm dist:linux` 1회 성공 + `pnpm check:asar` 0
  - **통과 기준**: `release/linux-unpacked/mybrowser` 생성, asar 에 `.env` 없음
  - **커밋**: `chore: electron-builder 설치판 설정·asar 검사 (spec 005 Task 3)`

- [ ] **Task 4: 자격 저장소 (safeStorage)**
  - **묶음**: main-account
  - **작업**: `src/main/app/credentialStore.ts` — 위 「main 모듈 설계」 + SR-1 백엔드 판정(`allowBasicText: boolean` 옵션 — index.ts 가 test 모드면 true). safeStorage 는 주입(`{ isEncryptionAvailable, getSelectedStorageBackend, encryptString, decryptString }`), 파일 쓰기는 임시 파일 → rename, 권한 0o600.
  - **파일**: `src/main/app/credentialStore.ts`
  - **테스트**: `src/main/app/__tests__/credentialStore.test.ts` — 쓰기→읽기 왕복(가짜 safeStorage), 암호화 불가면 디스크 미기록·메모리 유지, `allowBasicText=false` + basic_text 면 디스크 미기록, `allowBasicText=true` 면 허용, 깨진 파일 → null + 삭제, clear
  - **실행**: `pnpm test src/main/app/__tests__/credentialStore.test.ts`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 기기 토큰 암호화 저장소 (spec 005 Task 4)`

- [ ] **Task 5: 게이트웨이 클라이언트**
  - **묶음**: main-account
  - **작업**: `src/main/account/gatewayClient.ts` — 계약 3개 호출, envelope 해제·zod 검증, 비 2xx → `GatewayError(status, message)`, 네트워크 오류 → `GatewayError(0, '구독 서버에 연결하지 못했습니다')`. 타임아웃 10s.
  - **파일**: `src/main/account/gatewayClient.ts`, `src/main/account/types.ts`
  - **테스트**: `src/main/account/__tests__/gatewayClient.test.ts` — 가짜 fetch 로 성공·fail envelope·잘못된 형식·네트워크 오류, 헤더(`x-poll-secret`, `x-api-key`) 확인
  - **실행**: `pnpm test src/main/account`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 게이트웨이 HTTP 클라이언트 (spec 005 Task 5)`

- [ ] **Task 6: 계정 서비스 (활성화 폴링·상태) + IPC 핸들러**
  - **묶음**: main-account
  - **작업**: `src/main/account/accountService.ts` — 「main 모듈 설계」 + FR-4·FR-5·FR-7. 상태 전이: not_required(고정) / inactive → activating → active / activating → inactive(취소·만료·실패) / active → inactive(signOut·401). `startActivation` 은 `openTab(purchase_url)` 호출. 폴링 중 `consumed` 를 토큰 없이 받으면 inactive + “연결 정보를 받지 못했습니다 — 다시 시도해 주세요”. `src/main/ipc/handlers/account.ts` — 3줄 핸들러 + 봉투(`BUSY`·`AGENT_ERROR`).
  - **파일**: `src/main/account/accountService.ts`, `src/main/account/index.ts`, `src/main/ipc/handlers/account.ts`
  - **테스트**: `src/main/account/__tests__/accountService.test.ts` — 가짜 gateway·store·sleep: 시작 → 탭 열림 → pending → approved 저장 → active 이벤트, 만료, 취소(폴링 중단), 재시작 시 저장 토큰으로 active, signOut, handleAuthFailure, direct 모드 not_required, **토큰이 emit·로그 인자에 나타나지 않음**(SR-1), `openTab` 인자에 poll_secret 없음·취소/완료 뒤 pollActivation 미호출(SR-2), 폴링 429/5xx/네트워크 오류는 다음 주기 재시도, `refreshCredits` 401 → handleAuthFailure → inactive, not_required 모드에서 startActivation 은 `AGENT_ERROR`; `src/main/ipc/__tests__/account.test.ts` — 봉투 모양·BUSY
  - **실행**: `pnpm test src/main/account src/main/ipc/__tests__/account.test.ts`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 계정 활성화 서비스·IPC 핸들러 (spec 005 Task 6)`

- [ ] **Task 7: 계정 카드 (사이드바)**
  - **묶음**: renderer-sidebar
  - **작업**: `src/renderer/hooks/useAccount.ts` — getStatus + onChanged 구독, start/cancel/openManage/signOut 실패는 toast(`skills/desktop/error-toast`). `src/renderer/sidebar/AccountCard/index.tsx` — `role="region"` 이름 “계정”; not_required 면 렌더링 안 함; inactive: 안내 + [구독하고 시작하기] (+ message); activating: “구매 페이지에서 결제를 마치면 자동으로 연결됩니다” + 진행 표시 + [취소]; active: “준비됨” + “크레딧 {n}”(null 이면 “크레딧 확인 중”) + [구독 관리] + [연결 해제]. 디자인은 `skills/desktop/design`. `App.tsx` 사이드바 제목 아래에 배치.
  - **파일**: `src/renderer/hooks/useAccount.ts`, `src/renderer/sidebar/AccountCard/index.tsx`, `src/renderer/App.tsx`
  - **테스트**: `src/renderer/hooks/__tests__/useAccount.test.ts` — 초기 조회·이벤트 반영·실패 toast; `src/renderer/sidebar/AccountCard/__tests__/AccountCard.test.tsx` — 4 상태 렌더·버튼 호출
  - **실행**: `pnpm test src/renderer/hooks/__tests__/useAccount.test.ts src/renderer/sidebar/AccountCard`
  - **검증**: `pnpm type-check` + 단위 테스트 (e2e 는 Task 10)
  - **통과 기준**: 기존 e2e 의 `getByRole`·`getByText` 와 부분 일치하는 새 문구 없음 (기존 선택자: `작업 실행`·`작업 중지`·`거부`·`계속`·region `실행 결과` — 계정 카드는 fake 모드에서 렌더링되지 않는다)
  - **커밋**: `feat: 사이드바 계정 카드 (spec 005 Task 7)`

- [ ] **Task 8: 평가 세트 러너**
  - **묶음**: agent-eval
  - **작업**: `eval/scenarios.ts` — 시나리오 배열 `{ id, task, startPage, fakeScenario, expect: { status, maxToolCalls?, approvals? }, onApproval?: 'denied'|'agent'|'user_done' }`: 기존 가짜 시나리오(`search-read`, `reservation-full`, `reservation-stop`, `approval-confirm`, `password-block`, `pixel-confirm`, `ask-user`)를 각각 1개씩. `playwright.eval.config.ts` + `eval/agent.eval.ts` — 시나리오마다 앱을 띄워 할 일 실행 → 승인·질문은 시나리오 지시대로 응답 → 끝 상태·도구 호출 수·승인 수·usage·시간 수집 → `eval/report.ts` 가 마크다운 표 + JSON(`eval/results/`). `--real --yes-spend`(env `MYBROWSER_EVAL_REAL=1` 로 전달) 이면 `MYBROWSER_FAKE_MODEL=0`·direct 모드, 키 없으면 즉시 실패 문장. `--real` 만이면 종료 코드 2 + 안내(FR-8).
  - **파일**: `eval/scenarios.ts`, `eval/report.ts`, `eval/cliArgs.ts`, `eval/cli.mjs`, `eval/agent.eval.ts`, `playwright.eval.config.ts`
  - **테스트**: `eval/__tests__/report.test.ts` — 결과 → 표·JSON·종료 코드; `eval/__tests__/cliArgs.test.ts` — 인자 해석 순수 함수(`eval/cliArgs.ts`): `--real` 단독은 실행 안 함(2), `--real --yes-spend` 는 real env (`eval/cli.mjs` 는 cliArgs 를 type stripping 으로 불러 쓰는 얇은 진입점, 테스트는 .ts 만 import); 실제 `pnpm eval`(가짜 모델) 1회 전 시나리오 통과
  - **실행**: `pnpm test eval` + `pnpm eval`
  - **검증**: `pnpm type-check` + 단위 테스트 + `pnpm eval` 표 출력·종료 코드 0
  - **통과 기준**: `--real` 은 이 Task 에서 실행하지 않는다(비용)
  - **커밋**: `feat: 가짜 모델 평가 세트 러너 (spec 005 Task 8)`

- [ ] **Task 9: 가짜 게이트웨이 픽스처**
  - **묶음**: agent-eval
  - **작업**: `e2e/fixtures/gateway.ts` — `startFakeGateway({ messagesStatus?: 200|401|402 })` → `{ url, close, requestLog }`. 「결정 사항」의 동작. SSE 는 Anthropic 스트림 이벤트(`message_start` → `content_block_start/delta/stop` → `message_delta(stop_reason end_turn, usage)` → `message_stop`). `requestLog` 에는 경로·헤더 이름만(토큰 값은 마스킹).
  - **파일**: `e2e/fixtures/gateway.ts`
  - **테스트**: `e2e/fixtures/__tests__/gateway.test.ts`(vitest node) — 활성화 생성→폴링 2회째 approved→3회째 consumed, 잘못된 poll secret 404, `/v1/account`, `/v1/messages` SSE 를 실제 `@anthropic-ai/sdk` 스트림으로 읽어 텍스트·stop_reason 확인, 메시지 1회 후 `/v1/account` 990, 402 오류 형식
  - **실행**: `pnpm test e2e/fixtures`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `test: 가짜 구독 게이트웨이 픽스처 (spec 005 Task 9)`

- [ ] **Task 10: 연결 — 게이트웨이 모드 run·계정 e2e·설치판 e2e**
  - **묶음**: 연결(메인 직접 — 5단계 merge 뒤, 도우미에게 배정하지 않는다)
  - **작업**: `index.ts` — credentialStore(`safeStorage`)·gatewayClient·accountService 조립(`openTab` = `tabManager.createTab(url)`, `deviceName` = `os.hostname()` 64자 자름), `createModelClient` 에 gateway 모드면 `baseURL: env.gatewayUrl`, `apiKey: account.getDeviceToken()`, `registerIpc` 에 account 핸들러, 종료 시 `account.shutdown()`. `agent/loop.ts` — `TLoopOutcome` 의 failed 에 `apiStatus?: number`(SDK `APIError.status`)를 싣는다. `agent/service.ts` — `deps.modelMode === 'gateway'` 일 때만 401/402/429 를 FR-6 문장으로 바꾸고 401 이면 `onAuthFailure`(direct 모드 문장은 지금 그대로), `onRunEnd` 훅, `MissingCredentialError` 시작 거부. test 모드면 ready 전 `password-store=basic` 스위치(SR-1). `registry.ts` 등록. `docs/DESIGN.md` §1·§2·§5·§7 갱신(게이트웨이·계정·설치판 CDP).
  - **파일**: `src/main/index.ts`, `src/main/agent/loop.ts`, `src/main/agent/service.ts`, `src/main/ipc/registry.ts`, `docs/DESIGN.md`, `e2e/account.spec.ts`, `e2e-packaged/packaged.spec.ts`
  - **테스트**: `src/main/agent/__tests__/loop.test.ts` — APIError status 가 outcome.apiStatus 로 전달; `src/main/agent/__tests__/service.test.ts` — gateway 모드 401/402/429 문장·onAuthFailure·onRunEnd·MissingCredentialError, direct 모드 문장 불변; `e2e/account.spec.ts` — (1) 카드 inactive → [구독하고 시작하기] → 새 탭(가짜 구매 URL) → 자동 active “크레딧 1000” → 할 일 실행 → done → 크레딧 990, (2) 재실행(같은 userData) 시 바로 active, (3) 402 → “크레딧이 부족합니다” 실패, (4) 401 → 카드 inactive, (5) direct·fake 모드(기존 e2e)에서 카드 없음; `e2e-packaged/packaged.spec.ts` — `release/linux-unpacked/mybrowser` 를 executablePath 로, `MYBROWSER_CDP_PORT` 를 빼고 띄워 `search-read` 가짜 시나리오(`MYBROWSER_FAKE_SCENARIO_DIR`) run 이 done (산출물 없으면 실패)
  - **실행**: `pnpm test src/main/agent` + `make e2e SPEC=e2e/account.spec.ts` + `pnpm e2e:packaged`
  - **검증**: `desktop/app-check` — 흐름: 앱 시작(gateway 모드) → 계정 카드 → 활성화 → 탭에 구매 페이지 → 자동 연결 → run done → 크레딧 갱신; 설치판 실행 → run done. 통과 = 콘솔·main 에러 0 + e2e 통과
  - **통과 기준**: 기존 e2e 23개 + 새 e2e 전부 통과, `requestLog`·console-errors.log 에 토큰 값 없음
  - **커밋**: `feat: 게이트웨이 모드 run·계정 연결·설치판 검증 (spec 005 Task 10)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
