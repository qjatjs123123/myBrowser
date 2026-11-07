# Spec: 에이전트 정확도 — 잘린 스냅샷·막힌 ref·반복 루프

> **상태**: 🚧 진행중
> **생성일**: 2026-11-07
> **묶음**: 기반 (단일 묶음 — 직접 방식)
> **관련 spec**: 003, 004, 007
> **설계 참조**: docs/DESIGN.md §3 (에이전트 도구·컨텍스트)

---

## 1. 요구사항

### 배경 / 목적
사용자 실행 "코레일 10일 뒤 대전 가는 ktx 10시~11시 직행 예약" 이 `도구 호출 한도(60회)` 로 실패했다 ("동작은 하는데 조금 멍청해", 2026-11-07). run `783efc20` 의 steps 를 보면 원인은 모델보다 **도구가 주는 정보**다.
- 스냅샷이 12,000자에서 앞부터 잘린다. 날짜 레이어(`dialog`)가 트리 269줄 중 131번째 줄부터라 달력 중간에서 잘려, 시간 선택·적용 버튼을 끝내 보지 못하고 `17` 클릭 → `00시 이후 출발` 클릭 → `레이어닫기` 를 3바퀴 돌았다 (#16~#49).
- 잘림 안내가 "scroll 로 더 보기" 인데 스냅샷은 화면 밖까지 포함한 전체 트리라 scroll 해도 같은 12,024자가 나온다 (#19~#29).
- 잡음이 많다: `/url: "#none"` 줄 38개(2.2k자), 이름 없는 `generic`·`cell` 껍데기 줄.
- 페이지를 다시 연 뒤 Playwright 가 ref 를 `f2e5` 처럼 프레임 접두사와 함께 매기는데(재이동·iframe), `RefSchema` 가 `/^e\d+$/` 라 click 이 zod 단계에서 거부된다 → navigate·snapshot 만 반복 (#50~#60). `aria-ref=f2e5` 로는 정상 클릭된다 (확인함).
- 같은 행동·같은 화면이 반복돼도 모델에 알려주지 않는다.
- 프롬프트가 달력은 "screenshot + 픽셀 클릭" 이라 하는데 dev 프로필엔 픽셀 도구가 없다. 레이어 안 [적용] 을 눌러야 반영된다는 안내가 없다.
- 입력 280만 토큰 — `clear_tool_uses` 기본 트리거(10만 토큰)에 닿지 않아 오래된 스냅샷이 그대로 쌓였다.

### 기능 요구사항
- **FR-1**: 도구가 `f{n}e{m}` 형식 ref(재이동 뒤 메인 프레임·iframe 안 요소)를 받아 click·type_text·select_option·read_text 를 실행할 수 있다. 가드 대상 해석·승인 강조도 같은 ref 로 동작한다.
- **FR-2**: snapshot 결과에서 `/url: "#…"`·`/url: "javascript:…"` 줄을 뺀다. 이름·텍스트·속성 없이 ref 만 있는 `generic`/`cell` 줄이 자식 하나만 가지면 그 줄을 빼고 자식을 한 단계 올린다. `[cursor=pointer]` 등 속성이 있는 줄은 그대로 둔다.
- **FR-3**: 트리에 `dialog`·`alertdialog` 가 있으면 그 하위 트리를 첫 줄(URL/제목) 바로 다음에 `[열린 대화상자]` 표시와 함께 먼저 싣고, 나머지 트리를 뒤에 싣는다. 길이 제한(12,000자)은 이 순서로 자른다.
- **FR-4**: `snapshot` 이 선택 입력 `ref` 를 받는다 — 주면 그 요소 하위 트리만(같은 ref 번호 체계) 돌려준다. 잘림 안내는 `[... 잘림 — snapshot 에 ref 를 주면 그 부분만, read_text 로 글만 본다]` 로 바꾼다 (scroll 언급 삭제).
- **FR-5**: run 안에서 같은 화면(ref 를 지운 snapshot 텍스트) 또는 **같은 화면에서의** 같은 행동(key `${tool}|${summary}|${직전 snapshot 화면 key}`, 예: 같은 달력 화면에서 `‘17’ 클릭`)이 **3번째** 나오면 그 도구 결과 끝에 `[반복 3회째] 같은 행동·화면이 반복됩니다 — 진전이 없으면 다른 방법을 쓰거나 ask_user 로 물어보세요` 한 줄을 붙인다 (이후 매번, 횟수 갱신). 사이에 화면이 바뀐 같은 행동(인원 `+` 를 3번 누르기 등)은 세지 않는다. 실행을 막지 않는다.
- **FR-6**: 시스템 프롬프트 — 픽셀 도구 문장(도구 순서 5번, 예약 참고의 달력 문장)은 computer toolset 이 있는 프로필에만 넣는다. 도구 순서 3번은 "글이 길거나 snapshot 이 잘렸으면 snapshot 에 ref 를 줘서 그 부분만, 글은 read_text 로 본다. 로딩을 기다려야 하면 wait_for" 로 바꾼다 (scroll 은 화면 이동용으로만). 공통으로 추가: "날짜·시간 레이어는 고른 뒤 레이어 안의 [확인]·[적용]·[선택] 버튼까지 눌러야 반영된다 — 입력칸 값이 바뀌었는지 snapshot 으로 확인한다", "[반복] 표시가 붙으면 그 행동이 진전을 만드는지 snapshot 으로 확인하고, 아니면 다른 경로를 찾거나 ask_user 로 묻는다". 2번은 "요소는 가장 최근 snapshot(부분 snapshot 포함)이 준 ref(예: e12, f1e3)로만 지정한다. 이전 snapshot 의 ref 는 쓰지 않는다" 로 바꾼다 — 부분 snapshot 뒤 바깥 ref 는 무효다 (2026-11-07 실험: Playwright 가 ariaSnapshot 마다 ref 표를 새로 만든다. Task 2 테스트로 고정). snapshot 도구 설명에도 "ref 를 주면 그 밖의 이전 ref 는 무효가 된다" 를 적는다.
- **FR-7**: `context_management` 의 `clear_tool_uses_20250919` 에 `trigger: { type: 'input_tokens', value: 30000 }`, `keep: { type: 'tool_uses', value: 3 }`, `clear_at_least: { type: 'input_tokens', value: 10000 }`, `exclude_tools: ['ask_user', 'request_approval']` 를 명시한다 (사용자 답은 지우지 않는다).

### 안전 요구사항
- **SR-1**: 승인 흐름은 바꾸지 않는다 (가드는 SR-3 강화만). f-ref 도 기존 ref 와 같은 `resolveTarget` → `checkGuard` 경로를 탄다 — iframe 안 확정 버튼도 승인 창에서 멈춘다 (테스트로 확인).
- **SR-3** (가드 강화 — 사용자 선택 2026-11-07): ref 대상이 하위 프레임 요소면 가드의 URL 규칙은 프레임 URL 과 최상위 탭 URL 을 둘 다 검사한다. `IGuardInput.topPageUrl?: string` 을 더하고, `checkGuard` 는 `pageUrl` 로 판정한 결과가 allow 이고 `topPageUrl` 이 있고 `pageUrl` 과 다르면 `pageUrl: topPageUrl` 로 한 번 더 판정해 그 결과를 쓴다 (block·require_approval 은 그대로 — 약해지는 경로 없음). `tools/index.ts` 의 `judge()` 는 대상이 있으면 `topPageUrl = driver.getPageInfo().url` 을 넘긴다. 승인 상한(SR-4)은 기존대로 마지막에 적용.
- **SR-2**: 반복 경고는 결과 텍스트에 붙는 안내일 뿐 실행·차단 여부를 바꾸지 않는다. 새 범용 실행 도구 없음, 도구 한도(60) 그대로.

### 비기능 요구사항 / 제약
- 스냅샷 압축은 문자열 → 문자열 순수 함수(`src/main/browser/snapshotCompact.ts`)로, 실패하면 원문을 쓴다(트리 해석 불가 줄은 그대로 둔다).
- 가짜 모델의 `$ref(role:name)` 자리표시자(`src/main/agent/fake/refPlaceholder.ts`)도 f-ref 를 찾아야 한다.
- 프롬프트는 프로필마다 고정 문자열 — 캐시 prefix 유지. `prompts/__tests__/system.test.ts` 스냅샷 2개(픽셀 있음/없음).
- **요구사항 변경으로 바뀌는 기존 테스트** (약화 아님 — 같은 항목을 새 값으로 확인):
  - `src/main/browser/__tests__/snapshot.test.ts` 잘림 문구 기대값.
  - `src/shared/tools/__tests__/schemas.test.ts` "RefSchema 는 e+숫자만 받는다" → "e·f-ref 만 받는다" (f2e5 허용, f2·e·x1 거부 추가), CASE_LIST snapshot valid 에 `{ ref: 'e3' }`.
  - `src/main/agent/prompts/__tests__/system.test.ts` 스냅샷 → 2개. 안전·승인 문구 `it.each` 는 두 프롬프트 모두, '픽셀 도구'·'연달아 찍지 않는다' 는 `hasComputerToolset: true` 에만 기대하고 픽셀 없음엔 `not.toContain`.
  - `src/main/browser/__tests__/driver.test.ts` `driver.snapshot()` → `driver.snapshot({})`.

### 범위 제외
모델 변경(이번 실행은 `MYBROWSER_MODEL=…sonnet-4-6` 덮어쓰기), 도구 한도 변경, 사이트별(코레일) 전용 규칙, 실제 사이트·실제 API 테스트, 스냅샷 diff 반환.

---

## 2. 설계 개요

### 영향받는 파일
- shared: `src/shared/tools/ref.ts`(정규식), `src/shared/tools/snapshot.ts`(`ref?`), `src/shared/tools/driver.ts`(`snapshot(input)`)
- main/browser: `snapshotCompact.ts`(신규), `snapshot.ts`(압축·대화상자 우선·ref 부분·잘림 문구), `driver.ts`
- main/agent: `fake/refPlaceholder.ts`, `tools/snapshot.ts`(설명), `repeatTracker.ts`(신규), `tools/index.ts`(결과에 반복 안내), `service.ts`(ctx·프롬프트 선택), `prompts/system.ts`(`buildSystemPrompt`), `loop.ts`(context_management)
- e2e: `e2e/fixtures/pages/date-layer.html`, `e2e/fixtures/model/date-layer.json`, `e2e/agent-accuracy.spec.ts`
- 문서 (Task 6): `.claude/rules/agent/guard.md` 「가드가 보는 것」, `.claude/rules/agent/tools.md` 「컨텍스트·비용」, `.claude/rules/electron/main.md` snapshot 줄, `docs/DESIGN.md` §3 도구 표 snapshot 줄

### IPC 계약
변경 없음.

### 도구 계약
| 도구 | 입력 | 반환 | 가드 대상 | 승인 |
|---|---|---|---|---|
| `snapshot` (변경) | `z.strictObject({ ref: RefSchema.optional() })` | `URL: … / 제목: …` + (있으면 `[열린 대화상자]` 하위 트리) + 압축 트리, 12k 자 제한 | 아니오 | 아니오 |
| ref 를 받는 도구 전부 (변경) | `RefSchema = z.string().regex(/^(f\d+)?e\d+$/)` | 그대로 | 그대로 | 그대로 |

```ts
// src/main/browser/snapshotCompact.ts
/** aria 스냅샷 텍스트 압축 — 잡음 줄 제거·빈 껍데기 접기·dialog 먼저 (spec 015 FR-2·3) */
export function compactSnapshot(tree: string): string;

// src/main/agent/repeatTracker.ts
/** run 하나의 반복 횟수 — key 가 몇 번째인지 돌려준다 */
export interface IRepeatTracker { lastScreenKey: string; count(key: string): number }
export function createRepeatTracker(): IRepeatTracker;
/** 반복 key — snapshot 은 ref(`[ref=…]`)를 지운 resultText, 그 밖은 `${tool}|${summary}|${lastScreenKey}` */
export function toRepeatKey(input: { tool: string; summary: string; resultText: string; lastScreenKey: string }): string;
// IRepeatTracker 는 lastScreenKey: string (처음엔 '') 를 들고, 성공한 snapshot 결과마다(부분 snapshot 포함) 그 key 로 갱신한다.
export const REPEAT_THRESHOLD = 3;
export function toRepeatNotice(count: number): string; // `\n[반복 ${count}회째] …`
```
- `IToolRunContext` 에 `repeatTracker: IRepeatTracker` 추가. `executeStep` 이 구조 도구 결과(문자열)에만 안내를 붙인다 — 픽셀 멤버(이미지)·사람 개입 도구 제외. step 기록(`endStep`)에는 원문만 남긴다.
- `buildSystemPrompt({ hasComputerToolset }): string` — `SYSTEM_PROMPT` 상수는 지우고 service 가 `deps.profile.hasComputerToolset` 으로 만든다.

### 데이터
변경 없음.

### 열린 질문
없음.

---

## 3. 작업 순서 (Tasks)

> ⚠️ 게이트 규칙·vibe-build 우선 규칙은 템플릿과 같다 (`.claude/templates/spec-template.md`).

- [ ] **Task 1: f-ref 받기**
  - **묶음**: 기반
  - **작업**: `RefSchema` 정규식, `refPlaceholder` 정규식 `((?:f\d+)?e\d+)`, `src/main/browser/__tests__/helpers.ts` ref 찾기 정규식, SR-3 가드 강화(`IGuardInput.topPageUrl`, `checkGuard` 재판정, `tools/index.ts` `judge()`).
  - **파일**: `src/shared/tools/ref.ts`, `src/main/agent/fake/refPlaceholder.ts`, `src/main/browser/__tests__/helpers.ts`, `src/shared/guard/types.ts`, `src/main/agent/guard.ts`, `src/main/agent/tools/index.ts`, `e2e/fixtures/pages/browser-frame.html`(신규 — 메인에 [다음 페이지] 링크, `<iframe srcdoc>` 안에 [예약 확정]·[다음] 버튼과 `window.__clickLog`; actions·overlay·target 테스트가 쓴다), 테스트 `src/main/agent/__tests__/guard.test.ts`, `src/main/agent/tools/__tests__/index.test.ts`, `src/main/agent/fake/__tests__/refPlaceholder.test.ts`, `src/shared/tools/__tests__/schemas.test.ts`, `src/main/browser/__tests__/{actions,overlay}.test.ts`
  - **테스트**:
    - `src/shared/tools/__tests__/schemas.test.ts` — RefSchema 케이스만 (f2e5 허용, f2·e·x1 거부).
    - `refPlaceholder.test.ts` — f-ref 줄 치환.
    - `src/main/browser/__tests__/actions.test.ts` — 픽스처를 두 번 goto 한 뒤, iframe(srcdoc) 안 버튼 각각: **click 전에 고른 ref 가 `/^f\d+e\d+$/` 인지 먼저 단언**하고 click 성공, 같은 ref 로 `resolveTarget` 이 대상 이름을 돌려준다. 재이동 f-ref 가 재현되지 않으면 그 케이스는 iframe 테스트로 대신하고 진행 로그에 적는다.
    - `src/main/browser/__tests__/overlay.test.ts` — iframe 안 버튼의 f-ref 로 강조하면 강조 rect 가 그 버튼 위치.
    - `src/main/agent/tools/__tests__/index.test.ts` — click `{ ref: 'f1e3' }`, 대상 이름 `예약 확정` 이면 step waiting, 승인 전 `driver.click` 0회, 거부하면 0회 그대로. 최상위 URL `/checkout` + 대상 pageUrl `about:srcdoc` 의 [다음] 버튼 click 은 require_approval 이고 승인 전 실행 0회.
    - `src/main/agent/__tests__/guard.test.ts` — SR-3: `pageUrl: 'about:srcdoc'`, `topPageUrl: 'https://shop.test/checkout'` 인 [다음] click → require_approval; `topPageUrl` 이 없거나 같으면 기존 판정 그대로; 프레임 쪽이 block 이면 block 유지.
  - **커밋 type**: 가드 변경이 들어가므로 `fix` (강화).
  - **실행**: `pnpm test src/shared/tools src/main/agent src/main/browser`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `fix: 재이동·iframe 의 f-ref 를 도구가 받는다 (spec 015 Task 1)`

- [ ] **Task 2: 스냅샷 압축·대화상자 우선·부분 보기**
  - **묶음**: 기반
  - **작업**: `compactSnapshot`(FR-2·3), `takeSnapshot(page, { ref })` — ref 면 `findRefLocator` → `locator.ariaSnapshot({ mode: 'ai' })`, 없는 ref 면 기존 not-found 사유. 잘림 문구(FR-4). `SnapshotInputSchema`·`IBrowserDriver.snapshot(input)`·driver·도구 설명 갱신 (호출부·가짜 드라이버 같은 Task 에서). `scroll` 도구 설명에서 snapshot 잘림 언급을 빼고 "화면 밖 내용을 불러오거나(무한 스크롤) 화면을 옮길 때만" 으로 (`tools/__tests__/scroll.test.ts` 는 그대로 통과).
  - **파일**: `src/main/browser/{snapshotCompact,snapshot,driver}.ts`, `src/shared/tools/{snapshot,driver}.ts`, `src/main/agent/tools/{snapshot,scroll}.ts`, `src/main/browser/__tests__/driver.test.ts`, `src/main/agent/tools/__tests__/snapshot.test.ts`, `src/shared/tools/__tests__/schemas.test.ts`(CASE_LIST snapshot valid 를 `{ ref: 'e3' }` 로, invalid `{ full: true }` 유지), `e2e/fixtures/pages/date-layer.html`(Task 5 e2e 와 공용)
  - **테스트**: `src/main/browser/__tests__/snapshotCompact.test.ts` — `#none` 줄 삭제·실제 url 유지, 껍데기 generic/cell 접기(자식 2개·pointer 는 유지), dialog 가 맨 앞 + `[열린 대화상자]`, dialog 없으면 순서 그대로. `snapshot.test.ts` — `date-layer.html` 에서 레이어를 연 뒤 결과 12k 안에 dialog 의 [적용] 버튼이 있다, 전체 snapshot → 부분 snapshot 뒤 부분 결과의 ref click 성공 + 부분 밖 이전 ref 는 not-found 사유를 돌려준다, 새 잘림 문구. `tools/__tests__/snapshot.test.ts` — `toHaveBeenCalledWith({ ref: 'e3' })`.
  - **실행**: `pnpm test src/main/browser src/main/agent/tools`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 스냅샷 압축·대화상자 먼저·ref 부분 보기 (spec 015 Task 2)`

- [ ] **Task 3: 반복 감지 안내**
  - **묶음**: 기반
  - **작업**: `repeatTracker.ts`, `IToolRunContext.repeatTracker`, `executeStep` 에서 안내 붙이기, service `createToolContext` 에 `createRepeatTracker()`.
  - **파일**: `src/main/agent/repeatTracker.ts`, `src/main/agent/tools/index.ts`, `src/main/agent/service.ts`, ctx 를 만드는 테스트(`tools/__tests__/index.test.ts`, `computer/__tests__/toolset.test.ts`)
  - **테스트**: `src/main/agent/__tests__/repeatTracker.test.ts`(ref 만 다른 snapshot 은 같은 key, 3번째부터 안내, 사이에 snapshot 화면이 바뀐 같은 click 3회는 안내 없음), `tools/__tests__/index.test.ts`(같은 화면에서 같은 요약 click 3회 → 3번째 결과에 `[반복 3회째]`, step 기록엔 없음, 실패 결과엔 붙지 않음)
  - **실행**: `pnpm test src/main/agent`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 같은 행동·화면 반복을 모델에 알린다 (spec 015 Task 3)`

- [ ] **Task 4: 프롬프트·컨텍스트 정리**
  - **묶음**: 기반
  - **작업**: `buildSystemPrompt({ hasComputerToolset })`(FR-6), service 연결, loop `context_management`(FR-7).
  - **파일**: `src/main/agent/prompts/system.ts`, `src/main/agent/service.ts`, `src/main/agent/loop.ts`
  - **테스트**: `prompts/__tests__/system.test.ts` 스냅샷 2개 + 픽셀 없음엔 `screenshot` 문자열 없음, 레이어 [적용] 문장은 둘 다. `loop.test.ts` — 요청의 `context_management.edits[0]` 가 FR-7 값.
  - **실행**: `pnpm test src/main/agent`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 프로필별 프롬프트와 오래된 도구 결과 정리 (spec 015 Task 4)`

- [ ] **Task 5: 날짜 레이어 회귀 e2e + 문서**
  - **묶음**: 기반
  - **작업**: `date-layer.html` — 링크 수백 개 긴 본문(압축 전 12k 초과) + [날짜 선택] → 맨 뒤 `role="dialog"` 레이어(달력 링크 1~30, `출발 시각` select, [적용] — 적용해야 `출발일` 입력칸에 `2026-11-17 10시`). `date-layer.json`: snapshot → click `$ref(button:날짜 선택)` → snapshot → click `$ref(link:17)` → select_option `$ref(combobox:출발 시각)` ["10시"] → click `$ref(button:적용)` → snapshot → text.
  - **파일**: `e2e/fixtures/model/date-layer.json`, `e2e/agent-accuracy.spec.ts` (`date-layer.html` 은 Task 2 에서 만든다)
  - **테스트**: `e2e/agent-accuracy.spec.ts` — 상태 `완료`, 탭의 `출발일` 값 `2026-11-17 10시`, 타임라인에 `‘적용’ 클릭`.
  - **실행**: `make e2e SPEC=e2e/agent-accuracy.spec.ts`
  - **검증**: `desktop/app-check` — 앱 실행 → 픽스처 열기 → 할 일 실행 → 완료·입력칸 값 확인, 콘솔·main 에러 0
  - **통과 기준**: 새 e2e + 기존 e2e 전부 통과
  - **커밋**: `test: 날짜 레이어 회귀 e2e (spec 015 Task 5)` — e2e 파일만

- [ ] **Task 6: 문서 반영**
  - **묶음**: 기반
  - **작업**: `.claude/rules/agent/tools.md` 「컨텍스트·비용」(압축·dialog 우선·트리거 값·반복 안내), `.claude/rules/electron/main.md` snapshot 줄, `docs/DESIGN.md` §3 snapshot·컨텍스트 줄, `.claude/rules/agent/guard.md` 「가드가 보는 것」에 `topPageUrl` + "하위 프레임 대상이면 프레임 URL 판정이 allow 일 때 최상위 탭 URL 로 다시 판정한다 (spec 015 SR-3, 강화만)".
  - **테스트**: 문서 전용 — 코드 변경 없음 (`make check` 통과 유지).
  - **실행**: `make check`
  - **검증**: 문서 내용이 구현(FR-2~7)과 일치
  - **통과 기준**: `make check` 통과
  - **커밋**: `docs: 스냅샷·컨텍스트 정리 규칙 반영 (spec 015 Task 6)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
