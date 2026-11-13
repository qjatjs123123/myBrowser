# Spec: 방문 기록 전용 페이지 + 툴바 [⋮] 메뉴

> **상태**: ✅ 완료
> **생성일**: 2026-11-13
> **묶음**: 기반 (직접 방식 — 묶음 하나, 메인이 Task 1→5 순서대로)
> **관련 spec**: 002(새 탭 시작 화면·단축키), 021(방문 기록·Ctrl+H·북마크 — 이번에 기록 위치를 옮긴다)
> **설계 참조**: docs/DESIGN.md §2(프로세스 구조), §3「상태·기록」

---

## 1. 요구사항

### 배경 / 목적
spec 021 은 방문 기록을 새 탭 시작 화면 아래에 그렸다. 사용자 요청(2026-11-13): "방문기록은 이 페이지에서 보여지지 말고, 에이전트 왼쪽의 세로 … 를 누르면 드롭다운에 방문 기록 항목이 있고, 그걸 누르면 별도 페이지에서 보여지도록". 세부는 기본값으로 정한다(사용자는 바로 진행을 선호).

### 기능 요구사항
- **FR-1**: 새 탭 시작 화면에서 「방문 기록」 영역을 뺀다 (검색창·엔진 버튼·바로가기·북마크 타일은 그대로).
- **FR-2**: 툴바 [에이전트] 버튼 바로 왼쪽(북마크 별 오른쪽)에 세로 점 3개 [메뉴] 버튼(`aria-label="메뉴"`, `aria-haspopup="menu"`)이 있다.
- **FR-3**: [메뉴] 를 누르면 버튼 바로 아래에 메뉴가 열리고 「방문 기록」 항목(단축키 표시 Ctrl+H, mac Cmd+Shift+H)이 있다. 메뉴는 **OS 네이티브 팝업 메뉴**(Electron `Menu.popup`)다 — 탭 View(WebContentsView)가 renderer DOM 위에 그려지므로 웹 드롭다운은 사이드바가 닫혔을 때 탭에 가려진다.
- **FR-4**: 「방문 기록」 을 누르면 방문 기록 **전용 페이지 탭**이 열린다 — 탭 제목 "방문 기록", 콘텐츠는 renderer 가 그리는 기록 화면(제목 "방문 기록", 검색·목록·한 줄 지우기·두 번 눌러 모두 지우기 — spec 021 FR-5 동작 그대로), 검색 입력에 포커스. 이미 열린 방문 기록 탭이 있으면 새로 만들지 않고 그 탭으로 간다.
- **FR-5**: 기록 항목을 누르면 그 탭이 그 페이지로 이동한다(탭은 일반 페이지 탭이 되고 제목도 페이지 제목으로 바뀐다). 뒤로 가기로 돌아오면 일반 새 탭 시작 화면이다.
- **FR-6**: Ctrl+H(mac Cmd+Shift+H)도 FR-4 와 같다 (spec 021 FR-6 의 "새 탭 + 검색 포커스" 를 대체).
- **FR-7**: 방문 기록 탭에서는 주소창이 비어 있고(새 탭과 같음) 북마크·배율·찾기는 비활성이다 (웹 페이지가 아니다).

### 안전 요구사항
- **SR-1**: 에이전트 도구·`guard.ts`·승인 흐름을 바꾸지 않는다. 메뉴에는 승인·에이전트 관련 항목이 없다.
- **SR-2**: 메뉴를 여는 IPC 는 위치(x, y — 0 이상 정수)만 받는다. 메뉴 항목·동작은 main 이 정한다 (renderer 가 임의 항목·명령을 넣을 수 없다).
- **SR-3**: 방문 기록 탭의 View 는 계속 `about:blank` 이다 — 내부 페이지용 새 프로토콜·preload 를 탭 View 에 넣지 않는다 (탭 View 무 preload 규칙 유지).

### 범위 제외
- 메뉴의 다른 항목(북마크 관리·설정·다운로드 등), 북마크 전용 페이지, 기록 날짜별 묶음·무한 스크롤(목록은 spec 021 처럼 최근 30개 + 검색)
- 방문 기록 탭을 앱 재실행 후 복원

---

## 2. 설계 개요

