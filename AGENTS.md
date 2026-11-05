# Agent Orientation Map

> Electron + React + TypeScript 단일 패키지 — Claude 브라우저 에이전트. 처음 들어오면 이 파일부터 읽는다. 설계 전체는 `docs/DESIGN.md`.

## Stack

| 영역 | 기술 |
|---|---|
| 셸 | Electron 33+ (`WebContentsView` 탭), electron-vite, electron-builder |
| UI | React 19, TypeScript, Tailwind 4, shadcn/ui, zustand, sonner, react-hook-form + zod |
| 에이전트 | `@anthropic-ai/sdk` toolRunner + betaZodTool (`claude-opus-5-5`), `playwright-core` connectOverCDP |
| 저장 | better-sqlite3, electron-store, `safeStorage` |
| 테스트 | vitest (+ Testing Library, jsdom/node) · Playwright `_electron` |
| 도구 | pnpm, ESLint, Prettier, Make, python3(훅) |

## Architecture — 프로세스 경계

```
renderer (React) ──window.api(preload)──▶ main (Node/Electron) ──CDP──▶ 탭 WebContentsView
      └──────────────── shared (zod 스키마·타입) ◀──────────┘
main 내부: ipc → agent → browser → tabs ; agent → store ; app → tabs   (역방향 금지)
```
상세·import 허용표: `.claude/rules/architecture.md`

## Directory

```
.
├── CLAUDE.md / AGENTS.md / ARCHITECTURE.md / Makefile / .env.example
├── docs/            DESIGN.md(설계) · CONVENTIONS.md · TROUBLESHOOTING.md
├── spec/            요청별 spec — README.md(색인) · {NNN}-{기능}.md
├── .claude/
│   ├── settings.json · hooks/ · agents/{spec-reviewer,desktop-dev}.md · templates/spec-template.md
│   ├── rules/       architecture.md · electron/{main,preload,ipc}.md · agent/{tools,guard}.md · renderer/*.md · test-convention.md
│   └── skills/      COMMON.md · vibe-{setup,build,run,refactor}/ · desktop/{spec-create,spec-run,refactor,app-check,zod-usage,error-toast,design}/
├── src/
│   ├── main/        index.ts · app/ · tabs/ · browser/ · agent/{loop,tools/,guard,prompts/,fake/,runs} · store/ · ipc/ · env.ts · log.ts
│   ├── preload/     index.ts (contextBridge → window.api)
│   ├── renderer/    main.tsx · App.tsx · chrome/ · sidebar/ · components/{ui,shared}/ · hooks/ · store/ · lib/ · utils/ · styles/
│   └── shared/      ipc/ · tools/ · guard/ · types/ · constants/ · utils/
├── e2e/             fixtures.ts · fixtures/{pages/*.html, model/*.json} · *.spec.ts
└── scripts/         doctor.sh · worktree-setup.sh · check_commit_msg.py · check_secrets.py · gc/
```
(`src/`·`e2e/` 는 로드맵 0단계 spec 이 만든다 — 아직 없으면 그 spec 부터.)

## Commands
```sh
make setup     # 최초 1회 — git 훅·main/dev 브랜치·.env·pnpm install·Playwright chromium
make dev       # Electron 앱 (electron-vite dev)
make check     # lint + type-check + vitest + build
make e2e       # Playwright _electron (SPEC=e2e/x.spec.ts, HARNESS_RUN_DIR=... 로 에러 기록) — 창 없으면 xvfb-run -a
make gc        # 주간 점검 (보고 전용)
```

## Where to Look First

| 작업 | 시작점 |
|---|---|
| 새 기능 전체 흐름 | `.claude/skills/vibe-build/SKILL.md` |
| 구조·import 규칙 | `.claude/rules/architecture.md` |
| IPC 채널·스키마 | `.claude/rules/electron/ipc.md`, `src/shared/ipc/` |
| 에이전트 도구·루프 | `.claude/rules/agent/tools.md`, `docs/DESIGN.md` §3 |
| 안전 게이트 | `.claude/rules/agent/guard.md`, `src/shared/guard/rules.ts` |
| 화면 | `.claude/rules/renderer/react-convention.md`, `.claude/skills/desktop/design/` |
| 테스트 | `.claude/rules/test-convention.md`, `e2e/fixtures.ts` |
| 자주 나는 에러 | `docs/TROUBLESHOOTING.md` |
| 만든 기능 / 진행 중 작업 | `spec/README.md` |

## Constraints
- MUST: 코드 변경 후 `make check` 통과 (Stop 훅이 lint·타입·테스트·e2e 강제)
- MUST: 상태를 바꾸는 도구는 `guard.check` 를 거친다; 승인 전 실행 금지
- MUST NOT: renderer 에서 `electron`·`node:*` import, `ipcRenderer` 노출, 탭 View 에 preload
- MUST NOT: 실제 Claude API·외부 사이트를 부르는 테스트, `.env` 읽기, `git push`, 테스트 약화
- PREFER: `.claude/rules/**` 의 템플릿 구조
