# Spec: 브라우저 기본기(북마크·방문 기록·페이지 내 찾기·확대/축소) + 에이전트 실행 상태 표시·OS 알림

> **상태**: 🚧 진행중
> **생성일**: 2026-11-13
> **묶음**: 기반 (직접 방식 — 묶음 하나, 메인이 Task 1→10 순서대로. 공유 파일 소유자도 이 묶음)
> **관련 spec**: 002(크롬형 브라우저·단축키·새 탭 페이지), 003·004(에이전트 run·승인·질문 이벤트), 011(에이전트 버튼 점), 012(단축키 Ctrl+Shift+A), 013(SQLite 저장소 패턴)
> **설계 참조**: docs/DESIGN.md §2(프로세스 구조), §3「상태·기록」, §5 로드맵(브라우저 완성도)

---

## 1. 요구사항

### 배경 / 목적
일상 브라우저로 쓰려면 북마크·방문 기록·찾기·확대/축소가 필요하고, 에이전트가 탭에서 일하는 동안 사용자가 다른 창을 보고 있어도 **어느 탭에서 일하는지·끝났는지·승인을 기다리는지** 알아야 한다. 사용자 결정(2026-11-13): "설명할 것 없다, 바로 진행" — 아래 기본값으로 확정.

### 기능 요구사항
**북마크**
- **FR-1**: 툴바 주소창 오른쪽 [북마크] 별 버튼(aria-pressed)으로 활성 탭(새 탭 제외 http(s))을 북마크에 추가·제거할 수 있다. Ctrl+D(mac Cmd+D)도 같다.
- **FR-2**: 북마크는 SQLite 에 url 고유로 저장되어 재실행 후에도 남는다. 같은 url 을 다시 추가하면 제목만 갱신(중복 없음). 최대 500개 — 넘으면 `LIMIT` "북마크는 최대 500개까지 저장할 수 있습니다".
- **FR-3**: 새 탭 시작 화면에 「북마크」 영역(최신 추가 순 최대 12개 타일, 제목 첫 글자 + 제목)이 보이고, 누르면 그 탭이 이동한다. 북마크가 없으면 영역을 그리지 않는다.

**방문 기록**
- **FR-4**: 탭(에이전트가 연 탭 포함)이 http(s) 페이지 로드를 끝낼 때마다(`did-finish-load`, 메인 프레임) url·제목·시각이 기록된다. 가장 최근 기록과 url 이 같으면(새로 고침) 새 줄 대신 그 줄의 시각·제목을 갱신한다. 최대 5000줄 — 넘으면 오래된 것부터 지운다.
- **FR-5**: 새 탭 시작 화면에 「방문 기록」 영역 — 검색 입력(제목·url 부분 일치, 대소문자 무시) + 최근 순 최대 30개 목록(제목·호스트·시각). 항목을 누르면 이동, 항목별 [기록에서 지우기], [방문 기록 모두 지우기]는 두 번 눌러야(첫 클릭 후 버튼 문구가 "정말 모두 지울까요?"로 바뀌고 3초 안에 다시 누름) 지운다.
- **FR-6**: Ctrl+H(mac 은 Cmd+Shift+H — Cmd+H 는 OS 의 앱 숨기기)로 새 탭을 열고 방문 기록 검색 입력에 포커스한다.

**페이지 내 찾기**
- **FR-7**: Ctrl+F(mac Cmd+F)로 툴바 아래 찾기 줄(`role="search"`, 이름 "페이지에서 찾기")을 열고 입력에 포커스한다. 새 탭 시작 화면에서는 열지 않는다.
- **FR-8**: 입력할 때마다 활성 탭에서 찾고(`webContents.findInPage`), "현재/전체"(예 `2/5`, 없으면 `0/0`)를 보인다. Enter=다음, Shift+Enter=이전, [이전]/[다음] 버튼도 같다.
- **FR-9**: Esc·[찾기 닫기]·탭 전환·이동하면 찾기를 끝내고(`stopFindInPage('clearSelection')`) 줄을 닫는다.

