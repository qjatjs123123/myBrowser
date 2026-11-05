# 최종 검증 루프 (harness)

vibe-build 8단계와 vibe-refactor 4단계가 이 파일을 읽고 따른다. **구현이 끝난 뒤** "검사 → 고침"을 통과할 때까지 반복하는 규칙만 정한다 (**이 루프는 커밋하지 않는다**).

입력: 호출한 쪽이 넘겨준 작업 이름 (예: "{slug} 최종 검증").

## 작업 폴더 (RUN_DIR)
`.harness/runs/{slug}/` — 호출한 쪽이 만들었으면 그대로, 없으면 만든다. **다른 run 의 폴더는 읽지도 쓰지도 않는다.**
```
.harness/runs/{slug}/
├── task.md              작업 원문
├── state.md             호출한 쪽의 진행 상태 — 브랜치·방식·배치표. **이 루프는 읽기만 한다**
├── loop.md              이 루프의 상태 — [미해결 에러] / [다음에 시도할 것] / [이미 실패해서 다시 하지 말 것]
├── log.md               바퀴별 기록 — 덧붙이기만
└── console-errors.log   e2e 실행 시 renderer 콘솔·main 프로세스 에러가 자동 기록된다 (e2e/fixtures.ts)
```
- **진행 중 run** = `state.md` 가 있고 `DONE` 이 없는 폴더. `state.md` 가 없으면(vibe-refactor 단독) 작업 이름 한 줄로 만든다. 통과한 뒤에만 `DONE` 을 만들고, 끝난 run 에는 반드시 `DONE` 을 만든다.

## 한 바퀴
1. `loop.md` 를 읽는다 (첫 바퀴면 만든다) — "다시 하지 말 것"의 접근은 시도하지 않는다.
2. **검사 (실제로 실행)**
   - 정적: `make check` (lint·타입·vitest·빌드)
   - 동적: `: > RUN_DIR/console-errors.log` 로 비운 뒤 `make e2e HARNESS_RUN_DIR=<RUN_DIR>` — Playwright `_electron` 이 실제 앱을 띄워 `e2e/*.spec.ts` 를 돌린다 (`e2e/fixtures.ts` 의 `test` 사용, 가짜 모델 모드). 창을 띄울 수 없는 환경이면 `xvfb-run -a make e2e ...`.
3. **판정 — 명령 결과(exit code)와 로그 파일로만.** 스크린샷 육안 판정 금지.
   - 통과 = `make check` 성공 + e2e 전부 통과 + `console-errors.log` 의 에러 0건.
   - 에러 수: `grep -cE '^\[(console\.error|pageerror|main\.error)\]' <RUN_DIR>/console-errors.log`.
4. **기록**: `log.md` 에 바퀴 번호·명령·결과·남은 문제를 덧붙이고 `loop.md` 를 갱신한다.
5. **통과면 `RUN_DIR/DONE` 을 만들고 종료.** 아니면 고친다 — 먼저 `docs/TROUBLESHOOTING.md` 에서 같은 증상을 찾는다. rules·스킬을 지키고 테스트 약화 금지. → 1로.

## 멈춤 조건
- **최대 6바퀴.** / **2바퀴 연속 개선 없음**이면 멈춘다. 멈추면 `DONE` 을 만들지 않고 호출한 쪽에 넘긴다.

## 호출한 쪽에 넘길 결과
- 성공/미완, 바퀴 수, 통과한 검사와 남은 문제(`loop.md`), 사람이 판단해야 할 점.

> 명령을 모르면 추측하지 말고 `Makefile`·`package.json`·`playwright.config.ts` 에서 실제 명령을 찾는다.
