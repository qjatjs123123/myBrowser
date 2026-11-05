---
name: desktop-spec-create
description: 요구사항을 spec/NNN-*.md 작업 계획 문서로 정리하는 절차 (코드 작성 없음). vibe-build 2단계에서 읽는다.
---

# desktop/spec-create — 요구사항을 spec 문서로 정리

> 절차 스킬 — 슬래시 커맨드가 아니다. 표기법·vibe-build 모드·커밋 절차·spec 번호 규칙은 **`.claude/skills/COMMON.md` 를 먼저 읽고** 따른다.

> **vibe-build 모드** — 공통 규칙은 `COMMON.md` §2. 이 스킬만의 차이: spec 파일과 색인은 미커밋으로 둔다 (spec-reviewer PASS 후 vibe-build 3단계가 커밋). Task 의 "커밋" 필드는 워크트리·단독 실행용으로 그대로 적는다. UI·에이전트 동작 Task 의 "검증" 필드에는 app-check 용 흐름을 적는다 (vibe-build 7단계가 사용).

요구사항을 분석해 **`spec/{NNN}-{기능명}.md`** 를 생성하고 색인 `spec/README.md` 에 한 줄을 추가한다.
**모든 개발 요청은 spec 을 남긴다** — 작은 수정·버그도 예외 없음 (요구사항 3줄 + Task 1개로 축약 가능).
**이 스킬은 코드를 절대 작성하지 않는다** — 구현은 `desktop/spec-run`.

## 입력
```
desktop/spec-create <기능 요구사항 설명>
```

---

## 실행 절차

### 1️⃣ 컨텍스트 수집
- 루트 `CLAUDE.md`, `docs/DESIGN.md`(해당 절), `.claude/rules/architecture.md` 를 읽는다.
- 이번 기능이 걸치는 프로세스별 rules 를 읽는다: main → `rules/electron/main.md`, IPC → `rules/electron/ipc.md`, 에이전트 → `rules/agent/*.md`, 화면 → `rules/renderer/*.md`.
- 이름은 `rules/renderer/naming-convention.md` 와 `rules/electron/ipc.md`(채널명)·`rules/agent/tools.md`(도구명) 규칙대로 짓는다 — 도우미는 spec 의 이름을 그대로 쓴다.
- 기존 코드 중 겹치는 부분을 grep 으로 파악한다. `spec/README.md` 에서 관련 spec 을 찾아 **읽는다**.

### 2️⃣ 요구사항 분석
- 검증 가능한 단위(FR-1, FR-2 …)로 쪼갠다. "~할 수 있다" 형태.
- **에이전트 관련 요청이면 안전 요구사항(SR-n)을 따로 적는다** — 어떤 행동 전에 승인이 필요한가, 가드 패턴에 추가할 문구·URL, 입력하면 안 되는 값.
- 모호한 부분은 **추측으로 채우지 말고** "열린 질문"에 남긴다. 범위 제외를 명시한다.

### 3️⃣ Task 분해
- **Task 1개 = 테스트 가능한 최소 단위 1개.** 프로세스·관심사가 다르면 나눈다.
- 만드는 순서: `shared/`(IPC·도구 스키마·타입) → `main/`(browser → tabs/store → agent/tools → agent/guard → agent/loop → ipc) → `preload/` → `renderer/`(hooks·store → components → 화면 조립) → e2e.
- **모든 Task 에 테스트를 명시** — 파일 경로, 검증 항목, 실행 명령(`pnpm test {경로}`). `type-check`·`lint` 는 테스트를 대체하지 못한다.
  - **UI Task(renderer 컴포넌트·화면)와 에이전트 동작 Task(루프·가드·도구)는 Playwright `_electron` e2e 를 반드시 명시** — `e2e/{기능}.spec.ts` + `make e2e SPEC=e2e/{기능}.spec.ts` + 핵심 흐름. 에이전트 흐름은 가짜 모델 모드(`MYBROWSER_FAKE_MODEL=1`, `e2e/fixtures.ts` 의 응답 스크립트)로 돌린다.
  - 도구 Task 는 Playwright 로 **로컬 HTML 픽스처**(`e2e/fixtures/pages/*.html`)에 대해 단위 테스트한다 — 외부 사이트에 의존하는 테스트 금지.
  - `playwright.config.ts`·`e2e/fixtures.ts` 가 없으면 e2e 셋업 Task 를 앞에 둔다.
- **모든 Task 에 "검증" 필드** — UI·에이전트 동작: `desktop/app-check` (흐름 단계 나열, 통과 = 콘솔·main 에러 0 + e2e 통과). 그 외: `pnpm type-check` + 단위 테스트.
- **모든 Task 에 "커밋" 필드** — `{type}: {요약} (spec {NNN} Task {k})`.
- **모든 Task 에 "묶음" 필드** — `COMMON.md` §5. 공유 파일(`shared/`·`preload/`·`package.json`·`components/ui`)은 `기반` 또는 유일한 묶음 맨 앞 Task 로.
- **Task 경계 = 커밋마다 green** — 타입·시그니처를 바꾸는 Task 는 소비자(호출부·테스트)를 같은 Task 에서 고친다.
- **IPC 계약**: 채널을 추가·변경하면 「IPC 계약」 섹션에 채널명·방향(invoke/event)·요청/응답 zod 스키마를 적는다. **도구 계약**: 도구를 추가·변경하면 「도구 계약」 섹션에 이름·입력 스키마·반환·가드 대상 여부·승인 필요 여부를 적는다.
- 기존 e2e 의 `getByRole(name)`·`getByText` 선택자와 **부분 일치**로 겹치는 새 문구가 있으면 그 e2e 수정을 마지막 Task "검증"에 적는다.

### 4️⃣ spec 파일 생성
- 번호·파일명·템플릿·색인은 **`COMMON.md` §4**. 상태 `📝 계획됨`.
- **생성 후 spec 과 색인만 커밋** (`COMMON.md` §3): `docs: spec {NNN} {기능명} 작성`. 열린 질문이 남아 곧 수정될 예정이면 답변 반영 후 커밋. *(vibe-build 모드에서는 커밋하지 않는다)*

### 5️⃣ 확인
호출한 쪽에 spec 경로, Task 목록 요약(번호 + 제목 + 테스트 한 줄), 열린 질문을 넘긴다.

---

## 금지
- ❌ 코드 파일 생성·수정
- ❌ 테스트 없는 Task, 외부 사이트에 의존하는 테스트
- ❌ 기존 코드·DESIGN.md 확인 없이 기억으로 IPC·도구 스키마 서술
- ❌ 열린 질문이 있는데 임의로 결정
- ❌ 안전 요구사항(SR) 없이 에이전트 행동 Task 작성