**확대/축소**
- **FR-10**: Ctrl+=(Ctrl+Shift+= 의 '+' 포함)·Ctrl+- ·Ctrl+0, Ctrl+마우스 휠로 활성 탭을 단계(25·33·50·67·75·80·90·100·110·125·150·175·200·250·300·400·500 %)로 확대·축소·초기화한다.
- **FR-11**: 100% 가 아니면 주소창 오른쪽에 배율 버튼(예 "125%", 이름 "확대/축소 125% — 눌러서 100%로")이 보이고 누르면 100% 로 되돌린다. 배율은 Chromium 기본처럼 같은 사이트(호스트) 탭끼리 공유되고, 앱 실행 동안만 유지된다.

**에이전트 실행 상태 표시**
- **FR-12**: run 이 `queued|running` 인 동안 에이전트가 다루는 탭(시작 탭, switch_tab·open_tab 하면 그 탭)의 탭 줄 항목에 "에이전트 작업 중" 표시(`role="img"`, 움직이는 점)가, `waiting_user` 이면 "에이전트 응답 대기" 표시(주황 점)가 보인다. 한 번에 한 탭만 표시되고, run 이 끝나면(done·failed·stopped·stopped_before_confirm) 사라진다. 표시된 탭을 닫으면 표시도 사라진다.

**OS 알림**
- **FR-13**: 앱 창에 포커스가 없을 때 다음 agent 이벤트마다 OS 알림 1건을 띄운다 — `approval_required`("승인이 필요합니다" / `{display.action} — {display.target}`, target 이 비면 `display.action` 만 — kind=model 은 `확인 요청`), `question`("에이전트 질문" / 질문 문장), `done`("작업을 마쳤습니다" / 요약), `failed`("작업이 실패했습니다" / 이유). `stopped`(사용자가 멈춤)는 알리지 않는다. 본문은 120자에서 자르고 "…".
- **FR-14**: 알림을 누르면 창을 복원·표시·포커스한다 (승인·질문이면 사이드바는 spec 011 규칙대로 자동으로 열려 있다). 창에 포커스가 있으면 알리지 않는다. `Notification.isSupported()` 가 false 면 조용히 건너뛴다.

### 안전 요구사항
- **SR-1**: 안전 게이트·승인 흐름은 바꾸지 않는다 — 이번 기능은 에이전트 도구를 추가하지 않고 `guard.ts` 를 건드리지 않는다. 알림에서 승인·거부를 할 수 없다(알림 클릭 = 창 포커스만). 승인 결정은 여전히 사이드바 승인 창에서만.
- **SR-2**: 알림·방문 기록에는 사용자가 입력한 값(질문의 답, type_text 입력값, 폼 값)을 싣지 않는다 — 알림은 이벤트에 이미 있는 display·질문·요약·이유만, 기록은 url·제목만. (spec 004 SR-5 와 같음)
- **SR-3**: 방문 기록·북마크는 http(s) url 만 저장한다 (about:blank·file: 등 제외). 북마크 추가 요청의 url 은 `HttpUrlSchema` 로 검증한다.
- **SR-4**: 탭 상태의 `agentActivity` 는 표시용일 뿐 에이전트 동작을 바꾸지 않는다 (가드·루프는 이 값을 읽지 않는다).

### 비기능 요구사항 / 제약
- 토큰 비용 변화 없음 (프롬프트·도구 불변). 탭 스냅샷에 필드 2개 추가 — `list_tabs` 결과 텍스트 형식은 그대로.
- 찾기 줄이 열리면 콘텐츠 영역 높이가 줄어든다 — `useContentBounds`(ResizeObserver)가 다시 재서 탭 View 를 맞춘다 (탭 View 가 renderer DOM 위에 그려지므로 찾기 줄은 콘텐츠 영역 **밖**에 둔다).
- 방문 기록 조회는 인덱스(`visited_at`) 로 50ms 이내 (5000줄).

