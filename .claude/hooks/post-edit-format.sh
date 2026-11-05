#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit) — 방금 수정한 TS/TSX 파일만 eslint --fix + prettier. 실패해도 막지 않는다.
source "$(dirname "$0")/_lib.sh"
file=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)
[ -f "$file" ] || exit 0
case "$file" in
  *.ts | *.tsx | *.js | *.mjs | *.cjs)
    # 파일이 속한 루트 — 메인 폴더 또는 워크트리(.claude/worktrees/<이름>)의 node_modules 를 쓴다
    base="$ROOT"
    case "$file" in "$ROOT"/.claude/worktrees/*) base="$ROOT/.claude/worktrees/$(echo "${file#"$ROOT"/.claude/worktrees/}" | cut -d/ -f1)" ;; esac
    [ -d "$base/node_modules" ] || exit 0
    (cd "$base" && pnpm -s exec eslint --fix "$file"; pnpm -s exec prettier --write --log-level silent "$file") >/dev/null 2>&1 ;;
esac
exit 0