- **내부 페이지 표시** — `TabStateSchema` 에 `internalPage: InternalPageSchema.nullable()` (`InternalPageSchema = z.enum(['history'])`) 추가. TabManager 의 탭 항목이 `internalPage` 를 들고, View url 이 새 탭(`''`·`about:blank`)일 때만 유효 — url 이 바뀌어 새 탭이 아니게 되면 main 이 `null` 로 지운다(뒤로 가도 시작 화면). `isNewTab` 은 "웹 페이지 없음(renderer 가 그림)" 의미 그대로 true, 제목은 "방문 기록".
- **TabManager.openHistoryPage(): string** — 기존 방문 기록 탭이 있으면 활성화, 없으면 `createTab()` 뒤 그 항목에 `internalPage='history'`. 단축키 `openHistory` 와 메뉴가 같이 쓴다.
- **메뉴** — `src/main/app/mainMenu.ts` 의 `createMainMenuTemplate({ platform, onOpenHistory })` (순수 함수, 항목: 「방문 기록」, accelerator 표시만 — `registerAccelerator: false`, 실제 키는 shortcuts.ts). `index.ts` 가 `Menu.buildFromTemplate(...).popup({ window, x, y })`. 「방문 기록」 클릭 = `openHistoryPage()` + 크롬 포커스 + `shortcut:pressed {focusHistorySearch}` (Ctrl+H 와 같은 경로).
- **renderer** — `chrome/HistoryPage/`(spec 021 `NewTabPage/HistorySection` 을 옮겨 전체 페이지로), `chrome/MoreMenuButton/`(EllipsisVertical, 누르면 버튼 사각형 왼쪽 아래 좌표로 `useAppMenu().open`), `BrowserChrome` 은 `activeTab.isNewTab && internalPage === 'history'` 면 HistoryPage, 아니면 NewTabPage.

## IPC 계약

| 채널 | 방향 | 요청 | 응답 |
|---|---|---|---|
| `app:showMenu` | invoke | `ShowMenuRequestSchema = z.strictObject({ x: z.number().int().min(0), y: z.number().int().min(0) })` (창 콘텐츠 기준 DIP) | `z.null()` |
| `tabs:changed`·`tabs:list` (변경) | event/invoke | — | `TabStateSchema` 에 `internalPage: z.enum(['history']).nullable()` 추가 |

`shortcut:pressed` 의 `focusHistorySearch` 는 그대로 — 의미만 "방문 기록 페이지 검색에 포커스".

---

## 3. 작업 순서 (Tasks)

### Task 1 — shared 계약 + 소비자 맞추기
- [x] `src/shared/ipc/tabs.ts` `InternalPageSchema`·`TInternalPage`, `TabStateSchema.internalPage`; `src/shared/ipc/app.ts` `ShowMenuRequestSchema`·`TShowMenuRequest`; `channels.ts` `app.showMenu`; `api.ts` `IApi.app.showMenu`; `preload/index.ts`; `vitest.setup.ts` mock; `e2e/app-shell.spec.ts` 의 `appKeyList` 기대값을 `['getInfo', 'showMenu']` 로 (apiKeyList 는 그대로)
- [x] 탭 상태 리터럴을 쓰는 테스트에 `internalPage: null` 추가, main `toTabState` 가 `internalPage: null` 을 채운다(Task 2 에서 실제 값)
- **테스트**: `src/shared/ipc/__tests__/{tabs,app}.test.ts` — internalPage 허용 값/거부, ShowMenuRequest 음수·소수 거부. `pnpm test src/shared`
- **검증**: `pnpm type-check` + 단위 테스트
- **커밋**: `feat: 방문 기록 페이지·메뉴 IPC 계약 (spec 023 Task 1)`
- **묶음**: 기반

### Task 2 — TabManager 방문 기록 탭 + Ctrl+H
- [x] `TabManager.openHistoryPage()`, 항목 `internalPage`, 새 탭이 아니게 되면 지움, 제목 "방문 기록"
- [x] `shortcuts.ts` `openHistory` → `tabManager.openHistoryPage()` (IShortcutTabTarget 에 추가, createTab 대신)
- **테스트**: `src/main/tabs/__tests__/tabManager.test.ts` — 열기·제목·isNewTab·두 번 열면 같은 탭 활성·이동하면 internalPage null·닫으면 다음에 새로 만듦; `shortcuts.test.ts` openHistory 가 openHistoryPage 호출. `pnpm test src/main/tabs`
- **검증**: `pnpm type-check` + 단위 테스트
- **커밋**: `feat: 방문 기록 전용 탭과 Ctrl+H (spec 023 Task 2)`
- **묶음**: 기반