### 범위 제외 (Out of Scope)
- 주소창 자동 완성에 기록·북마크 제안, 북마크 폴더·편집·가져오기/내보내기, 북마크 바, 기록 페이지(chrome://history 식 전용 화면), 사이트별 배율 영구 저장
- 알림 켜기/끄기 설정(OS 알림 설정으로 끈다), 알림 버튼(승인 등)
- 에이전트가 북마크·기록을 읽는 도구

---

## 2. 설계 개요

### 영향받는 프로세스 / 파일
- shared: `src/shared/ipc/{tabs,shortcut,channels,api}.ts` 수정, `src/shared/ipc/{bookmarks,history}.ts` 신규
- main/tabs: `tabType.ts`(ITabView 에 zoom·find·onPageLoaded·onZoomWheel), `electronTabView.ts`, `tabManager.ts`(zoom·find·agentActivity·onPageLoaded), `zoom.ts`(단계 계산, 신규), `shortcuts.ts`(새 단축키)
- main/store: `migrations/003_bookmarks_history.sql`, `db.ts`, `repos/{bookmarks,history}.ts`
- main/app: `agentTabActivity.ts`(run 상태 → 탭 표시, 신규), `runNotifier.ts`(이벤트 → 알림, 신규)
- main/ipc: `handlers/{bookmarks,history}.ts` 신규, `handlers/tabs.ts`(zoom·find), `main/index.ts` 조립
- preload: `src/preload/index.ts`
- renderer: `hooks/{useBookmarks,useHistory,useFindInPage}.ts`, `chrome/{FindBar,BookmarkButton,ZoomBadge}/`, `chrome/NewTabPage/`(북마크·기록 영역), `chrome/TabBar/TabItem.tsx`(에이전트 표시), `chrome/BrowserChrome/`(조립), `vitest.setup.ts`(mock)
- e2e: `e2e/browser-basics.spec.ts`, `e2e/agent-status.spec.ts`, 픽스처 `e2e/fixtures/pages/browser-find.html`

### IPC 계약

| 채널 | 방향 | 요청 스키마 | 응답/이벤트 스키마 |
|---|---|---|---|
| `tabs:changed`·`tabs:list` (변경) | event / invoke | — | `TabStateSchema` 에 `zoomPercent: z.number().int().min(25).max(500)`, `agentActivity: z.enum(['working','waiting']).nullable()` 추가 |
| `tabs:zoom` | invoke | `ZoomTabRequestSchema = { tabId, direction: z.enum(['in','out','reset']) }` | `EmptyResponseSchema` (없는 탭 NOT_FOUND) |
| `tabs:find` | invoke | `FindInPageRequestSchema = { tabId, text: z.string().min(1).max(200), isForward: z.boolean(), isNext: z.boolean() }` — isNext=false 면 새 검색 | `EmptyResponseSchema` |
| `tabs:stopFind` | invoke | `TabRequestSchema` | `EmptyResponseSchema` |
| `tabs:findUpdated` | main→renderer | — | `FindUpdatedEventSchema = { tabId, activeMatch: int ≥0, matchCount: int ≥0 }` (`found-in-page` 의 finalUpdate 만) |
| `shortcut:pressed` (변경) | event | — | action enum 에 `'openFindBar' \| 'toggleBookmark' \| 'focusHistorySearch'` 추가 |
| `bookmarks:list` | invoke | 없음(`undefined`) | `BookmarkListResponseSchema = { bookmarkList: Bookmark[] }` (최신 추가 순) |
| `bookmarks:add` | invoke | `BookmarkAddRequestSchema = { url: HttpUrlSchema, title: z.string().trim().max(300) }` (빈 제목이면 url 로 저장) | `BookmarkListResponseSchema` / `LIMIT` |
| `bookmarks:remove` | invoke | `BookmarkRemoveRequestSchema = { url: z.string().min(1).max(2048) }` (없는 url 이어도 ok — 멱등) | `BookmarkListResponseSchema` |
| `history:list` | invoke | `HistoryListRequestSchema = { query: z.string().trim().max(200).default(''), limit: z.number().int().min(1).max(200).default(30) }` | `HistoryListResponseSchema = { entryList: HistoryEntry[] }` (최근 순) |
| `history:remove` | invoke | `HistoryRemoveRequestSchema = { id: z.string().min(1) }` | `EmptyResponseSchema` (없는 id NOT_FOUND) |
| `history:clear` | invoke | 없음 | `EmptyResponseSchema` |

- `BookmarkSchema = { id: string, url: string, title: string, createdAt: string(ISO) }`
- `HistoryEntrySchema = { id: string, url: string, title: string, visitedAt: string(ISO) }`
- `IApi` 에 `tabs.zoom/find/stopFind/onFindUpdated`, `bookmarks.{list,add,remove}`, `history.{list,remove,clear}` 추가.

### 단축키 (main `shortcuts.ts` — before-input-event 한 경로)
| 키 (mac 은 Cmd) | 동작 | 처리 |
|---|---|---|
| Ctrl+F | `openFindBar` | focusChrome + emit `openFindBar` |
| Ctrl+D | `toggleBookmark` | focusChrome 없이 emit `toggleBookmark` (renderer 가 활성 탭으로 add/remove) |
| Ctrl+H (mac Cmd+Shift+H) | `openHistory` | createTab + focusChrome + emit `focusHistorySearch` |
| Ctrl+= · Ctrl+Shift+= ('+') · Ctrl+- · Ctrl+0 | `zoomIn`·`zoomOut`·`zoomReset` | 활성 탭 `tabManager.zoom(id, dir)` |
| Ctrl+휠 | 위=zoomIn / 아래=zoomOut | `zoom-changed` 이벤트 → TabManager |

### 도구 계약
변경 없음 (에이전트 도구 추가·변경 없음, SR-1).

### 데이터
`src/main/store/migrations/003_bookmarks_history.sql` (user_version 3):
```sql
CREATE TABLE bookmarks (id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE history (id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL, visited_at TEXT NOT NULL);
CREATE INDEX history_visited_at ON history (visited_at DESC);
```

### 에이전트 탭 표시 흐름 (main/app/agentTabActivity.ts — electron 없음)
`createAgentTabActivity({ setActivity(tabId|null, activity|null) })` → `{ wrapTabsPort(port), startRun(tabId), handleEvent(event) }`.
- `createDriver` 에서 시작 탭 id 로 `startRun` → 대상 탭 기억, 표시 `working`.
- 감싼 tabsPort 의 `activate(id)`·`create()` 결과로 대상 탭을 바꾸고 표시를 옮긴다.
- `status` 이벤트: queued·running → working, waiting_user → waiting, 종료 상태 → `setActivity(null, null)`.
- TabManager `setAgentActivity(tabId|null, activity|null)` — 한 탭만, 그 탭을 닫으면 지운다, 스냅샷 `agentActivity` 로 보인다.

### 알림 흐름 (main/app/runNotifier.ts)
`createRunNotifier({ isWindowFocused, show({ title, body, onClick }), focusWindow })` → `handleEvent(event)`. 순수 매핑 `toRunNotification(event): { title, body } | null` 을 export 해 단위 테스트. electron `Notification` 어댑터는 `index.ts` 조립에서 (`new Notification({ title, body }).on('click', …).show()`), `isSupported()` false 면 show 생략. `Notification.isSupported()`·`window.isFocused()` 는 알림마다 호출 시점에 읽는다(시작 때 캐시 금지 — e2e 가 패치한다).
에이전트 `emit` 을 `(event) => { emitToSidebar(...); notifier.handleEvent(event); tabActivity.handleEvent(event); }` 로 감싼다.

### 열린 질문
없음 (사용자가 기본값 진행 지시 — 2026-11-13).

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 **테스트와 검증이 모두 에러 0**이 될 때까지 수정 → 재실행을 반복하고, 전부 통과했을 때만 체크박스를 채우고 **Task 단위로 커밋**한 뒤 다음 Task 로 진행한다.
> 모든 Task 는 **테스트 코드 필수**. **UI Task 와 에이전트 동작 Task 는 Playwright `_electron` e2e**(`e2e/*.spec.ts`, 가짜 모델 모드·로컬 픽스처)를 포함해야 한다. 실제 Claude API·외부 사이트에 의존하는 테스트 금지.
> 모든 Task 완료 후 **`desktop/refactor` 적용 모드**가 의무 실행된다 (vibe-build 에서는 6단계).
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**

- [ ] **Task 1: IPC 계약 — 스키마·채널·window.api 타입·preload·mock**
  - **묶음**: 기반
  - **작업**: 위 IPC 계약대로 `shared/ipc/tabs.ts`(TabState 필드 2개, Zoom·Find 스키마, FindUpdatedEvent), `shared/ipc/bookmarks.ts`·`history.ts`(스키마·상수 `BOOKMARK_COUNT_MAX=500`·`HISTORY_ROW_MAX=5000`·메시지), `shortcut.ts` enum, `channels.ts`, `api.ts`, `preload/index.ts`, `vitest.setup.ts` mock(기본 빈 목록), `e2e/app-shell.spec.ts` — 테스트 이름과 `apiKeyList` 끝에 `bookmarks`, `history` 를 추가한다 (preload 노출과 같은 커밋, spec 013 Task 1 과 같은 방식). TabState 필드 추가로 깨지는 소비자(TabManager.toTabState 는 `zoomPercent: 100, agentActivity: null` 임시 기본, 테스트 픽스처의 탭 상태 객체)를 같은 Task 에서 고친다.
  - **파일**: `src/shared/ipc/{tabs,bookmarks,history,shortcut,channels,api}.ts`, `src/preload/index.ts`, `vitest.setup.ts`, `e2e/app-shell.spec.ts`, `src/main/tabs/tabManager.ts`, 탭 상태를 만드는 기존 테스트
  - **테스트**: `src/shared/ipc/__tests__/{tabs,bookmarks,history}.test.ts` — 유효/무효(빈 찾기 문자열, 201자, file: url 북마크, limit 0, zoomPercent 600)
  - **실행**: `pnpm test src/shared/ipc && pnpm type-check`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과, 기존 테스트 전부 green
  - **커밋**: `feat: 북마크·방문 기록·찾기·확대 IPC 계약 (spec 021 Task 1)`

- [ ] **Task 2: 탭 확대/축소·찾기·로드 완료 알림·에이전트 표시 (TabManager)**
  - **묶음**: 기반
  - **작업**: `tabs/zoom.ts` — `ZOOM_PERCENT_LIST`, `getNextZoomPercent(current, direction)`(목록에 없는 값이면 가장 가까운 단계 기준). `ITabView` 에 `getZoomPercent/setZoomPercent`, `findInPage(text, { isForward, isNext })`, `stopFindInPage()`, `onFindUpdated(cb)`, `onPageLoaded(cb({url,title}))`, `onZoomWheel(cb('in'|'out'))` 추가, `electronTabView.ts` 구현(`setZoomFactor`, `found-in-page` finalUpdate, `did-finish-load` 메인 프레임, `zoom-changed`). TabManager: `zoom(id, dir)`(적용 후 모든 탭 refresh — 같은 호스트 공유), `find(id, …)`, `stopFind(id)`, `setAgentActivity(id|null, activity|null)`(닫히면 지움), 옵션 `onPageLoaded?({tabId,url,title})`·`onFindUpdated?(event)`, 스냅샷에 `zoomPercent`·`agentActivity`. 이동(did-navigate) 시 찾기 중단. electronTabView 는 `findInPage(text, { forward: isForward, findNext: !isNext })` 로 부른다 (Electron 의 findNext=true 는 "새 검색 세션 시작"이라 spec 의 isNext 와 뜻이 반대).
  - **파일**: `src/main/tabs/{zoom,tabType,electronTabView,tabManager}.ts`, `vitest.setup.main.ts`(mock webContents 에 `setZoomFactor/getZoomFactor/findInPage/stopFindInPage`)
  - **테스트**: `src/main/tabs/__tests__/zoom.test.ts`(단계 경계 25·500, 사이값), `tabManager.test.ts` 추가 — zoom 위임·스냅샷 반영, agentActivity 한 탭만·탭 닫으면 null, onPageLoaded 는 http(s) 만 전달, find/stopFind 위임, 없는 id 무시; `electronTabView.test.ts` — findNext 대응(isNext=false → findNext:true), finalUpdate 가 아니면 무시, zoom-changed in/out 대응, did-navigate 시 stopFindInPage, did-finish-load 메인 프레임만
  - **실행**: `pnpm test src/main/tabs`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat(tabs): 확대/축소·페이지 내 찾기·에이전트 탭 표시 (spec 021 Task 2)`

- [ ] **Task 3: 단축키 — 찾기·북마크·기록·확대/축소**
  - **묶음**: 기반
  - **작업**: `TShortcutAction` 에 `openFindBar|toggleBookmark|openHistory|zoomIn|zoomOut|zoomReset`, 키 표(위 단축키 표). mac 은 Cmd+Shift+H = openHistory(Cmd+H 는 null — OS 숨기기). `IShortcutTabTarget` 에 `zoom(id, dir)`.
  - **파일**: `src/main/tabs/shortcuts.ts`
  - **테스트**: `src/main/tabs/__tests__/shortcuts.test.ts` — 각 키 판정(linux/darwin), '+'·'=' 둘 다 zoomIn, 실행기: openHistory 가 createTab+focus+emit, zoom 은 활성 탭에
  - **실행**: `pnpm test src/main/tabs`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 기존 단축키 테스트 그대로 통과
  - **커밋**: `feat(tabs): 찾기·북마크·기록·확대 단축키 (spec 021 Task 3)`

- [ ] **Task 4: 북마크·방문 기록 저장소 + 마이그레이션 003**
  - **묶음**: 기반
  - **작업**: `003_bookmarks_history.sql`, `db.ts` MIGRATION_LIST. `repos/bookmarks.ts` — `list/add/remove`(add: url 고유 upsert·500 상한 `LIMIT`, 빈 제목은 url). `repos/history.ts` — `record({url,title})`(최근 줄과 url 같으면 갱신, 5000 초과분 삭제), `list({query,limit})`(LIKE, `%`·`_` 이스케이프), `remove(id)`, `clear()`. 의존 주입 `now`·`createId`.
  - **파일**: `src/main/store/migrations/003_bookmarks_history.sql`, `src/main/store/db.ts`, `src/main/store/repos/{bookmarks,history}.ts`
  - **테스트**: `src/main/store/repos/__tests__/{bookmarks,history}.test.ts` (`:memory:`) — 중복 url 1줄, 상한, 최신 순, 새로 고침 갱신, 5000 넘으면 오래된 것 삭제(상한을 주입 가능하게), 검색 대소문자·`%` 리터럴, remove NOT_FOUND; `db.test.ts` user_version 3
  - **실행**: `pnpm test src/main/store`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat(store): 북마크·방문 기록 저장소 (spec 021 Task 4)`

- [ ] **Task 5: 에이전트 탭 표시·OS 알림 모듈**
  - **묶음**: 기반
  - **작업**: `app/agentTabActivity.ts`, `app/runNotifier.ts`(`toRunNotification` + `createRunNotifier`, 120자 자르기) — 위 흐름대로. electron import 없음.
  - **파일**: `src/main/app/{agentTabActivity,runNotifier}.ts`
  - **테스트**: `src/main/app/__tests__/{agentTabActivity,runNotifier}.test.ts` — status 별 표시·종료 시 해제·switch/open 으로 대상 이동; 이벤트별 제목·본문, stopped·step·status 는 null, 포커스 있으면 show 안 함, 클릭 시 focusWindow, 질문 답(`question_answered`)은 알리지 않음, display.target 이 빈 승인은 본문이 action 만
  - **실행**: `pnpm test src/main/app`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat(app): 에이전트 탭 표시·실행 알림 (spec 021 Task 5)`

- [ ] **Task 6: IPC 핸들러 + main 조립**
  - **묶음**: 기반
  - **작업**: `handlers/bookmarks.ts`·`handlers/history.ts`(safeParse → repo → 봉투, 응답 parse), `handlers/tabs.ts` 에 zoom·find·stopFind. `index.ts`: 저장소 생성, TabManager `onPageLoaded → history.record`, `onFindUpdated → emit tabs:findUpdated`, tabsPort 를 `tabActivity.wrapTabsPort` 로 감싸기·createDriver 에서 `startRun`, agent emit 감싸기(notifier·tabActivity), electron Notification 어댑터(`Notification.isSupported()`·`window.isFocused()` 는 알림마다 호출 시점에 읽는다 — 캐시 금지), 단축키 러너에 zoom.
  - **파일**: `src/main/ipc/handlers/{bookmarks,history,tabs}.ts`, `src/main/index.ts`
  - **테스트**: `src/main/ipc/__tests__/{bookmarks,history}.test.ts`, `tabs.test.ts` 추가 — INVALID_INPUT, NOT_FOUND, LIMIT 봉투, 정상 위임
  - **실행**: `pnpm test src/main/ipc`
  - **검증**: `pnpm type-check` + 단위 테스트 (앱 흐름은 Task 9·10 e2e)
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat(ipc): 북마크·방문 기록·찾기·확대 핸들러 조립 (spec 021 Task 6)`

- [ ] **Task 7: renderer 훅 — useBookmarks·useHistory·useFindInPage**
  - **묶음**: 기반
  - **작업**: `useBookmarks()`(list 로드, `isBookmarked(url)`, `toggle(tab)` — 실패는 결과 봉투 반환), `useHistory({ query })`(query 바뀌면 200ms 디바운스 후 list, `remove(id)`·`clear()` 후 다시 읽기), `useFindInPage(tab)`(`isOpen/open/close/search(text)/next/prev`, `onFindUpdated` 구독 — 같은 tabId 만, tabId 또는 활성 탭 url 이 바뀌면 close 하고 `tabs.stopFind` 호출 — 테스트: url 변경 시 isOpen=false·stopFind 호출).
  - **파일**: `src/renderer/hooks/{useBookmarks,useHistory,useFindInPage}.ts`
  - **테스트**: `src/renderer/hooks/__tests__/{useBookmarks,useHistory,useFindInPage}.test.ts` (mock window.api)
  - **실행**: `pnpm test src/renderer/hooks`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat(chrome): 북마크·방문 기록·찾기 훅 (spec 021 Task 7)`

- [ ] **Task 8: 크롬 UI — 찾기 줄·북마크 별·배율 버튼·새 탭 북마크/기록·탭 에이전트 표시**
  - **묶음**: 기반
  - **작업**: `chrome/FindBar/`(입력 `aria-label="찾을 내용"`, `n/m` `aria-live="polite"`, [이전 결과]·[다음 결과]·[찾기 닫기], Enter/Shift+Enter/Esc), `chrome/BookmarkButton/`(lucide Star, aria-label "북마크", aria-pressed, 새 탭이면 disabled), `chrome/ZoomBadge/`(100% 면 null), `NewTabPage` 에 「북마크」 nav(aria-label "북마크") 타일 + 「방문 기록」 region(검색 `aria-label="방문 기록 검색"`, list `aria-label="방문 기록 목록"`, 항목별 [기록에서 지우기], [방문 기록 모두 지우기] 두 번 누르기), `focusHistorySearch` 신호, `TabItem` 에 agentActivity 표시(탭 button 의 **형제**로 — 탭 이름 불변). `BrowserChrome` 조립: 단축키 `openFindBar`(새 탭이 아니면)·`toggleBookmark`·`focusHistorySearch`, 찾기 줄은 툴바 아래·콘텐츠 영역 밖. 디자인은 `.claude/skills/desktop/design/SKILL.md`.
  - **파일**: `src/renderer/chrome/{FindBar,BookmarkButton,ZoomBadge}/index.tsx`, `src/renderer/chrome/NewTabPage/{index,BookmarkSection,HistorySection}.tsx`, `src/renderer/chrome/TabBar/TabItem.tsx`, `src/renderer/chrome/BrowserChrome/index.tsx`
  - **테스트**: 각 폴더 `__tests__/` — 찾기 키 처리·카운트, 별 토글 aria-pressed, 배율 표시·리셋, 새 탭 북마크 없으면 영역 없음, 기록 두 번 눌러 지우기(3초 지나면 원래 문구), TabItem 표시 2종·탭 이름 불변. e2e 는 Task 9·10.
  - **실행**: `pnpm test src/renderer/chrome`
  - **검증**: `desktop/app-check` — Task 9·10 흐름
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat(chrome): 찾기 줄·북마크·배율·방문 기록·에이전트 탭 표시 화면 (spec 021 Task 8)`

- [ ] **Task 9: e2e — 브라우저 기본기**
  - **묶음**: 기반
  - **작업**: `e2e/fixtures/pages/browser-find.html`(같은 단어 3번). `e2e/browser-basics.spec.ts`: ① 픽스처 열기 → [북마크] 누름 → aria-pressed → 새 탭에 북마크 타일 → 누르면 이동 → 재실행(같은 userData) 후에도 타일 남음 ② 방문 기록 목록에 두 픽스처 제목, 검색으로 하나만, [기록에서 지우기], [방문 기록 모두 지우기] 두 번 ③ Ctrl+F(탭 페이지 포커스 상태에서 키) → 단어 입력 → `1/3` → Enter `2/3` → Esc 로 닫힘 → 다시 열고 다른 픽스처로 이동하면 찾기 줄이 사라진다 ④ Ctrl+= 두 번 → 배율 버튼 "125%" → 누르면 사라짐 ⑤ Ctrl+H → 새 탭 + 기록 검색 포커스.
  - **파일**: `e2e/browser-basics.spec.ts`, `e2e/fixtures/pages/browser-find.html`
  - **테스트**: 위 흐름
  - **실행**: `make e2e SPEC=e2e/browser-basics.spec.ts`
  - **검증**: `desktop/app-check` — 위 흐름, 통과 = 콘솔·main 에러 0 + e2e 통과
  - **통과 기준**: 기존 e2e(`browser-chrome`·`app-shell`·`task-suggestion`) 통과 — 새 탭 페이지 문구가 기존 선택자와 겹치면 고친다
  - **커밋**: `test(e2e): 북마크·방문 기록·찾기·확대 흐름 (spec 021 Task 9)`

- [ ] **Task 10: e2e — 에이전트 탭 표시·알림**
  - **묶음**: 기반
  - **작업**: `e2e/agent-status.spec.ts` (가짜 모델 — 기존 승인 시나리오 재사용 가능하면 재사용, 아니면 `e2e/fixtures/model/agent-status.json`): ① run 시작 → 대상 탭 항목에 "에이전트 작업 중" → 승인 대기 중 "에이전트 응답 대기" → [거부]/종료 후 표시 없음 ② `app.evaluate` 로 메인 창 `isFocused = () => false`, `Notification.isSupported = () => true`, `Notification.prototype.show` 기록 패치 → 승인 대기·종료 때 알림 제목 기록 확인 (승인 전 클릭 미실행 확인 — 픽스처 `__clickLog` 비어 있음).
  - **파일**: `e2e/agent-status.spec.ts`, (필요 시) `e2e/fixtures/model/agent-status.json`
  - **테스트**: 위 흐름
  - **실행**: `make e2e SPEC=e2e/agent-status.spec.ts`
  - **검증**: `desktop/app-check` — 위 흐름 + 승인 전 미실행
  - **통과 기준**: 기존 `agent-approval`·`agent-mvp`·`agent-toggle` e2e 통과
  - **커밋**: `test(e2e): 에이전트 탭 표시·실행 알림 흐름 (spec 021 Task 10)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
