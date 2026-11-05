---
description: 변수·함수·타입·파일·IPC 채널·도구 이름 규칙 — 모든 TS/TSX 작성 시
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.mjs"
---

# 네이밍 컨벤션

> `src/renderer/components/ui/`(shadcn CLI 생성)는 예외 — 원본 그대로.

## 폴더·파일
| 대상 | 규칙 | 예시 |
|---|---|---|
| 폴더 | kebab-case | `src/main/agent/tools/`, `e2e/fixtures/pages/` |
| 컴포넌트 폴더 | PascalCase + `index.tsx` | `sidebar/StepTimeline/index.tsx`, `StepTimeline/StepRow.tsx` |
| 훅·유틸·모듈 파일 | camelCase | `useTabs.ts`, `formatStep.ts`, `tabManager.ts` |
| 클래스 1개가 중심인 모듈 | camelCase 파일, PascalCase 클래스 | `tabManager.ts` → `TabManager` |
| 타입 전용 파일 | `{name}Type.ts` (`.d.ts` 는 `env.d.ts` 만) | `src/shared/types/tabType.ts` |
| 상수 파일 | `{name}Constants.ts` | `guardConstants.ts` |
| 도구 파일 | snake_case 도구명과 같게 camelCase | `click.ts`, `typeText.ts`, `requestApproval.ts` |
| 스키마 파일 | `src/shared/ipc/{모듈}.ts`, `src/shared/tools/{도구}.ts` | `ipc/tabs.ts`, `tools/click.ts` |
| 마이그레이션 | `migrations/{NNN}_{snake}.sql` | `001_runs_steps.sql` |

## export 이름
| 대상 | 이름 | 예시 |
|---|---|---|
| zod 스키마 / 추론 타입 | `{Name}Schema` / `T{Name}` | `NavigateRequestSchema` / `TNavigateRequest` |
| IPC 채널 상수 | `IPC.{모듈}.{동작}` → `'{모듈}:{동작}'` | `IPC.agent.approve` |
| 도구 이름(모델에 보임) | snake_case 동사 | `type_text`, `request_approval` |
| 도구 구현 | `{name}Tool` | `clickTool`, `requestApprovalTool` |
| IPC 훅 | `use{Target}` | `useTabs`, `useAgentRun`, `useApproval` |
| store | `use{Target}Store` | `useLayoutStore` |
| 이벤트 타입 | `T{Name}Event` discriminated union | `TAgentEvent` |

## 변수·함수
- camelCase, 배열은 `List` 접미사, boolean 은 `is/has/can`, 상수 UPPER_SNAKE_CASE, 상수 객체는 이름 UPPER + 키 camelCase, Enum 은 이름 UPPER + 멤버 PascalCase.
- 함수는 동사 접두사: `is/has/can`(판별) `create` `convert` `get` `open` `add/minus` `filter` `find` `resolve`(ref→요소) `emit`(이벤트) `to{Target}`(변환 헬퍼: `toUserMessage`, `toToolResult`).
- 핸들러 `handleXxx`, prop 콜백 `onXxx`, 커스텀 훅 `use`, Context `~Context`/`use~Context`/`~Provider`.

## 타입 — `I` / `T` 접두사
- `interface` 는 `I`, `type` 별칭은 `T`. Props 는 `I{Component}Props`. `Type` 접미사 금지. 제네릭은 `T`/`TRow`. 외부 라이브러리 타입은 그대로. React 타입은 개별 import (`ReactNode`).
- 값과 이름이 겹치지 않는다: 스키마 상수 `ClickInputSchema`, 추론 타입 `TClickInput`, 클래스 `TabManager`.

## 한글
- 코드 이름은 영어. 사용자 문구·도구 결과 `summary`·에러 `message` 는 한국어 값.

## 체크리스트
- [ ] `List`/`is·has·can`/동사 접두사?  - [ ] `I`/`T` 접두사, `Type` 접미사 없음?  - [ ] 채널 `{모듈}:{동작}`, 도구 snake_case?  - [ ] 컴포넌트 폴더 + `index.tsx`?
