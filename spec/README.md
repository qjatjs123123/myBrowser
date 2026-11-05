# spec 색인
개발 요청마다 하나의 번호. 기존 기능을 고치기 전에 여기서 관련 spec 을 찾아 읽는다.

| 번호 | 묶음 | 기능 (화면·동작 기준 한 줄) | 관련 코드 | 관련 spec | 상태 | 날짜 |
|---|---|---|---|---|---|---|
| 001 | 기반 | 프로젝트 뼈대 — 창·사이드바 자리·앱 정보 IPC·테스트 하네스 | 설정 파일, src/{main,preload,renderer,shared}, e2e | — | ✅ 완료 | 2026-11-05 |
| 002 | 기반, main-tabs, renderer-chrome | 크롬형 브라우저 — 탭·주소창(검색 선택)·뒤로/앞으로·새 탭 페이지·단축키·쿠키 영속 | src/shared/{ipc,utils}, src/main/tabs, src/main/ipc, src/renderer/chrome, e2e | 001 | ✅ 완료 | 2026-11-05 |
| 003 | 기반, main-browser, agent-loop, main-store, renderer-sidebar | 에이전트 MVP — 사이드바 할 일 → 활성 탭에서 구조 도구로 읽기·이동·입력·클릭, 확정·결제 직전 가드 정지, 타임라인, 실행 기록 저장 | src/shared/{agent,tools,guard,ipc}, src/main/{browser,agent,store,tabs,ipc}, src/renderer/sidebar, e2e | 001, 002 | ✅ 완료 | 2026-11-05 |
| 004 | 기반, main-browser, agent-approval, agent-computer, renderer-sidebar | 승인 창(직접/에이전트/거부)·ask_user·예약 요령 + 픽셀 도구(computer toolset)·커서 오버레이 | src/shared/{agent,ipc,tools,guard}, src/main/{browser,agent,ipc}, src/renderer/sidebar, e2e | 003 | 📝 계획됨 | 2026-11-05 |
