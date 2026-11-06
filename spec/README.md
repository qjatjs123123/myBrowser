# spec 색인
개발 요청마다 하나의 번호. 기존 기능을 고치기 전에 여기서 관련 spec 을 찾아 읽는다.

| 번호 | 묶음 | 기능 (화면·동작 기준 한 줄) | 관련 코드 | 관련 spec | 상태 | 날짜 |
|---|---|---|---|---|---|---|
| 001 | 기반 | 프로젝트 뼈대 — 창·사이드바 자리·앱 정보 IPC·테스트 하네스 | 설정 파일, src/{main,preload,renderer,shared}, e2e | — | ✅ 완료 | 2026-11-05 |
| 002 | 기반, main-tabs, renderer-chrome | 크롬형 브라우저 — 탭·주소창(검색 선택)·뒤로/앞으로·새 탭 페이지·단축키·쿠키 영속 | src/shared/{ipc,utils}, src/main/tabs, src/main/ipc, src/renderer/chrome, e2e | 001 | ✅ 완료 | 2026-11-05 |
| 003 | 기반, main-browser, agent-loop, main-store, renderer-sidebar | 에이전트 MVP — 사이드바 할 일 → 활성 탭에서 구조 도구로 읽기·이동·입력·클릭, 확정·결제 직전 가드 정지, 타임라인, 실행 기록 저장 | src/shared/{agent,tools,guard,ipc}, src/main/{browser,agent,store,tabs,ipc}, src/renderer/sidebar, e2e | 001, 002 | ✅ 완료 | 2026-11-05 |
| 004 | 기반, main-browser, agent-approval, agent-computer, renderer-sidebar | 승인 창(직접/에이전트/거부)·ask_user·예약 요령 + 픽셀 도구(computer toolset)·커서 오버레이 | src/shared/{agent,ipc,tools,guard}, src/main/{browser,agent,ipc}, src/renderer/sidebar, e2e | 003 | ✅ 완료 | 2026-11-05 |
| 005 | 기반, main-account, renderer-sidebar, agent-eval | 설치판(linux AppImage·설치판 CDP 임의 포트) + 가짜 모델 평가 세트(`pnpm eval`) + 구독 계정 활성화(게이트웨이 모드·기기 토큰 자동 저장·크레딧 표시) | electron-builder.yml, eval/, src/shared/{ipc,account}, src/main/{env,app,account,agent}, src/renderer/sidebar/AccountCard, e2e | 003, 004 | ✅ 완료 | 2026-11-05 |
| 006 | 기반 | 개발 모드 모델 프록시 — `.env` ANTHROPIC_BASE_URL 로 direct 모드 호출 주소 변경(설치판 무관) | src/main/{env,index}, src/main/agent/modelClient, docs/DESIGN.md | 003, 005 | ✅ 완료 | 2026-11-06 |
| 007 | 기반 | 모델 프로필 전략 — `MYBROWSER_PROFILE=dev`(사내 GenAI 프록시·픽셀 도구/fallbacks 제외) / `prod`(게이트웨이 Claude API), direct 제거·개발 실행은 필수 | src/main/{env,index}, src/main/agent/{profiles,loop,service,tools,modelClient}, src/main/account, e2e, eval | 003, 004, 005, 006 | ✅ 완료 | 2026-11-06 |
| 008 | 기반 | e2e 격리(가상 디스플레이 기본·외부 요청 차단) + 이름 없는 입력칸 픽셀 입력 승인 (주소창 `nhttp://` 는 데스크톱 e2e 에 실제 키 입력이 섞인 것) | scripts/e2eRun.ts, e2e/fixtures.ts, src/main/agent/guard.ts, e2e | 002, 004, 005 | ✅ 완료 | 2026-11-06 |
| 009 | renderer-sidebar | 사이드바 대화형 UI — 할 일 말풍선·에이전트 턴(N단계 접힘·결과·복사)·[새 대화], 둥근 입력창 Enter 실행(IME 조합 중 무시), 승인·질문 번호 선택 목록(기본 거부) | src/renderer/{hooks/useAgentRun,sidebar/*,styles}, e2e | 003, 004, 005 | ✅ 완료 | 2026-11-06 |
| 010 | 기반 | mac 브라우저 프레임 — OS 제목 표시줄 제거, 맨 윗줄 신호등(mac 네이티브·그 외 직접 그림)+탭+사이드바 헤더 한 줄, 드래그로 창 이동, 창 제어 IPC + 질문 카드 보내기 아이콘 | src/shared/ipc, src/preload, src/main/{app/window,ipc/handlers/window}, src/renderer/{chrome,sidebar/SidebarHeader,sidebar/QuestionCard}, e2e | 002, 009 | ✅ 완료 | 2026-11-06 |
| 011 | 기반 | 에이전트 사이드바 열기·닫기 — Edge 식 툴바 끝 [에이전트] 버튼·패널 X, 탭 줄·툴바 전체 폭, 승인·질문 오면 자동 열기·닫혀 있으면 버튼 점, 열림 상태 기억 | src/renderer/{App,hooks/useSidebarOpen,chrome/AgentToggleButton,chrome/BrowserChrome,sidebar/AgentPanel,sidebar/SidebarHeader}, e2e | 009, 010 | 📝 계획됨 | 2026-11-06 |
