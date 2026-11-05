#!/usr/bin/env bash
# 필수 도구 점검 — 없는 도구는 설치 방법을 안내한다.
set -u
MISSING=0
check() {
  local cmd="$1" hint="$2"
  if command -v "$cmd" >/dev/null 2>&1; then echo "OK    $cmd"; else echo "없음  $cmd — 설치: $hint"; MISSING=$((MISSING + 1)); fi
}
check git     "https://git-scm.com/downloads"
check node    "Node 22.12 이상 (Electron 40+ 설치에 필요) — Volta 사용 시 package.json pin 으로 자동 선택: 'curl https://get.volta.sh | bash'"
check pnpm    "'npm install -g pnpm' 또는 'volta install pnpm'"
check python3 "Python 3.10 이상 (훅·스크립트용) — WSL: 'sudo apt install python3'"

# Electron 40+ 설치와 vitest·jsdom 이 Node 22.12+ 를 요구한다. pnpm 이 실제로 쓰는 node 를 본다
# (Volta 는 VOLTA_FEATURE_PNPM=1 일 때만 pnpm 에도 package.json pin 을 적용한다)
if command -v pnpm >/dev/null 2>&1; then
  ver=$(pnpm -s exec node -p "process.versions.node" 2>/dev/null)
  pnpm -s exec node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=12)?0:1)" 2>/dev/null \
    || { echo "없음  pnpm 이 쓰는 node 22.12+ (현재 ${ver:-알 수 없음}) — Volta 면 셸 설정에 'export VOLTA_FEATURE_PNPM=1' 추가, 아니면 nvm/fnm 으로 22 사용"; MISSING=$((MISSING + 1)); }
fi

if [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  echo "주의  DISPLAY 가 없어 Electron 창을 띄울 수 없습니다 — WSLg 를 켜거나, 검증은 'xvfb-run -a make e2e' 로만 가능합니다."
  command -v xvfb-run >/dev/null 2>&1 || echo "      xvfb 도 없음 — 'sudo apt install xvfb'"
fi
# Electron 이 Linux 에서 요구하는 공유 라이브러리 (WSL/Ubuntu 기준 대표만)
for lib in libnss3.so libgbm.so.1 libasound.so.2; do
  ldconfig -p 2>/dev/null | grep -q "$lib" || echo "주의  $lib 없음 — 'sudo apt install libnss3 libgbm1 libasound2' (Electron 실행 필요)"
done

if [ "$MISSING" -gt 0 ]; then echo; echo "$MISSING 개 항목을 먼저 준비해야 합니다."; exit 1; fi
echo "모든 도구 준비 완료"
