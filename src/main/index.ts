// 앱 진입점 — 조립만 한다. 로직은 각 모듈에 (.claude/rules/architecture.md §2)
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

import { app, type BrowserWindow, ipcMain, Menu, Notification, safeStorage, screen, session } from 'electron';

import { DEVICE_NAME_MAX_LENGTH } from '@shared/account/gateway';
import { FakeScenarioSchema, type TFakeScenario } from '@shared/agent/fakeScenario';
import { AgentEventSchema } from '@shared/ipc/agent';
import { AccountStatusSchema } from '@shared/ipc/account';
import { IPC } from '@shared/ipc/channels';
import { ShortcutPressedEventSchema } from '@shared/ipc/shortcut';
import { FindUpdatedEventSchema, TabsChangedEventSchema } from '@shared/ipc/tabs';
import { WindowStateSchema, type TWindowState } from '@shared/ipc/window';
import type { ISkillStore } from '@shared/ipc/skills';
import type { TAgentEvent } from '@shared/ipc/agent';

import { createAccountService, createGatewayClient, sleepWithSignal, type IAccountService } from './account';
import { createModelProfile, type IModelProfile } from './agent/profiles';
import { createAgentService } from './agent/service';
import { createAgentTabActivity } from './app/agentTabActivity';
import { getCdpSwitches, removeStaleActivePort } from './app/cdp';
import { createCredentialStore } from './app/credentialStore';
import { createAppMenuTemplate } from './app/menu';
import { createRunNotifier, type IRunNotification } from './app/runNotifier';
import {
  createMainWindow,
  createNativeFrame,
  createWindowControls,
  hasRoundedCorners,
  type IWindowControls,
  watchFullScreen,
  watchMaximizeEvents,
  WINDOW_CORNER_RADIUS,
  WINDOW_MIN_SIZE,
} from './app/window';
import { createBoundsMaximizer } from './app/windowMaximize';
import { createWindowPointerSession, type TPointerFrame } from './app/windowPointer';
import { createCdpConnection } from './browser/cdp';
import { createBrowserDriver } from './browser/driver';
import { resolveCdpEndpoint } from './browser/endpoint';
import type { ICdpConnection, ITabsPort } from './browser/types';
import { loadDotEnv, readEnv } from './env';
import { createSidebarEmitter } from './ipc/emit';
import { createAccountHandlers } from './ipc/handlers/account';
import { createAgentHandlers } from './ipc/handlers/agent';
import { createAppHandlers } from './ipc/handlers/app';
import { createBookmarksHandlers } from './ipc/handlers/bookmarks';
import { createHistoryHandlers } from './ipc/handlers/history';
import { createRunsHandlers } from './ipc/handlers/runs';
import { createSkillsHandlers } from './ipc/handlers/skills';
import { createWindowHandlers } from './ipc/handlers/window';
import { createTabsHandlers } from './ipc/handlers/tabs';
import { registerIpc } from './ipc/registry';
import { log } from './log';
import { openDatabase } from './store/db';
import { createBookmarkRepo } from './store/repos/bookmarks';
import { createHistoryRepo } from './store/repos/history';
import { createRunHistoryRepo } from './store/repos/runHistory';
import { createSkillRepo } from './store/repos/skills';
import { createRunRepo } from './store/repos/runs';
import { createElectronTabView } from './tabs/electronTabView';
import { attachShortcuts, createShortcutInputHandler, createShortcutRunner } from './tabs/shortcuts';
import { TabManager } from './tabs/tabManager';

const BROWSING_PARTITION = 'persist:browsing';
const MAX_TOOL_CALLS = 60;
const DATABASE_FILE_NAME = 'mybrowser.db';
const FAKE_SCENARIO_DIR = 'e2e/fixtures/model';
const DEFAULT_FAKE_SCENARIO = 'default';
const CREDENTIAL_FILE_NAME = 'credentials.bin';
const DEFAULT_DEVICE_NAME = 'myBrowser';

/** 게이트웨이 기본 주소 — electron.vite.config.ts 의 define 이 빌드 시 넣는다 (spec 005 FR-3) */
declare const __GATEWAY_URL__: string;

