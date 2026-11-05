#!/usr/bin/env bash
# 워크트리 환경 준비 — desktop-dev 서브에이전트가 워크트리 루트에서 실행한다.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel); cd "$ROOT"
if [ "$(git rev-parse --git-dir)" = "$(git rev-parse --git-common-dir)" ]; then
  echo "워크트리가 아니다 — 메인 폴더에서는 make setup 을 쓴다." >&2; exit 1
fi
MAIN=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
[ -f .env ] || { if [ -f "$MAIN/.env" ]; then cp "$MAIN/.env" .env; else cp .env.example .env; fi; }
pnpm install --frozen-lockfile --prefer-offline --silent
echo "✅ 워크트리 환경 준비 완료: $ROOT"
