---
description: 테스트 파일(__tests__/*.test.ts(x), e2e/*.spec.ts) 작성 시 — vitest·Testing Library·Playwright _electron 규칙
paths:
  - "**/__tests__/**"
  - "e2e/**"
  - "vitest.setup*.ts"
---

# 테스트 규칙

위치·도구는 `rules/architecture.md` §5.

## 공통
- 테스트 이름은 한국어 문장 "~하면 ~한다". 한 테스트 = 한 주장.
- **실제 Claude API·외부 사이트·사용자 프로필을 쓰지 않는다.** 모델은 `IModelClient` 가짜, 페이지는 `e2e/fixtures/pages/*.html`, 프로필은 임시 폴더.
- 테스트 약화 금지: `skip`·`only`(커밋 시)·assertion 삭제·기대값 끼워 맞추기·타임아웃 늘려 덮기.
- 시간·난수는 주입하거나 `vi.useFakeTimers()`.

## vitest (단위)
- `vitest.config.ts` 가 환경을 경로로 나눈다: `src/main/**`·`src/shared/**` → node, `src/renderer/**` → jsdom.
- renderer: Testing Library 의 `getByRole` 우선, `container.querySelector` 금지. `window.api` 는 `vitest.setup.ts` 의 `vi.fn()` 묶음 — 테스트에서 `mockResolvedValue` 로 응답을 준다.
- main: `electron` 은 `vitest.setup.main.ts` 의 최소 mock. 모듈은 가짜 의존을 생성자로 주입.
- 도구·브라우저 모듈: `beforeAll` 에서 `chromium.launch()` 1회, 테스트마다 새 page 로 픽스처 열기.

## e2e (Playwright `_electron`)
- `e2e/fixtures.ts` 의 `test` 만 import. 제공 fixture: `app`(ElectronApplication), `win`(사이드바 창 Page), `fixtureUrl(name)`, `tabState()`(test IPC). 앱은 `MYBROWSER_FAKE_MODEL=1` + 임시 userData 로 뜬다.
- 가짜 모델 시나리오는 `e2e/fixtures/model/{이름}.json` — `tool_use` 시퀀스. 테스트가 `MYBROWSER_FAKE_SCENARIO` 로 고른다.
- 콘솔·main 에러는 fixtures 가 `HARNESS_RUN_DIR/console-errors.log` 에 기록하고, **에러가 1건이라도 있으면 테스트 실패**.
- 선택자는 역할·이름. 데이터는 테스트마다 새 프로필이라 정리 불필요.
- 창을 띄울 수 없는 환경은 `xvfb-run -a pnpm test:e2e`.
