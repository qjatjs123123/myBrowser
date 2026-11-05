#!/usr/bin/env bash
# 주간 엔트로피 점검 (보고 전용 — 아무것도 수정하지 않는다)
#   1. 계층 import 규칙(ESLint)  2. 문서 신선도  3. 가드 규칙에 테스트가 있는가  4. 미완료 spec
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT"
STALE_DAYS=60; ISSUES=0
fail() { echo "FAIL: $1"; ISSUES=$((ISSUES + 1)); }
ok() { echo "OK:   $1"; }

echo "--- 1. 계층 import 규칙 ---"
if pnpm -s lint >/tmp/gc-lint.log 2>&1; then ok "ESLint 통과"; else fail "ESLint 위반:"; grep -E "error" /tmp/gc-lint.log | head -20; fi

echo "--- 2. 문서 신선도 ---"
for doc in docs/DESIGN.md .claude/rules/architecture.md; do
  [ -f "$doc" ] || continue
  last=$(git log -1 --format=%ct -- "$doc" 2>/dev/null || echo 0)
  code=$(git log -1 --format=%ct -- src 2>/dev/null || echo 0)
  if [ "$code" -gt 0 ] && [ $(( (code - last) / 86400 )) -gt "$STALE_DAYS" ]; then fail "$doc 가 코드보다 ${STALE_DAYS}일 이상 오래됨"; else ok "$doc 최신"; fi
done

echo "--- 3. 가드 규칙 테스트 ---"
if [ -f src/shared/guard/rules.ts ]; then
  rules=$(grep -cE "^\s*\{\s*(pattern|regex):" src/shared/guard/rules.ts 2>/dev/null || echo 0)
  tests=$(grep -cE "^\s*(it|test)\(" src/shared/guard/__tests__/rules.test.ts 2>/dev/null || echo 0)
  [ "$tests" -ge "$rules" ] && ok "가드 규칙 $rules 개, 테스트 $tests 개" || fail "가드 규칙 $rules 개인데 테스트 $tests 개"
fi

echo "--- 4. 미완료 spec ---"
if [ -f spec/README.md ]; then
  open=$(grep -cE "🚧 진행중" spec/README.md || true)
  [ "$open" -gt 0 ] && fail "진행중 spec $open 건 — 닫거나 이어서 하세요" || ok "진행중 spec 없음"
fi

[ "$ISSUES" -eq 0 ] && { echo "이상 없음"; exit 0; } || { echo "$ISSUES 건 발견"; exit 1; }
