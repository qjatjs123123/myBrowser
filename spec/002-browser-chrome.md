# Spec: 크롬형 브라우저 — 탭·주소창·뒤로/앞으로·프로필 영속

> **상태**: ✅ 완료
> **생성일**: 2026-11-05
> **묶음**: 기반, main-tabs, renderer-chrome
> **관련 spec**: 001
> **설계 참조**: docs/DESIGN.md §2 · §4 · §5(로드맵 1단계)

---

## 1. 요구사항

### 배경 / 목적
spec 001 의 창에는 브라우징 영역 "자리"만 있다. 에이전트(로드맵 2단계)가 조작할 실제 탭이 필요하고, 사용자는 크롬처럼 탭·주소창으로 직접 브라우징하며 로그인 세션을 유지할 수 있어야 한다.

### 기능 요구사항
- **FR-1 탭**: 상단 탭 바에서 탭을 열고(＋ 버튼)·닫고(✕)·눌러서 전환할 수 있다. 각 탭에 제목·파비콘(없으면 기본 아이콘)·로딩 표시(스피너)가 보인다. 마지막 탭을 닫으면 새 탭 1개가 자동으로 열린다 (앱은 닫히지 않는다).
- **FR-2 주소창**: 활성 탭의 URL 이 주소창에 보인다 (새 탭이면 비어 있고 placeholder "검색어 또는 주소 입력"). URL 형태를 입력하고 Enter 하면 그 주소로 이동한다 — `https://…`/`http://…` 는 그대로, `naver.com`·`example.co.kr/path` 는 `https://` 를, `localhost:3000`·`127.0.0.1:8080` 은 `http://` 를 붙인다.
- **FR-3 검색 선택**: URL 이 아닌 문자열을 입력하면 주소창 아래에 두 줄 "'{입력}' — 네이버에서 검색", "'{입력}' — 구글에서 검색" 이 나타난다. Enter 는 강조된 줄(기본 첫 줄 네이버), ↑/↓ 로 강조 이동, 클릭으로 선택. Esc 는 목록을 닫고 주소창을 활성 탭 URL 로 되돌린다. 선택은 저장하지 않는다 (매번 고른다).
- **FR-4 탐색 버튼**: 뒤로·앞으로·새로고침 버튼이 활성 탭에 동작한다. 뒤로/앞으로는 갈 곳이 없으면 비활성. 로딩 중에는 새로고침 자리가 "중지"가 된다.
- **FR-5 새 탭 페이지**: 새 탭은 앱 내부 시작 화면 — 검색창 + [네이버에서 검색] [구글에서 검색] 버튼 + 바로가기(네이버 홈, 구글). 입력 없이 검색 버튼을 누르면 아무 일도 없다. 외부 접속은 사용자가 누를 때만 일어난다.
- **FR-6 팝업 → 새 탭**: 페이지의 `target=_blank` 링크·`window.open` 은 별도 창이 아니라 앱 안의 새 탭(활성)으로 열린다.
- **FR-7 단축키** (탭 페이지에 포커스가 있어도 동작): Ctrl+T 새 탭, Ctrl+W 탭 닫기, Ctrl+L 주소창 포커스(전체 선택), Ctrl+R 새로고침, Alt+← 뒤로, Alt+→ 앞으로, Ctrl+Tab / Ctrl+Shift+Tab 다음/이전 탭. macOS 는 Ctrl 대신 Cmd.
- **FR-9 크롬형 모양**: 상단은 크롬처럼 탭 줄 + 툴바 두 줄이다 (아래 「설계 개요 → 크롬 시각 규칙」). Electron 기본 메뉴 막대(File/Edit/View/Window)는 보이지 않는다 — 복사·붙여넣기·실행 취소 등 편집 단축키는 그대로 동작한다.
- **FR-8 프로필 영속**: 탭 페이지는 `persist:browsing` 세션을 쓴다 — 로그인 쿠키(만료 있는 쿠키)는 앱을 다시 켜도 유지된다. 재실행 시 탭은 새 탭 1개로 시작한다 (탭 복원 없음).

