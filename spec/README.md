# spec 색인
개발 요청마다 하나의 번호. 기존 기능을 고치기 전에 여기서 관련 spec 을 찾아 읽는다.

| 번호 | 묶음 | 기능 (화면·동작 기준 한 줄) | 관련 코드 | 관련 spec | 상태 | 날짜 |
|---|---|---|---|---|---|---|
| 001 | 기반 | 프로젝트 뼈대 — 창·사이드바 자리·앱 정보 IPC·테스트 하네스 | 설정 파일, src/{main,preload,renderer,shared}, e2e | — | ✅ 완료 | 2026-11-05 |
| 002 | 기반, main-tabs, renderer-chrome | 크롬형 브라우저 — 탭·주소창(검색 선택)·뒤로/앞으로·새 탭 페이지·단축키·쿠키 영속 | src/shared/{ipc,utils}, src/main/tabs, src/main/ipc, src/renderer/chrome, e2e | 001 | ✅ 완료 | 2026-11-05 |
