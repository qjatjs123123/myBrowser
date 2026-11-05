---
name: desktop-app-check
description: UI·에이전트 동작 Task 를 Playwright _electron 으로 실제 myBrowser 앱을 띄워 눌러보며 renderer 콘솔·main 프로세스 에러 0 을 확인하고, 그 흐름을 e2e 로 고정해 통과시키는 절차. UI·에이전트 Task 완료 전 필수.
---

# desktop/app-check — 실제 앱 실검증 → e2e 고정

> 절차 스킬 — **`.claude/skills/COMMON.md` 를 먼저 읽고** 따른다.

> **vibe-build 모드** — 공통 규칙은 `COMMON.md` §2. 이 스킬만의 차이: 창을 띄울 수 없는 환경(`Missing X server`)이면 `xvfb-run -a` 로 e2e 를 돌려 판정하고 `RUN_DIR/app-check.md` 에 "headless(xvfb) 판정" 을 적는다.

화면·에이전트 동작을 만든 뒤 **두 겹으로** 확인한다.
1. **탐색 실행** — 앱을 띄워 흐름을 한 단계씩 수행하고(e2e 스크립트의 `test.only` 또는 임시 spec), renderer 콘솔 에러·main 프로세스 에러·unhandled rejection 을 받아와 고친다.
2. **e2e 고정** — 통과한 그 흐름을 `e2e/{기능}.spec.ts` 로 저장한다.

**둘 다 통과해야 Task 를 완료할 수 있다.** 작업 종료 시 Stop 훅이 e2e 를 다시 돌린다.

## 입력
```
desktop/app-check <핵심 사용자 흐름> [RUN_DIR]
예) desktop/app-check "사이드바에 '예약' 입력 → 에이전트가 탭에서 픽스처 예약 페이지로 이동 → 날짜·인원 입력 → '예약 확정' 버튼 앞에서 승인 모달 표시 → 거부 시 클릭되지 않음" .harness/runs/reservation-guard
```
- 흐름은 spec 의 FR·SR·Task "검증" 필드에서 가져온다.
- `RUN_DIR` 이 없으면 `.harness/runs/` 의 진행 중 run 을 쓰고, 그것도 없으면 `.harness/runs/{기능}/` 을 만든다.

---

## 1️⃣ 실행 방식

- 앱은 Playwright 가 띄운다: `e2e/fixtures.ts` 의 `test` 가 `_electron.launch({ args: ['.'], env: { MYBROWSER_FAKE_MODEL: '1', MYBROWSER_USER_DATA: <임시 폴더> } })` 로 **깨끗한 프로필**에서 실행하고, 종료 시 닫는다. 이미 떠 있는 개발용 앱(`pnpm dev`)과 섞지 않는다.
- **가짜 모델 모드**(`MYBROWSER_FAKE_MODEL=1`): 에이전트 루프가 Claude API 대신 `e2e/fixtures/model/*.json` 의 스크립트된 도구 호출 시퀀스를 재생한다. 승인 게이트·ask_user·도구 실행은 진짜로 돈다. 실제 API 호출 테스트는 금지 (비용·비결정성).
- **웹 페이지는 로컬 픽스처**: `e2e/fixtures/pages/*.html` 을 `file://` 또는 e2e 가 띄우는 로컬 정적 서버로 연다. 외부 사이트(naver 등)에 접속하는 e2e 금지.

## 2️⃣ 탐색 실행 루프

| 목적 | 방법 |
|---|---|
| 사이드바 조작 | `const win = await app.firstWindow()` → `win.getByRole(...)` |
| 탭(WebContentsView) 확인 | `app.windows()` 에서 탭 페이지를 찾거나, main 의 테스트 전용 IPC(`test:getTabState`)로 URL·제목·스냅샷을 받는다 (`rules/electron/ipc.md` 「테스트 전용 채널」) |
| **renderer 콘솔 에러** | fixtures 가 `win.on('console')`·`win.on('pageerror')` 로 자동 수집 → `console-errors.log` |
| **main 프로세스 에러** | fixtures 가 `app.process().stderr` 와 main 의 `process.on('uncaughtException'|'unhandledRejection')` 로그를 수집 → `[main.error]` 줄 |
| 참고용 화면 | `win.screenshot()` — 판정 근거 아님 |