### 안전 요구사항
에이전트는 관여하지 않는다. 보안 기본값만:
- **SR-1**: 탭 View 는 `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, **preload 없음**, `partition: 'persist:browsing'`.
- **SR-2**: 탭이 이동·새 탭으로 열 수 있는 URL 은 `http:`·`https:`(+ 새 탭의 `about:blank`)만 — `file:`·`javascript:`·`data:`·커스텀 스킴은 거부(이동 preventDefault, 팝업은 항상 deny). `tabs:navigate`·`tabs:create` 요청 스키마도 http(s)만 통과. 별도 창은 절대 만들지 않는다.
- **SR-3**: 주소창의 `javascript:…`·`file:…` 같은 입력은 URL 로 해석하지 않고 검색어로 취급한다.
- **SR-4**: preload 는 `app`·`tabs`·`shortcut` 의 명시적 메서드만 노출한다 (`ipcRenderer` 노출 금지 유지).

### 비기능 요구사항 / 제약
- 탭 상태는 main 이 단일 출처 — `tabs:changed` 로 **전체 목록**을 보낸다 (rules/electron/main.md 「탭」). renderer 는 zustand 에 복제하지 않는다.
- renderer CSP `img-src` 에 `http: https:` 추가 (파비콘 표시). 그 외 CSP 는 그대로.
- e2e 는 로컬 HTTP 픽스처 서버(127.0.0.1 임의 포트)만 쓴다. 외부 사이트(네이버·구글)로 실제 이동하지 않는다 — 검색 선택·바로가기는 이동 요청 URL 을 단위 테스트로 검증하고, e2e 는 검색 옵션 표시와 픽스처 URL 이동만 확인한다.

### 범위 제외 (Out of Scope)
HTTPS 자물쇠·보안 표시, 설정 저장(검색엔진·시작 페이지), 탭 복원, 히스토리·북마크·자동완성, 탭 드래그 재정렬, 다운로드, 확대/축소, 여러 창, 보이는 메뉴 막대(기능 메뉴·⋮ 메뉴), 프레임 없는 창(탭을 제목 표시줄에 넣기), 에이전트 연결(로드맵 2단계).

---

## 2. 설계 개요

### 결정 사항
- **탭 View 배치**: 메인 `BrowserWindow`(renderer = 크롬 + 사이드바)의 `contentView` 에 탭마다 `WebContentsView` 를 자식으로 추가한다. renderer 가 브라우징 콘텐츠 영역 div 의 rect 를 `ResizeObserver`·`resize` 로 재서 `tabs:setBounds` 로 보내고, TabManager 가 **활성 탭만** `setVisible(true)` + `setBounds`, 나머지는 `setVisible(false)`.
- **새 탭 = `about:blank` + React 시작 화면**: 새 탭은 `about:blank` 를 연 View 이고 `isNewTab: true`(url 이 `about:blank` 또는 빈 문자열)이면 View 를 숨기고 renderer 가 콘텐츠 영역에 `NewTabPage` 를 그린다. 뒤로 가서 `about:blank` 로 돌아와도 같은 규칙. 새 탭 제목은 "새 탭".
- **검색 선택 목록은 문서 흐름 안에 둔다**: 네이티브 View 가 renderer 위에 그려져 드롭다운이 가려지므로, 목록은 주소창 아래 크롬 헤더 안에 펼쳐지고(높이 증가) 콘텐츠 영역이 그만큼 내려간다 → ResizeObserver 가 새 rect 를 보낸다.
- **주소 해석은 shared 순수 함수** (`src/shared/utils/addressInput.ts`): `resolveAddressInput(text)` → `{ kind: 'url', url } | { kind: 'search', query } | null(빈 입력)`, `buildSearchUrl(engine, query)` — 네이버 `https://search.naver.com/search.naver?query={q}`, 구글 `https://www.google.com/search?q={q}` (`encodeURIComponent`). renderer 가 목록 표시·이동 URL 계산에 쓰고, main 은 http(s) 스키마로 다시 검증한다.
- **설계 변경 — 단축키는 `before-input-event`**: `.claude/skills/desktop/design` §2 의 "메뉴 단축키(accelerator)" 대신, 메인 창 webContents 와 모든 탭 webContents 의 `before-input-event` 에서 `toShortcutAction(input, platform)` 으로 판정 → `preventDefault` → 실행한다 (탭 View 에 포커스가 있어도 동작, 메뉴 막대 없이 동작). **메뉴 accelerator 는 등록하지 않는다** (중복 실행 방지). Ctrl+L·Ctrl+T 는 main 이 메인 창 webContents 에 `focus()` 후 `shortcut:pressed` 이벤트를 보낸다. 9단계에서 design §2 를 갱신한다.
- **설계 변경 — `emitToSidebar` 에 schema 인자**: rules/electron/ipc.md 의 `emitToSidebar(channel, payload)` 를 `emitToSidebar(channel, schema, payload)`(보내기 전 parse 를 강제)로 바꾼다. `createSidebarEmitter(getWebContents)` 가 이 함수를 반환한다. 9단계에서 ipc.md 를 갱신한다.
- **팝업**: 탭 webContents `setWindowOpenHandler` → url 이 http(s) 면 `onOpenWindow(url)`(→ `createTab(url)`, 활성), 항상 `{ action: 'deny' }`. `will-navigate` 에서 http(s)·`about:blank` 외는 `preventDefault`.
- **쿠키 flush**: `before-quit` 에서 `persist:browsing` 세션의 `cookies.flushStore()` 를 await 한 뒤 종료 (재실행 영속 보장).
- **TabManager 는 electron 비의존으로 테스트**: `ITabView`·`ITabHost` 인터페이스를 주입받는다. 실제 `WebContentsView` 어댑터는 `electronTabView.ts`.
- **UI 부품**: 이번 spec 에서 shadcn 을 초기화하고 `button`·`input` 부품, `cn()`, `lucide-react` 아이콘을 들인다 (DESIGN.md §1 "shadcn 은 쓰는 spec 에서 추가").
- **에러 표시**: renderer 의 `on*` 콜백은 `Promise<TIpcResult<…>>` 를 반환하고, 각 컴포넌트가 `ok:false` 면 `toast.error(error.message)` (`skills/desktop/error-toast`). `useTabs` 의 초기 list 실패는 `listError` 로 반환하고 BrowserChrome 이 toast. 이번에 `sonner` + `lib/toast.ts` + `<Toaster/>` 를 들인다.
- **탭 접근성 구조**: 닫기 버튼은 `role="tab"` 요소의 **형제**로 둔다 — 탭 이름은 제목만 (상호작용 요소 중첩 금지, 선택자 충돌 방지).
- **기존 레이아웃 변경**: `App.tsx` 의 헤더 "새 탭" `h1` 과 "탭이 여기에 표시됩니다" 자리 문구를 `BrowserChrome` 으로 바꾼다. 사이드바는 그대로. 기존 app-shell e2e 의 heading '새 탭' 은 NewTabPage `h1` "새 탭" 하나에만 맞는다.
- **크롬 시각 규칙** (Task 6·7, 토큰·shadcn 만 — 색 하드코딩 금지, `skills/desktop/design` §2 를 구체화):
  - 탭 줄(높이 36px, `bg-muted`, 왼쪽 여백 8px, 탭은 아래에 붙음): 탭은 위 모서리만 둥글게(`rounded-t-lg`), 폭 `flex: 1 1 240px` + `max-w-60` + `min-w-18` (많으면 균등 축소), 안쪽 = 파비콘 16px(또는 스피너) + 제목(`truncate`, `text-xs`) + 닫기 ✕(16px 아이콘, 20px 원형 hover 배경). 활성 탭 `bg-background text-foreground` — 아래 툴바와 같은 색으로 이어져 보인다. 비활성 탭 `text-muted-foreground`, hover `bg-background/60`. 비활성 탭끼리 사이에 1px 세로 구분선(`bg-border`, 높이 16px — 활성 탭 양옆·hover 탭 옆은 숨김). 닫기 ✕ 는 활성 탭은 항상, 비활성은 hover 때만 보인다(`opacity` 전환, 포커스 시에도 보임). ＋ 버튼(28px 원형 고스트)은 마지막 탭 바로 오른쪽.
  - 툴바(높이 40px, `bg-background`, 아래 `border-b border-border`, 좌우 패딩 8px, 간격 4px): 뒤로·앞으로·새로고침/중지 = 32px 원형 고스트 아이콘 버튼(lucide `ArrowLeft`·`ArrowRight`·`RotateCw`/`X`, 18px, `text-muted-foreground`, disabled 는 `opacity-40`). 주소창은 나머지 폭 전부를 차지하는 pill(`h-8 rounded-full bg-muted border-transparent px-3`, 왼쪽 아이콘 자리 16px — 로딩 중이면 스피너, 새 탭이면 `Search`, 그 외 `Globe`), 포커스 시 `bg-background` + `ring-2 ring-ring`. 주소창 오른쪽은 비운다.
  - 검색 선택 목록(주소창 바로 아래, 문서 흐름 안, 주소창과 같은 가로 위치·폭): `rounded-lg border bg-popover shadow-sm py-1`, 줄마다 `Search` 아이콘 + 문구(`text-sm`, 높이 32px), 강조 줄 `bg-accent text-accent-foreground`.
  - 새 탭 페이지(`bg-background`, 콘텐츠 영역 가운데, 위에서 ~22%): `h1` "새 탭" 은 `sr-only` 로 두고(접근성·e2e 이름 유지), 화면에는 큰 워드마크 "myBrowser"(`text-4xl font-semibold text-muted-foreground`, `aria-hidden`)를 둔다. 그 아래 pill 검색창(`max-w-xl w-full h-11 rounded-full bg-muted`, 왼쪽 `Search` 아이콘, 포커스 시 `bg-background ring`), 그 아래 버튼 2개(`variant="secondary"`, "네이버에서 검색"·"구글에서 검색"), 그 아래 바로가기 타일 2개(각 80px 폭 세로 배치: 48px 원형 `bg-muted` 안에 첫 글자 "N"/"G" + 아래 라벨 `text-xs`; 버튼 접근 이름은 라벨 "네이버"·"구글" 그대로 — 첫 글자는 `aria-hidden`).
  - 기존 사이드바 왼쪽 경계·"에이전트" 헤더는 그대로 두되, 사이드바 헤더 높이를 크롬 상단(36+40=76px)과 맞추지는 않는다(독립 열).