loadDotEnv({ path: join(app.getAppPath(), '.env'), isPackaged: app.isPackaged });
const env = readEnv(process.env, { isPackaged: app.isPackaged, defaultGatewayUrl: __GATEWAY_URL__ });

// ready 전에만 적용되는 설정 — 프로필 경로, 지난 실행의 CDP 포트 파일 정리, 원격 디버깅 스위치
if (env.userDataDir) app.setPath('userData', env.userDataDir);
removeStaleActivePort(app.getPath('userData'));
// test 모드는 safeStorage 백엔드를 basic 으로 고정해 e2e 를 결정적으로 만든다 (spec 005 SR-1)
if (env.mode === 'test') app.commandLine.appendSwitch('password-store', 'basic');
for (const [name, value] of getCdpSwitches({ port: env.cdpPort })) {
  app.commandLine.appendSwitch(name, value);
}

process.on('uncaughtException', (error) => log.error('process', 'uncaughtException', error));
process.on('unhandledRejection', (reason) => log.error('process', 'unhandledRejection', reason));

/** 메인 창 + 탭 관리자 + 단축키 + IPC 를 연결한다 (창은 하나 — 닫히면 앱 종료) */
function startBrowser(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(createAppMenuTemplate({ platform: process.platform, isDev: env.mode === 'development' })),
  );
  const window = createMainWindow(env);
  // 종료 중에 탭 상태 변경(로드 실패 등)이 늦게 오면 창이 이미 파괴돼 webContents 접근이 throw 한다 (spec 008)
  const emitToSidebar = createSidebarEmitter(() => (window.isDestroyed() ? null : window.webContents));
  let shortcutInput: ReturnType<typeof createShortcutInputHandler> = () => {};
  const runDatabase = openDatabase(join(app.getPath('userData'), DATABASE_FILE_NAME));
  database = runDatabase;
  const storeDeps = { now: () => new Date(), createId: randomUUID };
  const historyRepo = createHistoryRepo(runDatabase, storeDeps);
  const tabManager = new TabManager({
    host: window.contentView,
    createView: () => createElectronTabView({ onInput: (event, input) => shortcutInput(event, input) }),
    onChanged: (snapshot) => emitToSidebar(IPC.tabs.changed, TabsChangedEventSchema, snapshot),
    // 방문 기록은 url·제목만 (spec 021 SR-2) — 에이전트가 연 탭도 같이 남는다.
    // 탭 View 는 창보다 늦게 사라져 종료 뒤(DB 닫힘)에도 로드 완료가 올 수 있다 — 그때는 남기지 않는다
    onPageLoaded: ({ url, title }) => {
      if (database) historyRepo.record({ url, title });
    },
    onFindUpdated: (event) => emitToSidebar(IPC.tabs.findUpdated, FindUpdatedEventSchema, event),
  });
  const runner = createShortcutRunner({
    tabManager,
    emitShortcut: (action) => emitToSidebar(IPC.shortcut.pressed, ShortcutPressedEventSchema, { action }),
    focusChrome: () => window.webContents.focus(),
  });
  const windowFrame = attachWindowFrame(window, tabManager, (state) =>
    emitToSidebar(IPC.window.stateChanged, WindowStateSchema, state),
  );
  shortcutInput = createShortcutInputHandler(runner, process.platform);
  attachShortcuts(window.webContents, runner, process.platform);
  accountService = createAccountRuntime(tabManager, emitToSidebar);
  // 핸들러와 에이전트가 같은 저장소를 쓴다 — 저장 직후 다음 run 에 반영 (spec 013)
  const skillRepo = createSkillRepo(runDatabase, storeDeps);
  agentService = createAgentRuntime({
    tabManager,
    emitToSidebar,
    account: accountService,
    runDatabase,
    skills: skillRepo,
    tabActivity: createAgentTabActivity({ setActivity: (id, activity) => tabManager.setAgentActivity(id, activity) }),
    notifier: createRunNotifier({
      isWindowFocused: () => window.isDestroyed() || window.isFocused(),
      show: showOsNotification,
      focusWindow: () => focusMainWindow(window),
    }),
  });
  registerIpc(ipcMain, {
    ...createAppHandlers({ getName: () => app.getName(), getVersion: () => app.getVersion(), mode: env.mode }),
    ...createTabsHandlers(tabManager),
    ...createAgentHandlers(agentService),
    ...createAccountHandlers(accountService),
    ...createWindowHandlers(
      windowFrame.controls,
      createWindowPointerSession(window, windowFrame.frame, WINDOW_MIN_SIZE),
    ),
    ...createRunsHandlers(createRunHistoryRepo(runDatabase)),
    ...createSkillsHandlers(skillRepo),
    ...createBookmarksHandlers(createBookmarkRepo(runDatabase, storeDeps)),
    ...createHistoryHandlers(historyRepo),
  });
  tabManager.createTab();
}

