# 자주 나는 문제와 해결법

Claude 는 에러를 만나면 이 문서를 먼저 확인한다. 새 문제를 해결하면 같은 형식(`## 제목` + 증상·원인·해결)으로 추가한다.

## 개발 환경이 준비되지 않음
- 증상: 세션 시작 상태에 "개발 환경: 준비 안 됨" (`node_modules`·`.env` 없음)
- 해결: vibe-setup 스킬 (`make setup`). `package.json` 자체가 없으면 로드맵 0단계(뼈대 생성) spec 부터.

## Electron 창이 뜨지 않음 (`Missing X server or $DISPLAY`)
- 원인: WSL 에 WSLg 가 없거나 CI.
- 해결: 실행 확인은 Windows 쪽에서. 검증은 `xvfb-run -a make e2e` (`sudo apt install xvfb`).

## Electron 실행 시 공유 라이브러리 오류 (`libnss3.so`, `libgbm.so.1`, `libasound.so.2` 없음)
- 해결: `sudo apt install libnss3 libgbm1 libasound2 libatk-bridge2.0-0 libgtk-3-0` (사용자가 실행). `make doctor` 가 대표 항목을 알려준다.

## `better-sqlite3` 가 `NODE_MODULE_VERSION` 불일치로 실패
- 원인: Node 용으로 빌드된 네이티브 모듈을 Electron 이 로드.
- 해결: `pnpm exec electron-rebuild -f -w better-sqlite3` (또는 `pnpm rebuild`). electron-vite 템플릿의 `postinstall` 에 넣어 둔다.

## `connectOverCDP` 가 `ECONNREFUSED 127.0.0.1:9222`
- 원인: `app.commandLine.appendSwitch('remote-debugging-port', …)` 가 `app.whenReady()` **이후**에 호출됐거나, 포트가 다른 프로세스에 점유.
- 해결: 스위치는 `src/main/index.ts` 최상단(ready 전)에서. `lsof -i :9222` 로 점유 확인. 테스트는 `MYBROWSER_CDP_PORT=0` 로 임의 포트 → `app.on('ready')` 후 실제 포트를 로그에서 읽는다.

## `aria-ref` 로케이터가 요소를 못 찾음
- 원인: 스냅샷 이후 DOM 이 바뀌어 ref 가 무효.
- 해결: 도구 결과를 `{ ok:false, reason:'ref 가 더 이상 유효하지 않음 — snapshot 을 다시 호출하세요' }` 로 돌려준다 (`browser/actions.ts`). 테스트는 픽스처 페이지에서 요소 제거 후 click 으로 재현.

## 승인 모달이 떴는데 도구가 이미 실행됨
- 원인: `guard.check` 를 도구 실행 **후**에 호출했거나, 훅이 `require_approval` 판정을 받고도 `await` 하지 않았다.
- 해결: 루프 훅에서 `verdict.kind === 'require_approval'` 이면 Promise 를 보류(`pendingApproval`)하고 `agent:approve` 가 resolve 할 때까지 도구를 호출하지 않는다. e2e 는 픽스처의 `window.__clickLog` 로 미실행을 확인.

## e2e 가 `console-errors.log` 때문에 실패 — 에러가 내 코드와 무관해 보임
- 해결: 무시하지 않는다. 픽스처 페이지가 내는 에러면 픽스처를 고치고, Electron 의 알려진 경고(`Autofill.enable` 등)는 `e2e/fixtures.ts` 의 **allowlist 상수**에 패턴과 이유를 적어 걸러낸다 (테스트 코드에서 개별 무시 금지).

## 종료할 때 품질 게이트가 막음
- 해결: 출력된 에러를 읽고 고친다. 규칙을 끄거나 테스트를 약화하지 않는다. 계층 import 위반은 메시지의 `.claude/rules/...` 를 읽는다. 자세한 로그는 `.harness/gate-last.log`.

## 품질 게이트가 e2e 를 계속 미룸
- 원인: `.harness/runs/{slug}/` 에 `DONE` 없는 run 이 남아 있음.
- 해결: 그 작업을 harness 루프로 끝내고 `DONE` 을 만들거나, 버린 작업이면 사용자 확인 후 `DONE` 생성.

## 커밋이 "커밋 컨벤션에 맞지 않습니다"로 막힘
- 해결: `docs/CONVENTIONS.md` "### 커밋" 을 읽고 `type(scope): 제목` 으로. vibe-build 커밋은 끝에 `(spec NNN)`.

## 사내망에서 Electron·Playwright 다운로드가 `fetch failed` / `self-signed certificate in certificate chain`
- 원인: 회사 프록시가 HTTPS 를 자체 루트 CA 로 다시 서명한다. curl 은 `~/.curlrc` 의 `insecure` 로 통과하지만 Node 는 거부한다.
- 해결: 검증을 끄지 말고 회사 루트 CA 를 Node 에 추가한다. 루트 인증서를 PEM 으로 저장한 뒤 `NODE_EXTRA_CA_CERTS=<pem 경로> make setup` (또는 셸 설정에 export). Electron 바이너리만 다시 받을 때는 `NODE_EXTRA_CA_CERTS=<pem> node node_modules/electron/install.js`.
  루트 인증서 추출 예: `echo | openssl s_client -connect github.com:443 -showcerts 2>/dev/null | awk '/BEGIN CERT/{n++} n==3,/END CERT/' > ~/corp-root.pem` — 저장 후 `openssl x509 -in ~/corp-root.pem -noout -subject` 로 회사 루트인지 확인한다.

## `node_modules/electron/dist` 가 없음 / `Electron failed to install correctly`
- 원인: pnpm 10 은 install script 를 기본으로 막는다. `package.json` 의 `pnpm.onlyBuiltDependencies` 에 `electron` 이 있어야 한다. 이미 설치된 뒤 허용했다면 script 가 다시 돌지 않는다.
- 해결: `node node_modules/electron/install.js` 를 직접 실행한다 (사내망이면 위 항목의 `NODE_EXTRA_CA_CERTS` 와 함께).

## vitest 가 `Failed to start forks worker` + undici `Cannot read properties of undefined (reading 'bind')`
- 원인: pnpm 이 Node 20 으로 실행됐다. jsdom 30 의 undici 8 은 Node 22.19+ 의 `zlib.createZstdDecompress` 가 필요하다. Volta 는 `VOLTA_FEATURE_PNPM=1` 이 없으면 package.json 의 node pin 을 pnpm 에 적용하지 않는다. Claude Code 가 Volta 로 실행되면 `_VOLTA_TOOL_RECURSION=1` 이 상속돼 shim 이 pin 을 무시하기도 한다.
- 해결: Makefile·훅은 두 값을 처리한다. 직접 터미널에서 `pnpm` 을 쓸 때는 셸 설정에 `export VOLTA_FEATURE_PNPM=1` 을 추가한다. 확인: 프로젝트 폴더에서 `pnpm exec node -v` 가 v22 이어야 한다 (`make doctor` 가 검사).

## `make setup` 이 main·dev 브랜치를 만들지 않음
- 원인: 저장소에 커밋이 하나도 없다.
- 해결: 첫 커밋을 한 뒤 `make setup` 을 다시 실행한다.