- **기본 메뉴 막대 숨김**: `src/main/app/menu.ts` — `createAppMenuTemplate({ platform, isDev })` 는 순수 함수로 `MenuItemConstructorOptions[]` 를 반환한다: darwin 이면 `{ role: 'appMenu' }`, 모두 `{ role: 'editMenu' }`, `isDev` 면 `{ label: '개발', submenu: [{ role: 'toggleDevTools' }] }`. **`reload`·`forceReload`·`close` role 과 `fileMenu`·`viewMenu`·`windowMenu` 는 넣지 않는다** — 기본 메뉴의 Ctrl+R(크롬 renderer 새로고침)·Ctrl+W(창 닫기)가 탭 단축키와 겹치지 않게. index.ts 에서 `Menu.setApplicationMenu(Menu.buildFromTemplate(createAppMenuTemplate({ platform: process.platform, isDev: env.mode === 'development' })))`, window.ts 의 `createMainWindow` 에서 `window.setMenuBarVisibility(false)` (메뉴는 남아 편집 단축키 동작, 막대만 숨김. `autoHideMenuBar` 는 Alt 로 막대가 튀어나와 Alt+←/→ 와 겹치므로 쓰지 않는다).
- **e2e 에서 탭 페이지 접근**: `app.windows()` 에서 URL 로 탭 Page 를 찾는다 (WebContentsView 도 CDP 페이지 타깃). `test:*` 채널은 이번에 만들지 않는다.
- **main 조립은 공유 파일 요청**: `src/main/index.ts`·`src/main/app/window.ts` 는 main-tabs 도우미가 고치지 않고 Task 4 의 「공유 파일 요청」 내용을 메인이 vibe-build 5단계(합치기)에서 반영한다. e2e 픽스처·시나리오는 vibe-build 7단계(app-check)에서 Task 7 「검증」대로 만든다.

### 영향받는 프로세스 / 파일
```
[기반]            package.json·pnpm-lock.yaml (sonner, clsx, tailwind-merge, class-variance-authority, lucide-react) · components.json
                  src/shared/ipc/{channels,api,tabs,shortcut}.ts · src/shared/utils/addressInput.ts (+ __tests__)
                  src/preload/index.ts · src/renderer/lib/{toast,utils}.ts · src/renderer/components/ui/{button,input}.tsx
                  src/renderer/main.tsx(<Toaster/>) · src/renderer/index.html(CSP img-src)
                  vitest.setup.ts(window.api.tabs·shortcut mock) · vitest.setup.main.ts(WebContentsView mock)
[main-tabs]       src/main/tabs/{tabType,urlPolicy,tabManager,electronTabView,shortcuts}.ts (+ __tests__)
                  src/main/ipc/emit.ts · src/main/ipc/handlers/tabs.ts (+ __tests__)
[main-tabs → 공유 파일 요청, 5단계 메인 반영]  src/main/app/{window,menu}.ts (+ __tests__) · src/main/index.ts
[renderer-chrome] src/renderer/hooks/{useTabs,useContentBounds,useShortcut}.ts (+ __tests__)
                  src/renderer/chrome/{TabBar,NavButtons,AddressBar,NewTabPage,BrowserChrome}/ (+ __tests__) · src/renderer/App.tsx
[7단계 app-check] e2e/fixtures.ts · e2e/fixtures/server.ts · e2e/fixtures/pages/{basic,second,popup-link}.html · e2e/browser-chrome.spec.ts · e2e/app-shell.spec.ts
```

### IPC 계약
스키마 파일 `src/shared/ipc/tabs.ts`, `src/shared/ipc/shortcut.ts`. 모든 요청 스키마는 `z.strictObject`. invoke 응답은 `TIpcResult` 봉투.

