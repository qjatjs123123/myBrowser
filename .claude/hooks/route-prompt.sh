#!/usr/bin/env bash
# UserPromptSubmit — 모든 입력에 하네스 라우팅 지시를 주입한다. (프로젝트에 슬래시 커맨드는 두지 않는다 — 전부 스킬)
source "$(dirname "$0")/_lib.sh"

missing=$(missing_setup)
echo "[하네스 자동 적용]"
if [ -n "$missing" ]; then
  echo "- 개발 환경이 아직 준비되지 않았다(없음:$missing). 요청이 코드 작성·실행과 관련 있으면 먼저 vibe-setup 스킬을 따른다."
fi
cat <<'MSG'
- 요청이 기능 추가·수정·버그 수정 등 코드 변경을 필요로 하면: vibe-build 스킬을 읽고 그 절차를 따른다. 임의로 바로 코드를 쓰지 않는다.
- 요청이 기능 변경 없이 코드 정리·리팩토링이면: vibe-refactor 스킬을 따른다.
- 요청이 앱 실행·화면 확인이면: vibe-run 스킬을 따른다.
- 단순 질문·설명·설계 논의면: 코드를 바꾸지 말고 답한다. 설계 변경은 docs/DESIGN.md 에 반영한다.
- 사용자는 개발자다. 보고는 짧게 — 무엇이 생겼고, 어디서 확인하는지, 아직 안 되는 것. 에이전트의 안전 게이트(확정 직전 정지, 비밀번호 미입력)를 약화하는 변경은 사용자 확인 없이 하지 않는다.
MSG
runs=$(active_runs)
[ -n "$runs" ] && echo "- 진행 중인 작업: $runs (.harness/runs/<slug>/state.md). 이어지는 요청이면 그 run 을 재개한다."
exit 0
