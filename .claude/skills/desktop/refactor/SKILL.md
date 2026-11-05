---
name: desktop-refactor
description: 변경된 TS/TSX 파일(main·preload·renderer·shared)을 .claude/rules 기준으로 검토 — 중복, 재사용성, 가독성, 구조·프로세스 경계, 에이전트 도구 설계 — 하고 안전 항목만 수정하는 절차.
---

# desktop/refactor — 변경된 파일 리팩토링 검토

> 절차 스킬 — **`.claude/skills/COMMON.md` 를 먼저 읽고** 따른다.

> **vibe-build 모드** — 공통 규칙은 `COMMON.md` §2. 대상은 호출자가 정한다 — 워크트리 방식은 `--spec {NNN}` + 미커밋 변경, 직접 방식은 미커밋 변경. 적용한 수정은 커밋하지 않는다 (vibe-build 9단계에 포함). 무관해 보이는 파일은 검토에서 빼고 보고에만 남긴다.

**우선순위 (이 순서대로 본다):**
1. **중복 최소화** — 같은 로직/마크업이 두 곳 이상
2. **재사용성** — 추출하면 다른 곳에서도 쓸 수 있는 단위
3. **가독성** — 위→아래 한 흐름, 매직 넘버·복잡 조건·중첩 삼항 없음
4. **구조·프로세스 경계** — main/preload/renderer/shared 의존 방향, IPC 를 거치지 않은 접근, 렌더러의 Node 접근
5. **에이전트 설계** — 도구 하나 = 행동 하나, 가드 대상 행동이 전용 도구로 승격돼 있는가, 프롬프트에 하드코딩된 규칙이 가드로 내려가야 하는가 (`rules/agent/*.md`)

## 입력
- `desktop/refactor` — 검토만. `--apply` — 안전 항목만 수정. `--spec {NNN}` — 그 spec 커밋들이 바꾼 파일 대상. `{경로...}` — 지정 파일·폴더.

---

## 1️⃣ 변경 파일 수집
- 기본: `git status --porcelain` + `git diff --name-only HEAD`
- `--spec {NNN}`: `git log --grep="(spec {NNN}" --name-only --pretty=format: | sort -u` (0개면 알리고 종료)
- 필터: `.ts/.tsx/.js/.mjs` 만, `src/`·`e2e/` 아래만, `node_modules/`·`out/`·`dist/`·`coverage/` 제외. 0개면 "변경된 코드 없음".
- 단독 실행이면 파일 목록을 먼저 보여주고 진행한다.

## 2️⃣ 파일 경로 → 적용 룰
| 경로 | 룰 (`.claude/rules/`) |
|---|---|
| `src/main/agent/**` | `agent/tools.md`, `agent/guard.md`, `electron/main.md` |
| `src/main/**` (그 외) | `electron/main.md`, `electron/ipc.md` |
| `src/preload/**` | `electron/preload.md`, `electron/ipc.md` |
| `src/shared/**` | `electron/ipc.md`, `renderer/types-layer.md` |
| `src/renderer/**/*.tsx`, `hooks/**` | `renderer/react-convention.md` |
| `src/renderer/**/store/**` | `renderer/store-layer.md` |
| 모든 `.ts/.tsx` | `renderer/naming-convention.md`, `renderer/javascript-convention.md`, `architecture.md` |

## 3️⃣ 우선순위별 검토
**변경 파일 안만 보지 말 것** — 중복·재사용성은 `src/**` 전체와 비교한다.

#### 🥇 중복 — 같은 fetch/상태 패턴, 같은 IPC 호출 래퍼, 같은 zod 스키마가 shared 와 renderer 에 따로, 같은 JSX. "갈라질 가능성이 있으면 통합하지 않는다".
#### 🥈 재사용성 — 순수 함수는 `src/shared/` 또는 `src/renderer/utils/`, 도메인 무관 훅은 `src/renderer/hooks/`, 반복 마크업은 `components/shared/<Name>/`. 원자 UI 는 shadcn `components/ui/*` 재사용.
#### 🥉 가독성 — 함수 15줄 초과 분리, JSX 중첩 3~4단계+, 중첩 삼항 → IIFE+if, 매직 값 상수화, early return, 뜻 없는 이름.
#### 4️⃣ 구조·경계
- renderer 가 `electron`·`node:*` 를 import, preload 가 로직을 가짐, main 이 DOM 개념을 가짐 → 경계 위반.
- IPC 핸들러 안에 비즈니스 로직 → `src/main/{모듈}/` 서비스로. 스키마 검증 없는 IPC.
- 컴포넌트가 IPC 를 직접 호출 → `hooks/` 로.
- Effect 남용, 컴포넌트 안 컴포넌트 정의, props drilling 3단계+.
#### 5️⃣ 에이전트 설계
- 한 도구가 여러 행동을 하거나(`click_and_type`), 입력 스키마가 느슨(`any`, `z.record`)하면 분리·강화 제안.
- 가드가 필요한 행동(클릭·제출·네비게이션)이 범용 `evaluate` 류 도구로도 가능하면 **가드 우회 경로** — 차단 제안.
- 시스템 프롬프트의 "~하지 마라" 규칙 중 결정적으로 검사 가능한 것은 `guard.ts` 로 내릴 것을 제안.
- 도구 결과가 과도하게 큼(전체 DOM 덤프) → 요약·절단 제안 (컨텍스트 비용).

## 4️⃣ 보고서 형식
```
## src/main/agent/tools/click.ts
**적용 룰**: agent/tools, electron/main
🥇 중복
- tools/type.ts 와 ref 해석 로직(line 8-20) 동일 → resolveRef 헬퍼 추출 (갈라질 가능성 낮음)
5️⃣ 에이전트 설계
- 확정 버튼 패턴 검사가 도구 안에 있음 → guard.ts 로 이동 (자동 수정 금지, 제안)
```
요약: 검사 파일 수, 순위별 건수, 자동 수정 가능/수동 확인 필요.

## 5️⃣ `--apply` 모드
자동 수정 OK: 매직 값 → 상수, 인라인 조건 → 이름 있는 변수, 중첩 삼항 → IIFE+if, 미사용 import 제거, 파생값 useEffect → 렌더 중 계산(명백한 경우), 지역 변수·private 함수 이름 개선, 의미 없는 `<div>` → Fragment.
자동 수정 **금지**(제안만): 컴포넌트·훅·도구 추출, 파일 이동, 중복 통합, 경계 변경, 외부 시그니처 변경, **가드·승인 흐름·프롬프트 변경**, 비즈니스 로직 변경.
수정 후 보고서를 다시 출력. **완료 커밋**: 수정 1건 이상 + `pnpm test`·`pnpm type-check` 통과 시 수정 파일만 add 후 `refactor: {대상 요약} (desktop/refactor --apply)` — 단 커밋을 관장하는 다른 스킬이 호출했으면(spec-run·vibe-build·vibe-refactor) 커밋하지 않는다.

## 안전 가드
- 변경 파일 50개 초과 시 사용자 확인. 테스트 파일은 1~2순위만 가볍게. 자동 생성 파일(`out/`, lock) 무시. 중복 통합 제안은 "갈라질 가능성" 한 줄 평가 동반.