```ts
// 공통
TabIdSchema = z.string().min(1)
HttpUrlSchema = z.url({ protocol: /^https?$/ })            // SR-2
TabStateSchema = z.strictObject({
  id: TabIdSchema,
  url: z.string(),                // about:blank 포함 현재 URL
  title: z.string(),              // 새 탭이면 '새 탭', 제목 없으면 url
  faviconUrl: z.string().nullable(),
  isLoading: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  isNewTab: z.boolean(),
})
TabsSnapshotSchema = z.strictObject({ tabList: z.array(TabStateSchema), activeTabId: TabIdSchema.nullable() })
TabRequestSchema = z.strictObject({ tabId: TabIdSchema })
EmptyResponseSchema = z.null()

// 채널별
ListTabsResponseSchema = TabsSnapshotSchema
CreateTabRequestSchema = z.strictObject({ url: HttpUrlSchema.optional() })   // 없으면 새 탭
CreateTabResponseSchema = z.strictObject({ tabId: TabIdSchema })
NavigateRequestSchema = z.strictObject({ tabId: TabIdSchema, url: HttpUrlSchema })
SetBoundsRequestSchema = z.strictObject({ x, y, width, height })            // 각 z.number().int().min(0)
TabsChangedEventSchema = TabsSnapshotSchema
ShortcutPressedEventSchema = z.strictObject({ action: z.enum(['focusAddressBar', 'focusNewTabSearch']) })
```
추론 타입: `TTabState`, `TTabsSnapshot`, `TTabRequest`, `TListTabsResponse`, `TCreateTabRequest`, `TCreateTabResponse`, `TNavigateRequest`, `TSetBoundsRequest`, `TTabsChangedEvent`, `TShortcutPressedEvent`.

| 채널 (`IPC.tabs.*` / `IPC.shortcut.*`) | 방향 | 요청 스키마 | 응답/이벤트 스키마 |
|---|---|---|---|
| `tabs:list` | invoke | 없음 (`z.undefined()`) | `ListTabsResponseSchema` |
| `tabs:create` | invoke | `CreateTabRequestSchema` | `CreateTabResponseSchema` |
| `tabs:close` | invoke | `TabRequestSchema` | `EmptyResponseSchema` |
| `tabs:activate` | invoke | `TabRequestSchema` | `EmptyResponseSchema` |
| `tabs:navigate` | invoke | `NavigateRequestSchema` | `EmptyResponseSchema` |
| `tabs:goBack` | invoke | `TabRequestSchema` | `EmptyResponseSchema` |
| `tabs:goForward` | invoke | `TabRequestSchema` | `EmptyResponseSchema` |
| `tabs:reload` | invoke | `TabRequestSchema` | `EmptyResponseSchema` |
| `tabs:stop` | invoke | `TabRequestSchema` | `EmptyResponseSchema` |
| `tabs:setBounds` | invoke | `SetBoundsRequestSchema` | `EmptyResponseSchema` |
| `tabs:changed` | main→renderer event | — | `TabsChangedEventSchema` (보내기 전 parse) |
| `shortcut:pressed` | main→renderer event | — | `ShortcutPressedEventSchema` (보내기 전 parse) |

- 없는 `tabId` → `fail('NOT_FOUND', '탭을 찾을 수 없습니다')`. 스키마 실패 → `fail('INVALID_INPUT', '요청 형식이 올바르지 않습니다', issues)`.
- `IApi` 추가분:
  ```ts
  tabs: {
    list(): Promise<TIpcResult<TListTabsResponse>>
    create(req: TCreateTabRequest): Promise<TIpcResult<TCreateTabResponse>>
    close | activate | goBack | goForward | reload | stop (req: TTabRequest): Promise<TIpcResult<null>>
    navigate(req: TNavigateRequest): Promise<TIpcResult<null>>
    setBounds(req: TSetBoundsRequest): Promise<TIpcResult<null>>
    onChanged(cb: (e: TTabsChangedEvent) => void): () => void
  }
  shortcut: { onPressed(cb: (e: TShortcutPressedEvent) => void): () => void }
  ```
  `Object.keys(window.api)` = `['app', 'tabs', 'shortcut']`.

### 도구 계약
변경 없음.

### 데이터
변경 없음 (SQLite 미도입). 쿠키는 Chromium 이 `userData/Partitions/browsing` 에 저장.

### 열린 질문
없음.

---

## 3. 작업 순서 (Tasks)

> ⚠️ **게이트 규칙**: 각 Task 는 명시된 테스트와 검증이 모두 에러 0 이 될 때까지 수정 → 재실행, 전부 통과했을 때만 체크박스를 채우고 Task 단위로 커밋한 뒤 다음 Task 로 진행한다.
> **vibe-build 로 진행할 때는 `.claude/skills/COMMON.md` §2 가 위 규칙보다 우선한다.**
> 묶음 순서: `기반`(Task 1) → `main-tabs`(Task 2~4) ∥ `renderer-chrome`(Task 5~7). main 조립은 Task 4 의 공유 파일 요청(5단계), e2e 는 Task 7 검증(7단계).