절차:
1. 흐름을 **한 단계씩** 수행한다. 각 단계 후 기대 결과(모달이 떴다, 탭 URL 이 바뀌었다, 단계 로그에 도구 호출이 보인다)를 **assertion** 으로 확인한다.
2. 흐름이 끝나면(또는 막히면) 에러를 센다: `grep -cE '^\[(console\.error|pageerror|main\.error)\]' RUN_DIR/console-errors.log`.
3. **판정 — 모두 충족해야 통과**: 콘솔 error 0, pageerror 0, main.error 0, 흐름 마지막 단계의 기대 결과 존재. **승인이 필요한 행동은 승인 전에 실행되지 않았음**을 반드시 assertion 으로 확인한다 (픽스처 페이지가 클릭을 기록하는 방식).
4. 미통과면 원인 코드를 고친다 → 같은 흐름 전체를 재실행. 같은 에러 3회 연속이면 중단·보고.

> ❌ 스크린샷을 보고 "괜찮아 보인다"로 통과 판정하지 않는다.

## 3️⃣ 증거 기록 — `RUN_DIR/app-check.md`
```markdown
## {YYYY-MM-DD HH:MM} {흐름 이름}
- 흐름: {수행한 단계 요약}
- 콘솔 error: {n} / pageerror: {n} / main.error: {n}
- 승인 게이트: {해당 시 — 승인 전 미실행 확인 ✅}
- 결과: ✅ 통과 | ❌ 미통과 — {남은 문제}
- 수정한 파일: {있으면}
```

## 4️⃣ 흐름을 e2e 로 고정
```ts
// e2e/reservation-guard.spec.ts
import { expect, test } from './fixtures'; // 앱 실행·에러 수집·가짜 모델 모드

test('예약 확정 버튼 앞에서 승인 모달이 뜨고, 거부하면 클릭되지 않는다', async ({ app, win, fixtureUrl }) => {
  await win.getByRole('textbox', { name: '작업 입력' }).fill(`${fixtureUrl('reservation.html')} 에서 2명 예약`);
  await win.getByRole('button', { name: '실행' }).click();
  await expect(win.getByRole('dialog', { name: '승인 필요' })).toBeVisible();
  await win.getByRole('button', { name: '거부' }).click();
  const clicked = await app.evaluate(({ ipcMain }) => undefined); // 또는 test:getTabState 로 픽스처의 clickLog 확인
  expect(clicked).toBeFalsy();
});
```
- `@playwright/test` 가 아니라 **`./fixtures` 의 `test`** 를 import 한다.
- 선택자는 역할·이름(`getByRole`, `getByLabel`, `getByText`). CSS 클래스·nth 금지.
- 테스트마다 새 임시 프로필(userData)을 써서 상태가 남지 않게 한다.

## 5️⃣ e2e 실행 — 통과까지
```bash
make e2e SPEC=e2e/{기능}.spec.ts HARNESS_RUN_DIR=<RUN_DIR>
```
실패하면 고치고 재실행. 같은 실패 3회 연속이면 중단·보고.

## 6️⃣ 완료 보고
```
✅ app-check 통과: {흐름}
- 에러: 콘솔 0 · pageerror 0 · main 0 (RUN_DIR/app-check.md)
- e2e: e2e/{기능}.spec.ts {n}개 통과
- 수정한 파일: {목록}
```

---

## 금지
- ❌ 탐색 실행 없이 e2e 만, 또는 e2e 없이 탐색만으로 완료 처리
- ❌ 외부 사이트·실제 Claude API 에 의존하는 e2e
- ❌ 테스트 약화 — `test.skip`/`fixme`, assertion 삭제, `@playwright/test` 직접 import 로 에러 수집 회피
- ❌ 승인 게이트 흐름을 "모달이 보인다"만으로 통과 — 승인 전 미실행까지 확인
- ❌ 에러를 "무관한 에러"로 판단해 무시 (원인이 이번 작업 밖이면 보고에 남기고 통과 처리하지 않는다)
