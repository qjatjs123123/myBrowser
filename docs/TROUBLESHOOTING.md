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

## (해당 없음) `better-sqlite3` 가 `NODE_MODULE_VERSION` 불일치로 실패
- spec 003 부터 SQLite 는 내장 `node:sqlite` 를 쓴다 — 네이티브 모듈이 없어 이 문제는 생기지 않는다. 다른 네이티브 모듈을 들이면 `pnpm exec electron-rebuild -f -w {모듈}`.

## vitest 에서 chromium·루프 테스트가 `Test timed out in 5000ms`
- 원인: 다른 vitest·e2e 실행과 동시에 돌아 CPU 가 밀림 (spec 003 — 리팩토링 서브에이전트와 겹쳤을 때 cdp·driver·service 테스트 4건).
- 해결: 단독으로 다시 돌려 통과하는지 확인한다. 동시에 여러 테스트 묶음을 돌리지 않는다. 타임아웃을 늘려 덮지 않는다.

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

## e2e 에서 크롬 창 요소를 못 찾음 / 탭 수가 0 — `app.firstWindow()` 가 탭 View 를 잡음
- 증상: `getByRole('combobox', { name: '주소창' })` 이 30초 대기 후 실패, 또는 탭 count 0. 가끔만 재현.
- 원인: 탭(WebContentsView, `about:blank`)도 Playwright 의 window(Page)라, 크롬 renderer 보다 먼저 잡히는 경쟁이 있다.
- 해결: `e2e/fixtures.ts` 의 `findChromeWindow` — URL 이 `/renderer/index.html` 인 Page 를 고른다. `firstWindow()` 를 직접 쓰지 않는다.

## e2e 에서 단축키(Ctrl+T 등)가 안 먹음
- 원인: Playwright `page.keyboard`(CDP `Input.dispatchKeyEvent`)는 Electron 의 `before-input-event` 를 거치지 않는다 — main 의 단축키 처리는 OS 입력 경로에만 걸린다.
- 해결: `e2e/fixtures.ts` 의 `pressKeyInTab(app, { urlPart, keyCode, modifierList })` — `webContents.sendInputEvent` 로 보낸다.

## WSLg(`DISPLAY=:0`)에서 e2e 탭이 저절로 늘어나거나 외부 사이트가 열림
- 증상: 시작 직후 탭이 14~18개, 아무 입력 없이 `https://google.com/` 로드 경고.
- 원인: 테스트 창이 실제 데스크톱에 떠서 사용자·다른 세션의 입력이 섞인다.
- 해결: `xvfb-run -a make e2e …` 로 격리해 판정한다.

## `pnpm dlx shadcn@latest add {부품}` 가 `./@/components/...` 를 만들고 `cn` 패키지를 추가함
- 원인: CLI 가 `components.json` 의 `@/` alias 를 풀지 못함 (spec 004 textarea).
- 해결: `package.json`·lock 을 되돌리고 `pnpm install --frozen-lockfile`, 파일을 `src/renderer/components/ui/{부품}.tsx` 로 옮겨 `import { cn } from '@/lib/utils'` 로 고친다.

## 에이전트 e2e 첫 테스트에서 주소창 값이 `nhttp://…` 가 되어 네이버 검색으로 이동
- 원인 (spec 008 에서 정정): 앱 경합이 아니다. e2e 가 데스크톱(WSLg)에 창을 띄우면 OS 포커스를 가져가고, 그때 사용자가 친 **실제 키보드·한글 IME 입력**이 테스트 창으로 들어간다. 시작 직후 `pressSequentially` 16회 중 5회 오염(`로그이`·`chttp`, body 로 간 `w k`·`r m d`), xvfb 에서는 16/16 통과.
- 해결: `pnpm test:e2e` 가 xvfb 가상 디스플레이로 돈다 (`scripts/e2eRun.ts`). 헬퍼의 `click` → `fill` → `toHaveValue(url)` → `Enter` 순서도 유지한다. 화면을 볼 때(`E2E_HEADED=1`)는 실행 중 키보드를 쓰지 않는다.

## e2e 종료 때 `uncaughtException: Object has been destroyed` (spec 008)
- 원인: 앱 종료 직전 탭 로드가 실패(외부 요청 차단 등)하면 늦게 온 탭 상태 이벤트가 이미 파괴된 메인 창의 `window.webContents` 를 읽는다.
- 해결: `createSidebarEmitter` getter 가 `window.isDestroyed()` 면 null 을 돌려준다 (`src/main/index.ts`). 재현은 차단 후 바로 `app.close()` 를 16회 반복.

## vitest 의 chromium 테스트가 전부 `Test timed out in 5000ms` — rAF·스크린샷이 영원히 대기 (spec 005)
- 증상: `src/main/browser/__tests__` 의 click·scroll·screenshot 테스트만 실패. 레포 코드 없이 `chromium.launch()` → `requestAnimationFrame` 도 5초 안에 안 온다. 부하·플래그(`--disable-gpu`)와 무관.
- 원인: WSL 재시작 뒤 WSLg Wayland 컴포지터가 응답하지 않는데 셸에 `WAYLAND_DISPLAY=wayland-0` 이 남아 있으면 headless chromium 이 그 Wayland 에 붙어 프레임이 멈춘다 (`env -u WAYLAND_DISPLAY` 면 바로 됨).
- 해결: `vitest.setup.main.ts` 가 테스트 시작 전에 `WAYLAND_DISPLAY` 를 지운다(이미 반영). 직접 스크립트를 돌릴 때는 `env -u WAYLAND_DISPLAY node …`. 근본 해결은 Windows 에서 `wsl --shutdown` 후 다시 열기.