- [x] **Task 1: IPC 계약·주소 해석·preload·UI 부품·toast·테스트 mock**
  - **묶음**: 기반
  - **작업**: shadcn 초기화 — `components.json`(alias `@/components`, `@/lib/utils`, Tailwind 4, css `src/renderer/styles/globals.css`), `src/renderer/lib/utils.ts` 의 `cn`, 의존성 `clsx`·`tailwind-merge`·`class-variance-authority`·`lucide-react`·`sonner`, `pnpm dlx shadcn@latest add button input` 으로 `src/renderer/components/ui/{button,input}.tsx` (CLI 가 globals.css 토큰을 덮어쓰면 기존 토큰을 유지하도록 되돌린다). `IPC` 에 `tabs`·`shortcut` 채널 추가, `src/shared/ipc/tabs.ts`·`shortcut.ts` 스키마·추론 타입(위 계약 그대로), `IApi` 확장. `src/shared/utils/addressInput.ts` — `resolveAddressInput`, `buildSearchUrl`, `TSearchEngine = 'naver' | 'google'`, `SEARCH_ENGINE_LIST`(`[{ engine: 'naver', label: '네이버' }, { engine: 'google', label: '구글' }]`). preload 에 `tabs.*`·`shortcut.onPressed`(`subscribe` 헬퍼, 해제 함수 반환). `lib/toast.ts`(sonner 래퍼 `toast.error/success`), `main.tsx` 에 `<Toaster/>`. `index.html` CSP `img-src 'self' data: http: https:`. `vitest.setup.ts` 의 `window.api` mock 에 `tabs.*`(vi.fn, `onChanged` 는 해제 vi.fn 반환)·`shortcut.onPressed` 추가. `vitest.setup.main.ts` 의 electron mock 에 `WebContentsView: vi.fn()` 추가 — 인스턴스는 `{ setBounds, setVisible, webContents: { on, setWindowOpenHandler, loadURL, getURL, getTitle, isLoading, stop, reload, focus, close, isDestroyed, navigationHistory: { canGoBack, canGoForward, goBack, goForward } } }` 이고 각 항목은 호출 인자를 기록하는 `vi.fn()`. `session: { fromPartition: vi.fn(() => ({ cookies: { flushStore: vi.fn() } })) }` 도 추가.
  - **파일**: `package.json`, `pnpm-lock.yaml`, `components.json`, `src/shared/ipc/{channels,api,tabs,shortcut}.ts`, `src/shared/utils/addressInput.ts`, `src/preload/index.ts`, `src/renderer/lib/{toast,utils}.ts`, `src/renderer/components/ui/{button,input}.tsx`, `src/renderer/{main.tsx,index.html}`, `vitest.setup.ts`, `vitest.setup.main.ts`
  - **테스트**: `src/shared/ipc/__tests__/tabs.test.ts` — 각 요청 스키마 유효/무효(빈 tabId, `file:///`·`javascript:` url 거부, 음수·소수 bounds 거부, 추가 키 거부), TabsSnapshot 유효/무효 · `src/shared/ipc/__tests__/shortcut.test.ts` — action enum · `src/shared/utils/__tests__/addressInput.test.ts` — `https://a.com/x` 그대로, `naver.com`→`https://naver.com/`, `example.co.kr/path?q=1`, `localhost:3000`→`http://`, `127.0.0.1:8080/a`→`http://`, `강남 맛집`·`hello`·`a.b c`·`javascript:alert(1)`·`file:///etc/passwd` → search, 공백만 → null, `buildSearchUrl('naver','강남 맛집')` 인코딩, google · `src/renderer/lib/__tests__/toast.test.ts` — sonner 위임 · `src/renderer/lib/__tests__/utils.test.ts` — `cn` 병합(충돌 클래스 뒤쪽 우선)
  - **실행**: `pnpm test src/shared src/renderer/lib`
  - **검증**: `pnpm type-check` + 단위 테스트 + `pnpm lint`
  - **통과 기준**: 테스트 + 검증 통과. 기존 테스트(spec 001) 유지
  - **커밋**: `feat: 탭 IPC 계약과 주소 해석·UI 부품 추가 (spec 002 Task 1)`

- [x] **Task 2: TabManager + URL 정책**
  - **묶음**: main-tabs
  - **작업**: `src/main/tabs/tabType.ts` — `ITabView`(`load(url)`, `goBack()`, `goForward()`, `reload()`, `stop()`, `getState(): { url, title, faviconUrl, isLoading, canGoBack, canGoForward }`, `onStateChanged(cb)`, `onOpenWindow(cb: (url) => void)`, `setBounds(rect)`, `setVisible(bool)`, `focus()`, `destroy()`, `nativeView: unknown`), `ITabHost`(`addChildView(view)`, `removeChildView(view)`), `TTabViewFactory = () => ITabView`. `urlPolicy.ts` — `isAllowedTabUrl(url)`(http·https·`about:blank`). `tabManager.ts` — `TabManager({ host, createView, onChanged, createId? })`: `createTab(url?)`(활성화, url 없으면 `about:blank`), `closeTab(id)`(마지막이면 새 탭 생성, 활성 탭이면 오른쪽→왼쪽 이웃 활성), `activateTab(id)`, `cycleTab(+1|-1)`(순환), `navigate(id,url)`, `goBack/goForward/reload/stop(id)`, `setBounds(rect)`(활성 View 에만 적용, 이후 활성 전환에도 재적용), `getActiveTabId()`, `getSnapshot(): TTabsSnapshot`(isNewTab·제목 '새 탭' 계산), `hasTab(id)`. View 상태 변경·생성·닫기·전환마다 `onChanged(snapshot)`. 새 탭(isNewTab) View 는 `setVisible(false)`. `onOpenWindow` url 이 허용이면 `createTab(url)`. id 기본 `tab-{n}`.
  - **파일**: `src/main/tabs/{tabType,urlPolicy,tabManager}.ts`
  - **테스트**: `src/main/tabs/__tests__/urlPolicy.test.ts` — http·https·about:blank 허용, file·javascript·data·chrome 거부 · `src/main/tabs/__tests__/tabManager.test.ts`(가짜 ITabView·ITabHost) — 생성 시 활성·host 에 추가·onChanged, 새 탭 isNewTab·숨김·제목 '새 탭', 전환 시 이전 View 숨김·새 View 표시+bounds, 닫기 이웃 활성·host 제거·destroy, 마지막 탭 닫으면 새 탭 1개, cycleTab 순환(양방향), 없는 id → `hasTab` false, View 상태 변경(about:blank → https) 시 isNewTab false·표시, onOpenWindow 허용 url → 새 활성 탭 / `file:` → 무시
  - **실행**: `pnpm test src/main/tabs`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 탭 관리자와 탭 URL 정책 추가 (spec 002 Task 2)`

- [x] **Task 3: WebContentsView 어댑터 + 단축키 판정·실행**
  - **묶음**: main-tabs
  - **작업**: `electronTabView.ts` — `createTabViewOptions()`(webPreferences: partition `persist:browsing`, contextIsolation·sandbox true, nodeIntegration false, preload 없음 — SR-1), `createElectronTabView({ onInput })`: `new WebContentsView(createTabViewOptions())`, `did-start-loading`·`did-stop-loading`·`did-navigate`·`did-navigate-in-page`·`page-title-updated`·`page-favicon-updated` → `onStateChanged`, `setWindowOpenHandler(({ url }) => { 허용이면 onOpenWindow(url); return { action: 'deny' } })`, `will-navigate` 정책 위반 `preventDefault`, `before-input-event` → `onInput(event, input)`, 상태는 `webContents.navigationHistory.canGoBack()` 등에서 읽기. `shortcuts.ts` — `toShortcutAction(input, platform)` → `'newTab' | 'closeTab' | 'focusAddressBar' | 'reload' | 'goBack' | 'goForward' | 'nextTab' | 'prevTab' | null` (keyDown 만, darwin 은 meta, 그 외 control; 추가 수식키가 섞이면 null — 단 Ctrl+Shift+Tab 은 prevTab), `createShortcutRunner({ tabManager, emitShortcut, focusChrome })` → `(action) => void`(newTab 은 `createTab()` 후 `focusChrome()`+`emitShortcut('focusNewTabSearch')`, focusAddressBar 는 `focusChrome()`+`emitShortcut('focusAddressBar')`, 나머지는 활성 탭 대상), `createShortcutInputHandler(runner, platform)` → `(event, input) => void`(액션이 있으면 `event.preventDefault()` 후 `runner(action)`), `attachShortcuts(webContentsLike, runner, platform)`(before-input-event 에 위 핸들러를 붙인다 — 내부에서 `createShortcutInputHandler` 사용). 탭 View 는 `createElectronTabView({ onInput: createShortcutInputHandler(…) })` 로, 메인 창은 `attachShortcuts` 로 — 판정 경로는 하나. 메뉴 accelerator 는 등록하지 않는다.
  - **파일**: `src/main/tabs/{electronTabView,shortcuts}.ts`
  - **테스트**: `src/main/tabs/__tests__/electronTabView.test.ts`(vitest.setup.main.ts 의 mock WebContentsView — webContents `on`·`setWindowOpenHandler` 를 기록) — `createTabViewOptions()` 의 partition·contextIsolation·nodeIntegration·sandbox·preload 없음; windowOpenHandler 가 https·`file:` 모두 `{ action: 'deny' }` 반환하고 https 일 때만 onOpenWindow 호출; will-navigate 가 `file:`·`javascript:`·`data:` 에서는 preventDefault 호출, https·`about:blank` 에서는 미호출; 로딩 이벤트 시 onStateChanged 호출 · `src/main/tabs/__tests__/shortcuts.test.ts` — 키 조합별 액션(Ctrl+T/W/L/R, Alt+Left/Right, Ctrl+Tab, Ctrl+Shift+Tab, darwin Cmd, darwin 에서 Ctrl+T null, keyUp 무시, 일반 키 null, Ctrl+Alt+T null), runner 가 TabManager 가짜 메서드·focusChrome·emit 을 부르는지, `createShortcutInputHandler` 가 해당 키에만 preventDefault + runner 호출, attachShortcuts 가 before-input-event 에 핸들러를 붙이는지
  - **실행**: `pnpm test src/main/tabs`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 탭 WebContentsView 어댑터와 단축키 추가 (spec 002 Task 3)`

