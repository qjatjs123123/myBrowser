# Claude 하네스가 호출하는 명령 모음 — 실제 명령은 package.json scripts 가 단일 출처
SHELL := /bin/bash
# Volta shim 우선 — package.json 의 node pin(22) 적용 (Electron 40+ 설치에 필요)
export PATH := $(HOME)/.volta/bin:$(PATH)
unexport _VOLTA_TOOL_RECURSION
export VOLTA_FEATURE_PNPM := 1
.PHONY: doctor setup dev check e2e gc worktree-setup

doctor: ## 필수 도구 설치 여부 확인
	@bash scripts/doctor.sh

setup: doctor ## 최초 1회: git 훅, main·dev 브랜치, .env, 의존성, Playwright 브라우저
	git config core.hooksPath .githooks  # 커밋 직전 민감 파일·비밀값·메시지 형식 검사
	@if git rev-parse -q --verify HEAD >/dev/null; then \
	  git show-ref -q --verify refs/heads/main || git branch main $$(git rev-parse -q --verify origin/main >/dev/null && echo origin/main || echo HEAD); \
	  git show-ref -q --verify refs/heads/dev || git branch dev $$(git rev-parse -q --verify origin/dev >/dev/null && echo origin/dev || echo main); \
	  [ "$$(git branch --show-current)" != main ] || git switch -q dev; \
	else echo "⚠️  커밋이 아직 없어 main·dev 브랜치를 만들지 않았습니다 — 첫 커밋 후 make setup 을 다시 실행하세요."; fi
	@test -f .env || cp .env.example .env
	@test -f package.json || { echo "package.json 이 없습니다 — 프로젝트 뼈대(로드맵 0단계 spec)부터 만드세요."; exit 1; }
	pnpm install
	pnpm exec playwright install chromium
	@echo "✅ setup 완료 — .env 의 ANTHROPIC_API_KEY 를 채워 주세요"

dev: ## Electron 앱 실행 (electron-vite dev)
	pnpm dev

check: ## 정적 검증 전체: lint + type-check + vitest + build
	pnpm lint && pnpm type-check && pnpm test && pnpm build

e2e: ## Playwright _electron 실제 앱 검증 — 예: make e2e SPEC=e2e/tabs.spec.ts HARNESS_RUN_DIR=.harness/runs/x
	HARNESS_RUN_DIR="$(HARNESS_RUN_DIR)" MYBROWSER_FAKE_MODEL=1 pnpm test:e2e $(SPEC)

gc: ## 주간 엔트로피 점검 (보고 전용)
	@bash scripts/gc/check.sh

worktree-setup: ## (워크트리 안에서) .env·의존성 준비 — desktop-dev 서브에이전트용
	@bash scripts/worktree-setup.sh