## 계정 e2e 에서 재실행 후 기기 토큰이 사라짐 — `safeStorage.isEncryptionAvailable()` 이 false (spec 005)
- 원인: Linux `password-store=basic` 백엔드(basic_text)에서 Electron 은 `setUsePlainTextEncryption(true)` 를 부르기 전까지 "암호화 불가"로 답한다 → SR-1 에 따라 디스크에 쓰지 않음.
- 해결: test 모드에서만 `index.ts` 가 `safeStorage.setUsePlainTextEncryption(true)` 를 부른다(이미 반영). production 은 basic_text 면 메모리에만 둔다(설계대로).

## `pnpm dist:linux`·`pnpm e2e:packaged` 가 사내망에서 다운로드 실패
- electron-builder 가 AppImage 도구를 받는다 — 위 사내망 항목과 같이 `NODE_EXTRA_CA_CERTS=<회사 루트 PEM>` 을 붙여 실행한다.

## e2e 에서 `nativeTheme.themeSource = 'dark'` 로 바꿔도 화면이 라이트 (spec 012)
- 증상: main 의 `nativeTheme.shouldUseDarkColors` 는 true 인데 renderer `matchMedia('(prefers-color-scheme: dark)')` 은 false, 스크린샷이 라이트.
- 원인: 앱 버그가 아니다 — Playwright `_electron` 이 붙은 페이지에 기본으로 `colorScheme: 'light'` 를 에뮬레이트해 OS 테마를 덮는다.
- 해결: e2e 에서 `await win.emulateMedia({ colorScheme: null })` 로 에뮬레이션을 푼 뒤 `nativeTheme.themeSource` 를 바꾼다 (`e2e/sidebar-layout.spec.ts`). 재현: emulateMedia 없이 → false, 푼 뒤 dark → true, light → false.


## WSLg 에서 최대화하면 창 내용이 ~32px 밀려 보이고, 탭 줄을 눌러도 주소창이 눌림 (spec 017)
- 증상: 최대화 후 창이 모니터 (0,0) 이 아니라 오른쪽·아래로 밀려 그려지고 오른쪽·아래가 잘린다. X bounds(`getBounds`)·Windows `GetWindowRect` 는 정상이라 좌표만 보면 맞아 보인다. 실제 마우스는 보이는 탭 줄을 눌러도 renderer 에는 y≈40~57(주소창)로 들어와 끌기·더블클릭 복원이 안 된다.
- 원인: WSLg(Weston) 가 **창 관리자 최대화 상태**의 프레임 없는 X 창을 그림자 여백만큼 밀어 그린다 (`_NET_FRAME_EXTENTS` 6,6,27,6). 투명 창 여부와 무관 — 순수 Electron 창으로도 재현. 일반 창을 `setBounds` 로 같은 위치에 두면 정확히 그려진다.
- 해결: Linux 는 `app/windowMaximize.ts` 가 최대화를 "측정 → unmaximize → setBounds(작업 영역)" 으로 바꾸고 최대화 상태를 앱이 관리한다. `display.workArea` 는 WSLg 에서 작업 표시줄을 빼지 않으므로 크기는 창 관리자 최대화 bounds 로 잰다.
- 함정 (spec 018): 창 관리자가 unmaximize 뒤 창을 예전 위치로 되돌리는 시점이 일정하지 않다 (unmaximize 이벤트 뒤 ~80ms 일 때도 ~340ms 일 때도 있음). "N ms 뒤 1회 재적용" 은 놓친다 → 배치 후 1초 동안 `move`·`resize` 이벤트에서 작업 영역을 벗어나면 다시 적용(최대 3회).
- 확인 방법: CDP 합성 입력은 renderer 좌표로 바로 들어가 재현되지 않는다. 화면 픽셀로 본다 — renderer 에 `position:fixed` 색 사각형을 넣고, PowerShell `SetWindowPos(HWND_TOPMOST)` 후 `CopyFromScreen` 으로 모니터 (0,0) 픽셀을 읽는다 (`AppActivate` 는 창을 SW_RESTORE 해 bounds 를 바꾸므로 쓰지 않는다).

## WSLg 에서 둥근 창 모서리(spec 014)가 네모로 보임 (spec 018 조사)
- 증상: 창 내용의 모서리는 둥근데 창 둘레에 사각 그림자·윤곽이 보여 전체가 직각처럼 보인다.
- 원인: Weston(WSLg 창 관리자)이 프레임 없는 X 창 둘레에 사각 그림자(약 32px 여백, `_NET_FRAME_EXTENTS` 38,38,59,38)를 그린다. 투명 모서리 자체는 정상 — 검은 창 위에 반지름 40px 투명 창을 띄우면 모서리 픽셀이 검정으로 비친다.
- 결정: WSLg 개발 환경에서만 보이는 외관이라 그대로 둔다. 배포판(Windows `.exe`·macOS)은 OS 가 모서리를 그린다.