/**
 * 가짜 모델 모드의 시나리오 — {폴더}/{이름}.json, 파일이 없으면 빈 시나리오.
 * 폴더는 env.fakeScenarioDir(test 모드, 패키징 e2e) 우선, 없으면 e2e/fixtures/model
 */
function readFakeScenario(): TFakeScenario | undefined {
  const dir = env.fakeScenarioDir ?? join(app.getAppPath(), FAKE_SCENARIO_DIR);
  const path = join(dir, `${env.fakeScenario ?? DEFAULT_FAKE_SCENARIO}.json`);
  if (!existsSync(path)) return undefined;
  return FakeScenarioSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

let database: ReturnType<typeof openDatabase> | null = null;
let agentService: ReturnType<typeof createAgentService> | null = null;
let accountService: IAccountService | null = null;
let cdpConnection: Promise<ICdpConnection> | null = null;

/** CDP 연결은 첫 run 에서 1회 만들고 앱 수명 동안 공유한다 — 실패하면 다음 run 에서 다시 시도 */
function getCdp(): Promise<ICdpConnection> {
  cdpConnection ??= resolveCdpEndpoint({ port: env.cdpPort, userDataDir: app.getPath('userData') })
    .then((endpoint) => createCdpConnection({ endpoint }))
    .catch((error: unknown) => {
      cdpConnection = null;
      throw error;
    });
  return cdpConnection;
}

/** 구독 계정 서비스 조립 — 기기 토큰 저장소(safeStorage)·게이트웨이 클라이언트·구매 탭 (spec 005 FR-4) */
function createAccountRuntime(tabManager: TabManager, emitToSidebar: ReturnType<typeof createSidebarEmitter>) {
  // test 모드(password-store=basic)에서만 basic_text 백엔드로도 암호화 API 를 쓰게 한다 — production 은 그대로 (SR-1)
  if (env.mode === 'test' && process.platform === 'linux') safeStorage.setUsePlainTextEncryption(true);
  return createAccountService({
    profileKind: env.profileKind,
    gateway: createGatewayClient({ baseUrl: env.gatewayUrl }),
    store: createCredentialStore({
      filePath: join(app.getPath('userData'), CREDENTIAL_FILE_NAME),
      safeStorage,
      allowBasicText: env.mode === 'test',
    }),
    openTab: (url) => tabManager.createTab(url),
    emit: (status) => emitToSidebar(IPC.account.changed, AccountStatusSchema, status),
    now: Date.now,
    sleep: sleepWithSignal,
    deviceName: hostname().slice(0, DEVICE_NAME_MAX_LENGTH) || DEFAULT_DEVICE_NAME,
    log,
  });
}

/** 모델 프로필(전략) — env 의 profileKind 로 1번 고른다. 키·토큰은 프로필의 createClient 안에서만 쓴다 (spec 007) */
function createRuntimeProfile(account: IAccountService): IModelProfile {
  const { profileKind, model } = env;
  if (profileKind === 'prod') {
    return createModelProfile({
      kind: 'prod',
      gatewayUrl: env.gatewayUrl,
      getDeviceToken: () => account.getDeviceToken(),
      model,
    });
  }
  if (profileKind === 'dev') {
    return createModelProfile({ kind: 'dev', apiKey: env.anthropicApiKey, baseUrl: getDevBaseUrl(), model });
  }
  return createModelProfile({ kind: 'fake', model, readScenario: readFakeScenario });
}

/** readEnv 가 dev 면 anthropicBaseUrl 을 보장한다 (없으면 시작 시점에 실패 — spec 007 FR-3) */
function getDevBaseUrl(): string {
  if (!env.anthropicBaseUrl) throw new Error('dev 프로필에 ANTHROPIC_BASE_URL 이 없습니다');
  return env.anthropicBaseUrl;
}

/**
 * 창 상태 → renderer 이벤트 + 탭 View 모서리 (spec 014). Linux 둥근 창이면 탭 View 를 같은 반지름으로 깎고 최대화 시 직각.
 * Linux 최대화는 앱 최대화기가 작업 영역에 직접 배치하고 상태를 알린다 (spec 017) — 그 외는 창 관리자 이벤트.
 * 렌더러가 늦게 붙어도 맞도록 첫 로드 때 현재 상태를 1회 보낸다.
 */
function attachWindowFrame(
  window: BrowserWindow,
  tabManager: TabManager,
  emitState: (state: TWindowState) => void,
): { controls: IWindowControls; frame: TPointerFrame } {
  const isRounded = hasRoundedCorners(process.platform);
  const applyState = (state: TWindowState) => {
    emitState(state);
    if (isRounded) tabManager.setCornerRadius(state.isMaximized ? 0 : WINDOW_CORNER_RADIUS);
  };
  const windowFrame = isRounded ? createLinuxFrame(window, applyState) : createNativeWindowFrame(window, applyState);
  watchFullScreen(window, applyState, windowFrame.frame.isMaximized);
  window.webContents.on('did-finish-load', () =>
    applyState({ isMaximized: windowFrame.frame.isMaximized() || window.isFullScreen() }),
  );
  return windowFrame;
}

/** Linux — 최대화 토글·상태를 작업 영역 최대화기로 (spec 017) */
function createLinuxFrame(window: BrowserWindow, onChange: (state: TWindowState) => void) {
  const maximizer = createBoundsMaximizer(window, {
    onChange,
    getWorkArea: (bounds) => screen.getDisplayMatching(bounds).workArea,
    getDisplayId: (bounds) => screen.getDisplayMatching(bounds).id,
  });
  // 모니터·작업 표시줄이 바뀌면 기억한 최대화 bounds 가 틀릴 수 있다 (spec 018)
  screen.on('display-metrics-changed', maximizer.forgetAreas);
  screen.on('display-added', maximizer.forgetAreas);
  screen.on('display-removed', maximizer.forgetAreas);
  return { controls: { ...createWindowControls(window), toggleMaximize: maximizer.toggle }, frame: maximizer };
}

/** macOS·Windows — 창 관리자 최대화 그대로 */
function createNativeWindowFrame(window: BrowserWindow, onChange: (state: TWindowState) => void) {
  watchMaximizeEvents(window, onChange);
  return { controls: createWindowControls(window), frame: createNativeFrame(window) };
}

interface IAgentRuntimeDeps {
  tabManager: TabManager;
  emitToSidebar: ReturnType<typeof createSidebarEmitter>;
  account: IAccountService;
  /** runs·steps 저장 DB — 실행 기록 조회(runs:*)와 같은 연결을 쓴다 (spec 012) */
  runDatabase: ReturnType<typeof openDatabase>;
  /** 켜진 스킬 — run 시작 때 시스템 프롬프트 두 번째 블록으로 (spec 013) */
  skills: Pick<ISkillStore, 'listEnabled'>;
  /** 에이전트가 일하는 탭 표시 (spec 021 FR-12) */
  tabActivity: ReturnType<typeof createAgentTabActivity>;
  /** 창 포커스가 없을 때 OS 알림 (spec 021 FR-13) */
  notifier: ReturnType<typeof createRunNotifier>;
}

/** 에이전트 실행 서비스 조립 — 저장소·탭 포트·드라이버·모델 클라이언트·이벤트 발신 */
function createAgentRuntime(deps: IAgentRuntimeDeps) {
  const { tabManager, emitToSidebar, account, runDatabase, skills, tabActivity, notifier } = deps;
  const tabsPort: ITabsPort = tabActivity.wrapTabsPort({
    list: () => tabManager.getSnapshot(),
    activate: (id) => tabManager.activateTab(id),
    create: (url) => tabManager.createTab(url),
    getCdpTargetId: (id) => tabManager.getCdpTargetId(id),
  });
  const emitAgentEvent = (event: TAgentEvent) => {
    emitToSidebar(IPC.agent.event, AgentEventSchema, event);
    tabActivity.handleEvent(event);
    notifier.handleEvent(event);
  };
  return createAgentService({
    profile: createRuntimeProfile(account),
    createDriver: async () => {
      const cdp = await getCdp();
      const startTabId = tabManager.getActiveTabId() ?? tabManager.createTab();
      tabActivity.startRun(startTabId);
      return createBrowserDriver({ tabs: tabsPort, cdp, startTabId });
    },
    runStore: createRunRepo(runDatabase),
    skills,
    emit: emitAgentEvent,
    now: () => new Date(),
    createId: randomUUID,
    guardOptions: { allowedHostList: env.mode === 'test' ? ['127.0.0.1'] : [] },
    maxToolCalls: MAX_TOOL_CALLS,
    maxInputTokens: env.maxInputTokens,
    log,
    onAuthFailure: () => account.handleAuthFailure(),
    onRunEnd: () => void account.refreshCredits(),
  });
}

/** 알림 객체가 click 전에 GC 되지 않도록 닫히거나 눌릴 때까지 잡아 둔다 */
const liveNotificationSet = new Set<Notification>();

/**
 * OS 알림 어댑터 (spec 021 FR-13·14) — isSupported 는 알림마다 읽는다(캐시 금지, e2e 가 패치한다).
 * 알림 클릭은 창 포커스만 한다 — 승인·거부 동작 없음 (SR-1)
 */
function showOsNotification({ title, body, onClick }: IRunNotification & { onClick: () => void }): void {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body });
  liveNotificationSet.add(notification);
  const release = () => liveNotificationSet.delete(notification);
  notification.on('click', () => {
    release();
    onClick();
  });
  notification.on('close', release);
  notification.show();
}