### Task 3 — 메인 메뉴 (main)
- [x] `src/main/app/mainMenu.ts` `createMainMenuTemplate`, `src/main/ipc/handlers/app.ts` `app:showMenu`(safeParse → 주입된 `showMenu(point)`), registry 등록, `index.ts` 조립(Menu.popup, 「방문 기록」 = Ctrl+H 와 같은 동작)
- [x] `src/main/ipc/__tests__/registry.test.ts` 의 `createAppHandlers` 호출에 가짜 `showMenu` 를 넣고 등록 키 기대값을 `[IPC.app.getInfo, IPC.app.showMenu]` 로 (`app.test.ts` 기존 두 호출도 같이)
- **테스트**: `src/main/app/__tests__/mainMenu.test.ts` — 항목 라벨·accelerator(linux CmdOrCtrl+H / darwin Cmd+Shift+H)·registerAccelerator false·click 이 onOpenHistory 호출; `src/main/ipc/__tests__/app.test.ts` — 잘못된 좌표(음수·소수·추가 필드)는 `fail('INVALID_INPUT', …)` 이고 showMenu 를 부르지 않음, 정상은 showMenu 호출·ok(null). `pnpm test src/main`
- **검증**: `pnpm type-check` + 단위 테스트
- **커밋**: `feat: 툴바 메뉴 네이티브 팝업 (spec 023 Task 3)`
- **묶음**: 기반

### Task 4 — renderer: 방문 기록 페이지·[메뉴] 버튼·시작 화면 정리
- [x] `chrome/HistoryPage/`(HistorySection 옮김 + 페이지 제목), `NewTabPage` 에서 기록 제거, `hooks/useAppMenu.ts`, `chrome/MoreMenuButton/`, `BrowserChrome` 조립
- [x] HistoryPage 는 제목을 `<h1>방문 기록</h1>` 하나만 두고, 옮긴 섹션의 `h2` 와 `section aria-label` 은 뺀다. 새 단위·e2e 테스트는 제목을 `getByRole('heading', { name: '방문 기록', level: 1 })`, 탭을 `getByRole('tab', { name: '방문 기록', exact: true })` 로 찾는다
- [x] `MoreMenuButton` 은 버튼 사각형의 `{ x: Math.max(0, Math.round(rect.left)), y: Math.max(0, Math.round(rect.bottom)) }` 를 보낸다
- [x] `architecture.md` §3 과 `react-convention.md` 「위치」의 chrome 목록에 `HistoryPage/(방문 기록 전용 페이지)`·`MoreMenuButton/(툴바 [메뉴] — 네이티브 팝업)` 추가, NewTabPage 설명을 `(시작 화면 — 북마크)` 로
- **테스트**: `HistoryPage/__tests__/HistoryPage.test.tsx`(옮긴 기록 테스트), `NewTabPage.test.tsx` 기록 없음, `MoreMenuButton.test.tsx`(좌표 전달 — 소수 사각형 left 10.4·bottom 39.6 → `{10, 40}`), `useAppMenu.test.ts`, `BrowserChrome.test.tsx`(internalPage history 면 기록 페이지·focusHistorySearch 포커스). `pnpm test src/renderer`
- **검증**: desktop/app-check — [메뉴] → 「방문 기록」 → 기록 탭·검색 포커스, 기록 클릭 이동, 새 탭에 기록 없음. 콘솔·main 에러 0
- **커밋**: `feat: 방문 기록 페이지와 툴바 메뉴 버튼 (spec 023 Task 4)`
- **묶음**: 기반

### Task 5 — e2e
- [x] `e2e/browser-basics.spec.ts` 의 기록 테스트를 메뉴 경로로(테스트에서 `Menu.prototype.popup` 을 가로채 항목 click), Ctrl+H 테스트는 "방문 기록" 탭·포커스·두 번 눌러도 탭 1개 추가, 새 탭에 기록 영역 없음
- **테스트**: `make e2e SPEC=e2e/browser-basics.spec.ts`, 이어 전체 `make e2e`
- **검증**: desktop/app-check (위 흐름), 기존 e2e 의 "방문 기록" 선택자 영향 확인
- **커밋**: `test: 방문 기록 페이지·메뉴 e2e (spec 023 Task 5)`
- **묶음**: 기반

---

## 4. 진행 로그
- 2026-11-13 spec 작성
- 2026-11-13 spec-reviewer FAIL 6건 반영 → PASS. Task 1~5 구현(직접 방식). e2e 는 Menu.prototype.popup 을 가로채 항목 click. make check 통과, e2e 73/73, 앱 에러 0
