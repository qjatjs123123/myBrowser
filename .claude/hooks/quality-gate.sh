#!/usr/bin/env bash
# Stop — Claude가 작업을 끝내려 할 때 정적 검증 + 테스트 누락 검사 + (화면 변경 시) e2e 를 강제한다.
# 코드가 바뀌었는데 검증을 통과하지 못하면 종료를 막고(decision: block) 에러를 돌려줘 계속 고치게 한다.
source "$(dirname "$0")/_lib.sh"
cd "$ROOT" || exit 0

MAX_BLOCKS=6
COUNT_FILE="$HARNESS_DIR/gate-count"
PASS_FILE="$HARNESS_DIR/gate-pass"
PAUSED_FP_FILE="$HARNESS_DIR/gate-paused-fp"   # PAUSED 로 한 번 넘겨 준 변경의 지문 — 같은 변경으로 두 번은 못 넘긴다
LOG_FILE="$HARNESS_DIR/gate-last.log"
mkdir -p "$HARNESS_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  printf '{"systemMessage": "⚠️ python3 가 없어 품질 검사·커밋 규칙 검사를 할 수 없습니다. 사용자에게 python3 설치(make doctor 안내)를 요청하라."}\n'
  exit 0
fi

emit() { # $1=json-key  $2=message → JSON 출력
  python3 -c 'import json,sys; print(json.dumps({sys.argv[1]: sys.argv[2], **({"decision": "block"} if sys.argv[1]=="reason" else {})}, ensure_ascii=False))' "$1" "$2"
}

# 1. 세션 시작 이후 바뀐 코드 파일 (커밋된 것 포함 — 커밋으로 게이트를 우회할 수 없게)
base=$(cat "$HARNESS_DIR/session-base" 2>/dev/null)
git cat-file -e "${base:-x}^{commit}" 2>/dev/null || base=HEAD
changed=$(changed_code_files "$base")
[ -z "$changed" ] && exit 0

# 2. 이미 이 상태로 통과했으면 재검사하지 않음
fingerprint=$(gate_fingerprint "$base")
[ -f "$PASS_FILE" ] && [ "$(cat "$PASS_FILE")" = "$fingerprint" ] && exit 0

# 3. 환경 미준비면 검사 불가 — 막지 않고 안내만
if [ -n "$(missing_setup)" ]; then
  emit systemMessage "품질 검사를 건너뜀: 개발 환경이 준비되지 않았습니다 (make setup 필요)."
  exit 0
fi

# 4. 검사 — 실패한 검사의 로그 끝부분만 모아 돌려준다
: > "$LOG_FILE"
fail=0
errors=""
run_side() { # $1=이름  $2=명령
  local out
  out=$(bash -c "$2" 2>&1) && return 0
  fail=1
  printf '### %s\n%s\n' "$1" "$out" >>"$LOG_FILE"
  errors+=$(printf '\n### %s 실패\n%s' "$1" "$(echo "$out" | grep -v '^\s*$' | tail -35)")
}
fail_with() { # $1=이름  $2=메시지
  fail=1
  printf '### %s\n%s\n' "$1" "$2" >>"$LOG_FILE"
  errors+=$(printf '\n### %s 실패\n%s' "$1" "$2")
}

# 진행 중 run(vibe-build 등, DONE 없음, 최근 갱신)이 있으면 e2e 와 "새 화면의 e2e 누락" 검사는 최종 검증 루프로 미룬다.
run=$(active_runs | head -1)

# 세션 시작 이후 새로 생긴 파일 중 짝 테스트가 없는 것 (한 줄에 하나, 필요한 테스트 위치 포함)
missing_tests() {
  local added f dir name e2e_changed screen
  added=$( { git diff --name-only --diff-filter=A "$base" -- src; git ls-files --others --exclude-standard -- src; } 2>/dev/null | sort -u)
  # 새 화면 컴포넌트(renderer 의 chrome/·sidebar/ 폴더형 컴포넌트)인데 e2e 추가·변경이 없음 (진행 중 run 이면 최종 검증으로 미룸)
  if [ -z "$run" ]; then
    e2e_changed=$( { git diff --name-only --diff-filter=AM "$base" -- e2e; git ls-files --others --exclude-standard -- e2e; } 2>/dev/null | grep -E '\.spec\.ts$')
    echo "$added" | grep -E '^src/renderer/(chrome|sidebar)/[^/]+/index\.tsx$' \
      | while read -r screen; do
          [ -n "$e2e_changed" ] || echo "$screen  → e2e/{기능}.spec.ts 필요 (desktop/app-check 절차)"
        done
  fi
  # 새 로직·부품인데 __tests__ 짝 파일이 없음
  #   main 의 agent·browser·tabs·store·ipc 모듈, shared 스키마, renderer 의 hooks·store·lib·utils, renderer 컴포넌트 폴더
  echo "$added" | grep -E '^src/(main/(agent|browser|tabs|store|ipc)/(tools/)?[^/]+\.ts|shared/[^/]+\.ts|renderer/(hooks|store|lib|utils)/[^/]+\.tsx?|renderer/(chrome|sidebar|components/shared)/[^/]+/index\.tsx)$' \
    | grep -v -E '/(index|types|prompts?)\.ts$' \
    | while read -r f; do
        dir=$(dirname "$f"); name=$(basename "${f%.*}")
        [ "$name" = index ] && name=$(basename "$dir")   # <Name>/index.tsx → <Name>
        ls "$dir/__tests__/$name".test.ts* >/dev/null 2>&1 || echo "$f  → $dir/__tests__/$name.test.ts(x) 필요"
      done
}