- [x] **Task 4: tabs IPC 핸들러 + 이벤트 발신**
  - **묶음**: main-tabs
  - **작업**: `src/main/ipc/emit.ts` — `createSidebarEmitter(getWebContents: () => IWebContentsLike | null)` → `emitToSidebar(channel, schema, payload)`(schema.parse 후 `send`, 대상 없거나 destroyed 면 무시). `src/main/ipc/handlers/tabs.ts` — `createTabsHandlers(tabManager)`: 계약의 invoke 10채널, 각 핸들러 safeParse → `hasTab` 확인(NOT_FOUND) → TabManager 호출 → `ok`.
  - **파일**: `src/main/ipc/emit.ts`, `src/main/ipc/handlers/tabs.ts`
  - **공유 파일 요청** (워크트리 방식: 도우미는 고치지 않고 메인이 5단계 합치기 뒤 반영, 커밋 `feat: 탭 관리자를 메인 창에 연결 (spec 002)`. **직접 방식(vibe-build 직접·spec-run 단독)이면 아래 내용을 Task 4 안에서 그대로 반영하고 Task 4 커밋에 포함한다**):
    - `src/main/app/window.ts`: `createMainWindow` 는 그대로 창을 반환(메인 창 webContents 의 `setWindowOpenHandler` deny 유지). 변경 없으면 그대로 둔다.
    - `src/main/index.ts` (ready 후, 조립만): `const emitToSidebar = createSidebarEmitter(() => window.webContents)`; `let runner`; `const tabManager = new TabManager({ host: window.contentView, createView: () => createElectronTabView({ onInput: (e, i) => shortcutInput(e, i) }), onChanged: (s) => emitToSidebar(IPC.tabs.changed, TabsChangedEventSchema, s) })`; `runner = createShortcutRunner({ tabManager, emitShortcut: (action) => emitToSidebar(IPC.shortcut.pressed, ShortcutPressedEventSchema, { action }), focusChrome: () => window.webContents.focus() })`; `const shortcutInput = createShortcutInputHandler(runner, process.platform)`(탭 View 의 `onInput` 이 호출 — runner 생성 뒤에 첫 탭을 만든다), 메인 창 webContents 에는 `attachShortcuts(window.webContents, runner, process.platform)`; `registerIpc(ipcMain, { ...createAppHandlers(…), ...createTabsHandlers(tabManager) })`; 첫 `tabManager.createTab()`; `app.on('before-quit')` 에서 한 번만 `preventDefault` → `session.fromPartition('persist:browsing').cookies.flushStore()` await → `app.quit()`.
    - `src/main/app/menu.ts`(+ `src/main/app/__tests__/menu.test.ts`): 「기본 메뉴 막대 숨김」 결정대로 `createAppMenuTemplate`. 테스트 — linux·win32 에는 `editMenu` 만(isDev false), darwin 은 `appMenu`+`editMenu`, isDev 면 `toggleDevTools` 포함, 어떤 경우에도 템플릿 전체(submenu 포함)에 `reload`·`forceReload`·`close` role 과 `fileMenu`·`viewMenu`·`windowMenu` 없음. index.ts 에 `Menu.setApplicationMenu(…)`, window.ts `createMainWindow` 에 `window.setMenuBarVisibility(false)`.
    - `vitest.setup.main.ts` 에 mock 이 더 필요하면 같은 방식으로 요청.
  - **테스트**: `src/main/ipc/__tests__/tabs.test.ts` — 채널별 성공 봉투·TabManager 호출 인자, 잘못된 입력 INVALID_INPUT(`file:` url 포함), 없는 탭 NOT_FOUND, `tabs:create` url 없음/있음 · `src/main/ipc/__tests__/emit.test.ts` — parse 후 send, 스키마 위반 throw, 대상 없음·destroyed 무시
  - **실행**: `pnpm test src/main/ipc`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 탭 IPC 핸들러와 이벤트 발신 추가 (spec 002 Task 4)`

- [x] **Task 5: renderer 훅 — useTabs·useContentBounds·useShortcut**
  - **묶음**: renderer-chrome
  - **작업**: `hooks/useTabs.ts` — 마운트 시 `tabs.list`, `tabs.onChanged` 구독(cleanup 해제) → `{ tabList, activeTab, listError: { code, message } | null, create, close, activate, navigate, goBack, goForward, reload, stop }` (액션은 `window.api.tabs.*` 의 `Promise<TIpcResult>` 를 그대로 반환, toast 안 함). `hooks/useContentBounds.ts` — ref 를 받아 `ResizeObserver`·`window resize` 로 `getBoundingClientRect` 를 반올림해 `tabs.setBounds`(같은 값이면 생략). `hooks/useShortcut.ts` — `shortcut.onPressed(e => 콜백(e.action))` 구독, 해제.
  - **파일**: `src/renderer/hooks/{useTabs,useContentBounds,useShortcut}.ts`
  - **테스트**: `src/renderer/hooks/__tests__/useTabs.test.ts` — 초기 목록, onChanged 반영, 언마운트 시 해제, list 실패 시 빈 목록 + `listError` · `useContentBounds.test.ts` — rect 전송·중복 생략(ResizeObserver mock) · `useShortcut.test.ts` — 이벤트 → 콜백, 해제
  - **실행**: `pnpm test src/renderer/hooks`
  - **검증**: `pnpm type-check` + 단위 테스트
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 탭 상태·콘텐츠 영역·단축키 훅 추가 (spec 002 Task 5)`

