# CLAUDE.md — myBrowser

Electron(Chromium) 기반 **브라우저 에이전트** 단일 패키지. 사용자가 사이드바에 "오늘 7시 2명 ○○ 예약해줘"라고 쓰면 Claude 에이전트가 탭 안에서 직접 이동·읽기·입력·클릭하고 **확정 직전에 멈춰** 승인을 받는다.
설계 문서는 `docs/DESIGN.md`(스택·프로세스 구조·도구·안전 게이트·로드맵), 구조 지도는 `AGENTS.md` → `.claude/rules/architecture.md`.
**프로젝트 `.claude/rules/**`·`skills/**` 가 전역 `~/.claude/{rules,skills}` 와 다르면 프로젝트 것이 우선**한다. 전역 커맨드 `/frontend:*`·`/backend:*`·`setting` 은 이 프로젝트에서 쓰지 않는다 (Next.js·FastAPI 전제).

## 사용자 응대 원칙
- 사용자는 **개발자**다. 보고는 짧게 — 무엇이 생겼고, 어디서 확인하는지, 아직 안 되는 것.
- 코드 변경 요청은 **vibe-build**, 실행·확인은 **vibe-run**, 정리는 **vibe-refactor**, 환경 미준비는 **vibe-setup** (매 입력마다 훅이 상기시킨다). 슬래시 커맨드가 아니라 스킬 파일을 읽고 따른다.
- **확인을 받아야 하는 것**: 요구사항 확정, 안전 게이트(`guard.ts`)·승인 흐름 변경, 구조 대규모 변경, 비용 발생(실제 API 호출 테스트·모델 변경), 설계(`docs/DESIGN.md`)와 어긋나는 결정.

## 하네스 구성 (자동 적용 — 수정 시 주의)

| 겹 | 장치 | 위치 |
|---|---|---|
| 안내 | 세션 시작 상태 주입 / 매 입력 라우팅 | `.claude/hooks/session-context.sh`, `route-prompt.sh` |
| 안내 | 구조 지도·프로세스별 규칙 (해당 파일 편집 시 자동 로드) | `.claude/rules/architecture.md`, `rules/{electron,agent,renderer}/`, `rules/test-convention.md` |
| 안내 | 진입점 스킬 | `.claude/skills/vibe-{setup,build,run,refactor}/` |
| 안내 | 절차·기술 스킬 | `.claude/skills/desktop/{spec-create,spec-run,refactor,app-check,zod-usage,error-toast,design}/` |
| 검증 | spec 독립 검증 서브에이전트 — IPC·도구 계약, 안전 요구사항→가드, Task 경계, 테스트 독립성 (PASS 필수) | `.claude/agents/spec-reviewer.md` |
| 실행 | 개발 서브에이전트 — 묶음별 워크트리 병렬 (최대 3) | `.claude/agents/desktop-dev.md`, `scripts/worktree-setup.sh` |
| 제약 | 프로세스 경계 import 규칙 (renderer 의 electron/node 금지 등) | `eslint.config.mjs` |
| 제약 | 커밋 메시지 형식 / 브랜치 흐름 / 민감 정보 커밋 차단 | `.claude/hooks/{commit-msg-check,git-guard}.sh`, `.githooks/`, `scripts/check_{commit_msg,secrets}.py` |
| 제약 | 편집 직후 eslint --fix + prettier | `.claude/hooks/post-edit-format.sh` |
| 제약 | 위험 명령 차단 / 권한 허용 목록 | `.claude/settings.json` |
| 검증 | 앱 실검증 — Playwright `_electron` 으로 실제 앱을 띄워 에러 0 → e2e 고정 (UI·에이전트 Task 필수) | `.claude/skills/desktop/app-check/SKILL.md` |
| 검증 | 종료 시 품질 게이트 — lint·타입·vitest + 새 파일 테스트 누락 + e2e (실패하면 종료 차단, 최대 6회) | `.claude/hooks/quality-gate.sh` |
| 검증 | 최종 검증 루프 | `.claude/skills/vibe-build/harness.md` |
| 정리 | CI / 주간 점검 | `.github/workflows/ci.yml`, `scripts/gc/check.sh` |

## 기술 스킬 (작업 시작 전에 해당 파일을 읽고 따른다)

| 작업 상황 | 읽을 파일 |
|---|---|
| zod 스키마 — IPC 요청/응답, 도구 입력, 저장 데이터, 폼 | `.claude/skills/desktop/zod-usage/SKILL.md` |
| 사이드바 toast·에러 표시 | `.claude/skills/desktop/error-toast/SKILL.md` |
| 크롬·사이드바·모달 화면 디자인 | `.claude/skills/desktop/design/SKILL.md` |
| Claude API·SDK 사용 (모델 id·파라미터·toolRunner·캐싱) | 전역 `claude-api` 스킬 — 기억으로 쓰지 않는다 |

## 개발 플로우
```
vibe-build:    desktop/spec-create → spec-reviewer PASS → [desktop/spec-run 직접 | desktop-dev 워크트리 병렬 → merge]
               → desktop/refactor → desktop/app-check(실제 앱 e2e) → vibe-build/harness.md → 검증 반영 커밋 → dev merge
vibe-refactor: (dev 에서 feature/refactor-{slug}) desktop/refactor → harness → 커밋 → dev merge
```
- **모든 개발 요청은 spec 을 남긴다** — `spec/{NNN}-{기능}.md`, 색인 `spec/README.md`. 기존 기능을 건드리기 전에 관련 spec 을 읽는다.
- 모든 Task 는 테스트를 포함하고, 실패 상태로 다음 Task 진행 금지. 테스트 약화 금지. **실제 Claude API·외부 사이트에 의존하는 테스트 금지** (가짜 모델 모드 `MYBROWSER_FAKE_MODEL=1`, 로컬 HTML 픽스처).
- 코드를 바꾸는 요청은 `dev` 에서 작업 브랜치(`feature/{NNN}-{slug}`)를 만들어 작업하고, 모든 검증 통과 후에만 dev 에 `--no-ff` merge. `main`·`dev` 직접 커밋은 훅이 차단, `dev → main` 은 사람이. 커밋 직전 `docs/CONVENTIONS.md` "### 커밋" 을 읽고 명시적 경로로만 add. **`git push` 는 사용자가 명시적으로 요청했을 때만.**

## 명령 (루트 Makefile — 실제 명령은 package.json scripts)
`make setup` · `make dev` · `make check` · `make e2e [SPEC=…]` · `make gc`

## 하지 말 것
- `.env` 읽기·출력 (차단됨 — 예시는 `.env.example`)
- 안전 게이트 우회 플래그·자동 승인 모드 추가, 승인 전 행동 실행
- `evaluate`/`run_script` 류 범용 실행 도구 추가
- 훅·ESLint 경계 규칙 우회, 테스트 약화
- 모델 id 에 날짜 접미사, `budget_tokens`·`temperature` 전송 (claude-api 스킬 참조)
