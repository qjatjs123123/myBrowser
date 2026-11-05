#!/usr/bin/env bash
# 훅 공용 함수 — 프로젝트 루트와 환경 준비 상태 판별 (Electron 단일 패키지)
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
HARNESS_DIR="$ROOT/.harness"
# Volta shim 을 앞에 둬 package.json 의 node pin(22)을 따르게 한다 — Claude Code 가 다른 node 이미지 경로를 PATH 앞에 둘 수 있다
# Claude Code 자체가 Volta 로 실행되면 _VOLTA_TOOL_RECURSION=1 이 상속돼 shim 이 pin 을 무시한다 — 지운다
unset _VOLTA_TOOL_RECURSION
# pnpm 도 프로젝트 pin(node 22)으로 돌게 한다 — 없으면 pnpm 이 Volta 기본 node 로 실행된다
export VOLTA_FEATURE_PNPM=1
[ -d "$HOME/.volta/bin" ] && export PATH="$HOME/.volta/bin:$PATH"
# 품질 게이트·변경 감지 대상 경로 (코드 + 테스트 + 빌드 설정)
CODE_PATHS="src e2e package.json electron.vite.config.ts tsconfig.json tsconfig.node.json tsconfig.web.json vitest.config.ts playwright.config.ts eslint.config.mjs"

# 준비 안 된 항목을 공백 구분으로 출력 (모두 준비되면 빈 문자열)
missing_setup() {
  local m=""
  [ -f "$ROOT/package.json" ] || m="$m package.json(프로젝트 뼈대 없음)"
  [ -f "$ROOT/.env" ] || m="$m .env"
  [ -d "$ROOT/node_modules" ] || m="$m node_modules"
  echo "$m"
}

# 앱이 떠 있는지 — CDP 포트(기본 9222)가 응답하면 실행 중
app_running() {
  local port="${MYBROWSER_CDP_PORT:-9222}"
  curl -s --max-time 1 "http://127.0.0.1:${port}/json/version" >/dev/null 2>&1
}

# run 이 "지금 작업 중"으로 인정되는 기간 — 이보다 오래 손대지 않은 미완료 run 은 게이트를 미루거나 끄지 못한다
RUN_FRESH_MIN=${RUN_FRESH_MIN:-1440}

_fresh() { [ -n "$(find "$1" -maxdepth 0 -mmin "-$RUN_FRESH_MIN" 2>/dev/null)" ]; }

# 사용자 답을 기다리며 멈춘 run (PAUSED 파일 있음, DONE 없음, 최근) — 'slug: 사유' 한 줄씩
paused_runs() {
  [ -d "$HARNESS_DIR/runs" ] || return 0
  for d in "$HARNESS_DIR"/runs/*/; do
    [ -f "$d/PAUSED" ] || continue
    [ -f "$d/DONE" ] && continue
    _fresh "$d/PAUSED" || continue
    echo "$(basename "$d"): $(head -1 "$d/PAUSED")"
  done
}

# 진행 중(미완료) harness run 슬러그 목록 — state.md 가 최근 RUN_FRESH_MIN 분 안에 갱신된 것만
active_runs() {
  [ -d "$HARNESS_DIR/runs" ] || return 0
  for d in "$HARNESS_DIR"/runs/*/; do
    [ -f "$d/state.md" ] || continue
    [ -f "$d/DONE" ] && continue
    _fresh "$d/state.md" || continue
    basename "$d"
  done
}

# 오래 방치된 미완료 run (DONE 없음, state.md 가 RUN_FRESH_MIN 분 넘게 그대로)
stale_runs() {
  [ -d "$HARNESS_DIR/runs" ] || return 0
  for d in "$HARNESS_DIR"/runs/*/; do
    [ -f "$d/state.md" ] || continue
    [ -f "$d/DONE" ] && continue
    _fresh "$d/state.md" && continue
    basename "$d"
  done
}

# 기준 커밋($1) 이후 코드 변경 파일 목록 (커밋 + 미커밋 + 새 파일)
changed_code_files() {
  # shellcheck disable=SC2086
  { git diff --name-only "$1" -- $CODE_PATHS; git ls-files --others --exclude-standard -- $CODE_PATHS; } 2>/dev/null | sort -u
}

# 품질 게이트 지문 — 기준 커밋($1) 이후 코드 변경(커밋 + 미커밋 + 새 파일 이름·내용)
gate_fingerprint() {
  local base=$1
  {
    # shellcheck disable=SC2086
    git diff "$base" -- $CODE_PATHS 2>/dev/null
    # shellcheck disable=SC2086
    git ls-files --others --exclude-standard -z -- $CODE_PATHS \
      | while IFS= read -r -d '' f; do printf '%s\n' "$f"; cat "$f" 2>/dev/null; done
  } | sha1sum | cut -d' ' -f1
}