run_side static "pnpm -s lint --quiet && pnpm -s type-check && pnpm -s test"
missing=$(missing_tests)
[ -n "$missing" ] && fail_with "테스트 누락" "새로 만든 파일에 짝 테스트가 없다. 아래 위치에 테스트를 작성하라 (빈 테스트·skip 금지):
$missing"

# 정적 검사가 통과한 경우에만 실제 앱 e2e (Playwright _electron)
if [ "$fail" -eq 0 ] && [ -n "$run" ]; then
  deferred_e2e="e2e·새 화면 e2e 누락 검사는 진행 중 작업($run)의 최종 검증 단계로 미룸"
elif [ "$fail" -eq 0 ]; then
  run_side e2e "pnpm -s test:e2e"
fi

if [ "$fail" -eq 0 ]; then
  rm -f "$COUNT_FILE" "$PAUSED_FP_FILE"
  if [ -n "${deferred_e2e:-}" ]; then
    emit systemMessage "품질 검사 통과 (정적·테스트). $deferred_e2e."
    exit 0
  fi
  echo "$fingerprint" > "$PASS_FILE"
  exit 0
fi

# 5. 실패 — 사용자 답을 기다리며 멈춘 run(PAUSED)이면 막지 않고 알리기만 한다 (사유 1줄 필수, 같은 변경으로 1회만)
paused=$(paused_runs)
if [ -n "$paused" ]; then
  reason_ok=1
  for d in "$HARNESS_DIR"/runs/*/; do
    [ -f "$d/PAUSED" ] && [ ! -f "$d/DONE" ] && [ -z "$(head -1 "$d/PAUSED" | tr -d '[:space:]')" ] && reason_ok=0
  done
  if [ "$reason_ok" -eq 1 ] && [ "$(cat "$PAUSED_FP_FILE" 2>/dev/null)" != "$fingerprint" ]; then
    rm -f "$COUNT_FILE"
    echo "$fingerprint" > "$PAUSED_FP_FILE"
    emit systemMessage "검사 미통과 상태로 사용자 답을 기다리는 중 — $paused. 답을 받아 재개하면 PAUSED 를 지우고 다시 검사한다 (같은 변경으로 다시 PAUSED 로 끝낼 수는 없다)."
    exit 0
  fi
  [ "$reason_ok" -eq 0 ] && errors+=$'\n### PAUSED 사유 없음\nPAUSED 파일 첫 줄에 멈춘 사유 1줄이 필요하다. 오류를 고치기 싫어서 만든 PAUSED 는 지우고 아래 에러를 고쳐라.'
  [ "$reason_ok" -eq 1 ] && errors+=$'\n### PAUSED 재사용\n이 변경은 이미 PAUSED 로 한 번 사용자 답을 기다렸다. 답을 반영했으면 PAUSED 를 지우고 아래 에러를 고쳐라.'
fi

# 6. 실패 — 연속 차단 횟수 확인 후 block
count=$(( $(cat "$COUNT_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$count" > "$COUNT_FILE"
if [ "$count" -ge "$MAX_BLOCKS" ]; then
  rm -f "$COUNT_FILE"
  emit systemMessage "⚠️ 자동으로 ${MAX_BLOCKS}번 고쳐 봤지만 마무리 검사를 통과하지 못해 여기서 멈췄습니다 (커밋하지 않음). 막힌 내용을 사용자에게 설명하고, 해결되면 '이어서 해줘'로 멈춘 지점부터 다시 한다고 안내하라. 상세 기록: .harness/gate-last.log"
  exit 0
fi

emit reason "[품질 게이트 ${count}/${MAX_BLOCKS}] 코드 변경 후 검증에 실패해 아직 끝낼 수 없다. 아래 에러를 고친 뒤 다시 마무리하라. 계층 import 위반(ESLint) 에러는 메시지에 적힌 .claude/rules 파일을 읽고 그 규칙대로 고친다. 테스트를 skip·삭제하거나 기대값을 바꿔 통과시키는 것은 금지.
$errors"
exit 0
