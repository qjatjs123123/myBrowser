# `.claude/` — 하네스 구성 안내

이 폴더는 **Claude Code 가 이 프로젝트에서 일하는 방식**을 정의한다. boilerplate(Next.js + FastAPI 하네스)에서 가져와 Electron 단일 패키지용으로 고친 것이다.

| 종류 | 폴더 | 역할 |
|---|---|---|
| 설정 | `settings.json` | 권한 허용·차단, 훅 등록, Playwright MCP(웹사이트 구조 탐색용) |
| 훅 | `hooks/` | SessionStart(상태 주입) · UserPromptSubmit(라우팅) · PreToolUse(커밋 메시지·git 안전) · PostToolUse(포맷) · Stop(품질 게이트) |
| 규칙 | `rules/` | `architecture.md`(구조 지도) · `electron/{main,preload,ipc}` · `agent/{tools,guard}` · `renderer/*` · `test-convention` — 경로 매칭으로 자동 로드 |
| 스킬 | `skills/` | 진입점 `vibe-*` 4개 + `desktop/` 절차(spec-create·spec-run·refactor·app-check)·기술(zod-usage·error-toast·design). 공통 규칙 `COMMON.md` |
| 에이전트 | `agents/` | `spec-reviewer`(읽기 전용 검증) · `desktop-dev`(워크트리 개발 도우미) |
| 템플릿 | `templates/spec-template.md` | spec 양식 (IPC 계약·도구 계약·안전 요구사항 섹션 포함) |

## boilerplate 와 달라진 점
- backend/frontend 2영역 → 단일 패키지. spec 은 `spec/{NNN}-*.md` 하나, 묶음은 `기반 | main-{모듈} | agent-{도구군} | renderer-{화면}` (`COMMON.md` §5).
- DB(Docker·alembic)·API 계약(swagger)·Next.js 규칙 제거. 대신 IPC 계약·도구 계약·안전 게이트 규칙 추가.
- 품질 게이트 범위 `src e2e` + 설정 파일. e2e 는 Playwright `_electron` + 가짜 모델 모드.
- 사용자 페르소나: 비개발자 → 개발자 (보고 형식만 유지).
- 사내 전용 디자인 스킬·배포 파이프라인·폰트 규칙 제거.

## `.harness/` (git 무시)
`session-base`(게이트 기준 커밋) · `gate-*` · `runs/{slug}/{task,state,loop,log}.md` · `runs/{slug}/{PAUSED,DONE}` · `console-errors.log`.