- [x] **Task 6: TabBar·NavButtons·AddressBar 컴포넌트**
  - **묶음**: renderer-chrome
  - **작업**: `.claude/skills/desktop/design` 과 이 spec 의 「크롬 시각 규칙」을 따른다 (단, 단축키는 이 spec 의 설계 변경대로 main 이 처리 — renderer 는 키 등록 안 함). shadcn `Button`·`Input`, `lucide-react` 아이콘, `cn()`. 모든 `on*` 콜백은 `Promise<TIpcResult<…>>` 를 반환하고 컴포넌트가 `ok:false` 면 `toast.error(error.message)`. `chrome/TabBar` — `role="tablist"`, 탭마다 `role="tab"`(`aria-selected`, 이름 = 제목만), 파비콘 `<img alt="">`(onError → 기본 아이콘), 로딩 스피너(`aria-label="로딩 중"`), 닫기 버튼은 `role="tab"` 의 **형제**(`aria-label="{제목} 탭 닫기"`), ＋ 버튼(`aria-label="새 탭 열기"`). `chrome/NavButtons` — `aria-label` "뒤로"·"앞으로"·"새로고침"/"중지", disabled 처리. `chrome/AddressBar` — `role="combobox"` 입력(`aria-label="주소창"`, placeholder "검색어 또는 주소 입력", `aria-expanded`), 포커스 시 전체 선택, 활성 탭 URL 동기화(편집 중이 아닐 때, 새 탭이면 빈 값), `resolveAddressInput` 결과가 search 면 `role="listbox"` 두 `option`("'{q}' — 네이버에서 검색" / "'{q}' — 구글에서 검색", `aria-selected`) 을 입력 아래 문서 흐름에 표시, ↑/↓·Enter·클릭·Esc(FR-3), url 이면 Enter 로 `onNavigate(url)`. `focusSignal`(숫자 prop) 이 바뀌면 포커스+전체 선택.
  - **파일**: `src/renderer/chrome/{TabBar,NavButtons,AddressBar}/index.tsx` (+ 필요 시 같은 폴더 하위 부품)
  - **테스트**: `src/renderer/chrome/TabBar/__tests__/TabBar.test.tsx` — 탭 목록(`getByRole('tab', { name: '새 탭' })` exact)·선택 표시·클릭 activate·닫기·＋·로딩 표시·파비콘 실패 시 기본 아이콘·실패 봉투 toast · `NavButtons/__tests__/NavButtons.test.tsx` — disabled·로딩 시 중지·클릭 콜백·실패 봉투 toast · `AddressBar/__tests__/AddressBar.test.tsx` — URL 표시, `naver.com` Enter → `https://naver.com/`, `강남 맛집` 입력 시 두 옵션, Enter → 네이버 검색 URL, ↓+Enter → 구글, 클릭 선택, Esc 되돌림, `javascript:alert(1)` → 검색 옵션, focusSignal 포커스, 실패 봉투 toast (`sonner` 래퍼 `@/lib/toast` 를 vi.mock)
  - **실행**: `pnpm test src/renderer/chrome`
  - **검증**: `pnpm type-check` + 단위 테스트. 실제 앱 흐름은 Task 7 검증(app-check)
  - **통과 기준**: 테스트 + 검증 통과
  - **커밋**: `feat: 탭 바·탐색 버튼·주소창 컴포넌트 추가 (spec 002 Task 6)`

