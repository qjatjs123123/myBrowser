---
name: vibe-run
description: 앱(myBrowser Electron 창)을 실행해 확인하게 한다 — 사용자가 "보여줘", "실행해줘", "켜줘", "화면 보고 싶어"라고 할 때 사용.
---

# vibe-run — 앱 실행과 확인 안내

1. 개발 환경이 준비 안 됐으면 vibe-setup 스킬을 먼저 따른다.
2. 이미 떠 있는지 확인: `curl -s http://127.0.0.1:9222/json/version` 이 응답하면 실행 중 — 그대로 안내한다.
3. **백그라운드**로 실행한다: `pnpm dev` (run_in_background). electron-vite 가 main/preload/renderer 를 빌드하고 Electron 창을 띄운다.
4. 켜질 때까지 기다린다(최대 60초): 위 CDP 주소가 응답하거나 로그에 `ready` 가 보이면 완료. WSL 이면 WSLg 창으로 뜬다.
5. 사용자에게 안내한다:
   - 창이 열렸다 — 왼쪽은 브라우징 탭, 오른쪽 사이드바가 에이전트 패널.
   - 방금 만든 기능이 있으면 어디서 어떻게 눌러보는지 (예: "사이드바 입력창에 '네이버에서 ○○ 검색' 입력").
   - 에이전트 작업은 `.harness/` 가 아니라 앱의 SQLite(`userData/mybrowser.db`)에 기록된다.
6. 포트(9222)가 이미 사용 중이면 같은 앱이 떠 있는지 먼저 확인하고(`lsof -i :9222`), 다른 프로그램이면 사용자에게 알린다. 창이 안 뜨고 `Missing X server` 류 에러면 WSLg 미설정 — 사용자에게 알리고 `xvfb-run pnpm test:e2e` 로 검증만 가능하다고 안내한다.