/** 최소화돼 있으면 복원하고 앞으로 가져온다 */
function focusMainWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

void app.whenReady().then(() => {
  startBrowser();
  log.info('app', `시작 (${env.mode}, profile=${env.profileKind}, model=${env.model})`);
});

// 종료 전에 로그인 쿠키를 디스크에 확실히 쓴다 (재실행 시 세션 유지 — spec 002 FR-8)
let isCookieFlushed = false;
app.on('before-quit', (event) => {
  // 승인·질문 대기 중이면 실행 없이 풀고 run 을 failed(앱 종료)로 정리한다 (spec 004 SR-1) — 여러 번 불러도 안전
  agentService?.shutdown();
  accountService?.shutdown();
  if (isCookieFlushed) return;
  event.preventDefault();
  void session
    .fromPartition(BROWSING_PARTITION)
    .cookies.flushStore()
    .catch((error: unknown) => log.warn('app', '쿠키 저장 실패', error))
    .then(async () => {
      if (cdpConnection) await (await cdpConnection).close();
    })
    .catch((error: unknown) => log.warn('app', 'CDP 연결 종료 실패', error))
    .finally(() => {
      isCookieFlushed = true;
      app.quit();
    });
});

// DB 는 창·탭이 모두 닫힌 뒤에 닫는다 — 종료 직전에 끝난 탭 로드(방문 기록)·renderer 조회가 닫힌 DB 를 건드리지 않게 (spec 021)
app.on('will-quit', () => {
  database?.close();
  database = null;
});

app.on('window-all-closed', () => app.quit());