- [x] **Task 7: NewTabPage + BrowserChrome 조립 + App 레이아웃**
  - **묶음**: renderer-chrome
  - **작업**: 「크롬 시각 규칙」의 새 탭 페이지·툴바 배치를 따른다. `chrome/NewTabPage` — 제목 `h1` "새 탭"(`sr-only`), 검색 입력(`aria-label="새 탭 검색"`), 버튼 "네이버에서 검색"·"구글에서 검색"(빈 입력이면 아무 것도 안 함), 입력에서 Enter = 네이버, 바로가기 버튼 "네이버"(`https://www.naver.com/`)·"구글"(`https://www.google.com/`), `focusSignal` 로 검색창 포커스, `onNavigate(url)` 은 `Promise<TIpcResult>` → 실패 toast. `chrome/BrowserChrome` — `useTabs`·`useShortcut`·`useContentBounds` 를 쓰는 화면 조립: 헤더(TabBar + NavButtons + AddressBar) + 콘텐츠 영역 div(`aria-label="탭 콘텐츠"`, bounds ref) — 활성 탭 `isNewTab` 이면 그 안에 NewTabPage. `listError` 가 있으면 `toast.error(message)`. 단축키 `focusAddressBar`→AddressBar focusSignal, `focusNewTabSearch`→NewTabPage focusSignal. `App.tsx` — 기존 브라우징 영역 헤더·자리 문구를 `<BrowserChrome/>` 로 교체 (사이드바 유지).
  - **파일**: `src/renderer/chrome/{NewTabPage,BrowserChrome}/index.tsx`, `src/renderer/App.tsx`
  - **테스트**: `src/renderer/chrome/NewTabPage/__tests__/NewTabPage.test.tsx` — 버튼별 검색 URL, Enter 네이버, 빈 입력 무시, 바로가기 URL(`getByRole('button', { name: '네이버', exact: true })`), focusSignal · `src/renderer/chrome/BrowserChrome/__tests__/BrowserChrome.test.tsx` — 새 탭이면 NewTabPage 표시/아니면 숨김, 주소창 이동이 활성 탭 id 로 `tabs.navigate`, shortcut 이벤트 → 주소창 포커스, `listError` → toast · `src/renderer/__tests__/App.test.tsx` — 갱신(사이드바 "에이전트" 제목 + tablist 존재)
  - **실행**: `pnpm test src/renderer`
  - **검증**: `desktop/app-check` (vibe-build 7단계, 5단계 합치기·공유 파일 반영 후 메인이 수행) —
    - 만들 것: `e2e/fixtures/server.ts`(node http, 127.0.0.1:0, `pages/*.html` 제공, `/favicon.ico` 1×1 png, `/set-cookie` → `Set-Cookie: e2e_login=1; Max-Age=3600; Path=/` 후 302 `/cookie`, `/cookie` → 받은 Cookie 헤더를 본문에 출력), `e2e/fixtures/pages/{basic,second,popup-link}.html`(고유 제목, `target=_blank` 링크, `window.open` 버튼), `e2e/fixtures.ts` 확장(워커 스코프 `fixtureServer` + `fixtureUrl(name)`, 같은 userData 로 재실행하는 `launchApp({ userDataDir })`, `findTabPage(app, urlPart)`), `e2e/app-shell.spec.ts` 갱신(`apiKeyList` 기대값 `['app','tabs','shortcut']`; heading '새 탭' 은 NewTabPage h1 로 유지).
    - `e2e/browser-chrome.spec.ts` 흐름: ① 시작 시 `getByRole('tab')` count 1, 탭 "새 탭" + 시작 화면 heading ② 주소창에 픽스처 URL Enter → 탭 제목 = 픽스처 제목, 주소창 = URL, 시작 화면 사라짐 ③ 두 번째 픽스처 이동 → 뒤로 → 첫 페이지, 앞으로 → 두 번째 ④ ＋ 로 새 탭 → count 2, 첫 탭 클릭 전환 → 주소창 갱신, 닫기 → count 1 ⑤ `강남 맛집` 입력 → 두 옵션 표시, Esc → 닫힘(탭 URL 변화 없음) ⑥ `target=_blank` 링크 클릭 → count +1, 새 활성 탭에 대상 픽스처, `app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)` === 1 ⑦ 탭 페이지 포커스 상태에서 Ctrl+T → count +1, Ctrl+L → 주소창 포커스, Ctrl+W → count −1 ⑧ 프로필 영속: 같은 userData 로 앱 실행 → `/set-cookie` 이동 → 종료 → 재실행 → `/cookie` 이동 → 본문에 `e2e_login=1`, 재실행 직후 탭 count 1 "새 탭". 선택자는 역할·이름, 버튼·바로가기는 `exact: true`.
    - 추가 확인: ⑨ `app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMenuBarVisible())` === false, `app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map(i => i.role))` 에 `editmenu` 포함·`viewmenu`/`windowmenu`/`filemenu` 없음 ⑩ 시각 확인용 스크린샷 `test-results/browser-chrome.png`(새 탭 + 픽스처 탭 2개 상태) 를 남긴다 (비교 assert 없음).
    - 통과 = 콘솔·main 에러 0 + `make e2e` 전부 통과(app-shell 포함)
  - **통과 기준**: 단위 테스트 + `make check` + `make e2e` 통과
  - **커밋**: `feat: 새 탭 페이지와 브라우저 크롬 조립 (spec 002 Task 7)`

---

## 4. 진행 로그

| 날짜 | Task | 테스트 결과 | 커밋 | 비고 |
|---|---|---|---|---|
| 2026-11-05 | 1 | 54 단위 통과 | 7c5c987 | 기반 — shadcn CLI 경로 오류 수동 보정, radix-ui 추가 |
| 2026-11-05 | 2 | 27 단위 통과 | 26bc2b4 | main-tabs |
| 2026-11-05 | 3 | 41 단위 통과 | 89d29aa | main-tabs |
| 2026-11-05 | 4 | 27 단위 통과 | 5606e69 | main-tabs — 공유 파일 요청은 6e8d4d4 로 메인 반영 (+ 875262f 타입 계약 테스트) |
| 2026-11-05 | 5 | 16 단위 통과 | 952135c | renderer-chrome |
| 2026-11-05 | 6 | 30 단위 통과 | 8d6734c | renderer-chrome — globals.css 토큰 추가 |
| 2026-11-05 | 7 | 19 단위 통과 · e2e 12/12 (xvfb) | 8203e38 | renderer-chrome · e2e/app-check 는 메인 7단계 |
