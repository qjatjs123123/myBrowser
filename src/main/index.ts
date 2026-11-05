// 앱 진입점 — 조립만 한다. 로직은 각 모듈에 (.claude/rules/architecture.md §2)
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

import { app, ipcMain, Menu, safeStorage, session } from 'electron';

import { FakeScenarioSchema, type TFakeScenario } from '@shared/agent/fakeScenario';
import { AgentEventSchema } from '@shared/ipc/agent';
import { AccountStatusSchema } from '@shared/ipc/account';
import { IPC } from '@shared/ipc/channels';
import { ShortcutPressedEventSchema } from '@shared/ipc/shortcut';
import { TabsChangedEventSchema } from '@shared/ipc/tabs';

import { createAccountService, createGatewayClient, sleepWithSignal, type IAccountService } from './account';
import { createModelClient } from './agent/modelClient';
import { createAgentService } from './agent/service';
import { getCdpSwitches, removeStaleActivePort } from './app/cdp';
import { createCredentialStore } from './app/credentialStore';
import { createAppMenuTemplate } from './app/menu';
import { createMainWindow } from './app/window';
import { createCdpConnection } from './browser/cdp';
import { createBrowserDriver } from './browser/driver';
import { resolveCdpEndpoint } from './browser/endpoint';
import type { ICdpConnection, ITabsPort } from './browser/types';
import { loadDotEnv, readEnv } from './env';
import { createSidebarEmitter } from './ipc/emit';
import { createAccountHandlers } from './ipc/handlers/account';
import { createAgentHandlers } from './ipc/handlers/agent';
import { createAppHandlers } from './ipc/handlers/app';
import { createTabsHandlers } from './ipc/handlers/tabs';
import { registerIpc } from './ipc/registry';
import { log } from './log';
import { openDatabase } from './store/db';
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
const DEVICE_NAME_MAX = 64;
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
  const emitToSidebar = createSidebarEmitter(() => window.webContents);
  let shortcutInput: ReturnType<typeof createShortcutInputHandler> = () => {};
  const tabManager = new TabManager({
    host: window.contentView,
    createView: () => createElectronTabView({ onInput: (event, input) => shortcutInput(event, input) }),
    onChanged: (snapshot) => emitToSidebar(IPC.tabs.changed, TabsChangedEventSchema, snapshot),
  });
  const runner = createShortcutRunner({
    tabManager,
    emitShortcut: (action) => emitToSidebar(IPC.shortcut.pressed, ShortcutPressedEventSchema, { action }),
    focusChrome: () => window.webContents.focus(),
  });
  shortcutInput = createShortcutInputHandler(runner, process.platform);
  attachShortcuts(window.webContents, runner, process.platform);
  accountService = createAccountRuntime(tabManager, emitToSidebar);
  agentService = createAgentRuntime(tabManager, emitToSidebar, accountService);
  registerIpc(ipcMain, {
    ...createAppHandlers({ getName: () => app.getName(), getVersion: () => app.getVersion(), mode: env.mode }),
    ...createTabsHandlers(tabManager),
    ...createAgentHandlers(agentService),
    ...createAccountHandlers(accountService),
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
    modelMode: env.modelMode,
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
    deviceName: hostname().slice(0, DEVICE_NAME_MAX) || DEFAULT_DEVICE_NAME,
    log,
  });
}

/** 모델 클라이언트 — gateway 모드는 기기 토큰 + 게이트웨이 주소, 그 외는 기존대로 (spec 005 FR-3) */
function createRuntimeModelClient(account: IAccountService) {
  if (env.modelMode === 'gateway') {
    return createModelClient({ isFake: false, apiKey: account.getDeviceToken() ?? undefined, baseURL: env.gatewayUrl });
  }
  return createModelClient({
    isFake: env.isFakeModel,
    apiKey: env.anthropicApiKey,
    scenario: env.isFakeModel ? readFakeScenario() : undefined,
  });
}

/** 에이전트 실행 서비스 조립 — 저장소·탭 포트·드라이버·모델 클라이언트·이벤트 발신 */
function createAgentRuntime(
  tabManager: TabManager,
  emitToSidebar: ReturnType<typeof createSidebarEmitter>,
  account: IAccountService,
) {
  database = openDatabase(join(app.getPath('userData'), DATABASE_FILE_NAME));
  const tabsPort: ITabsPort = {
    list: () => tabManager.getSnapshot(),
    activate: (id) => tabManager.activateTab(id),
    create: (url) => tabManager.createTab(url),
    getCdpTargetId: (id) => tabManager.getCdpTargetId(id),
  };
  return createAgentService({
    createModelClient: () => createRuntimeModelClient(account),
    createDriver: async () => {
      const cdp = await getCdp();
      const startTabId = tabManager.getActiveTabId() ?? tabManager.createTab();
      return createBrowserDriver({ tabs: tabsPort, cdp, startTabId });
    },
    runStore: createRunRepo(database),
    emit: (event) => emitToSidebar(IPC.agent.event, AgentEventSchema, event),
    now: () => new Date(),
    createId: randomUUID,
    guardOptions: { allowedHostList: env.mode === 'test' ? ['127.0.0.1'] : [] },
    model: env.model,
    maxToolCalls: MAX_TOOL_CALLS,
    log,
    modelMode: env.modelMode,
    onAuthFailure: () => account.handleAuthFailure(),
    onRunEnd: () => void account.refreshCredits(),
  });
}

void app.whenReady().then(() => {
  startBrowser();
  log.info('app', `시작 (${env.mode})`);
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
      database?.close();
      database = null;
      isCookieFlushed = true;
      app.quit();
    });
});

app.on('window-all-closed', () => app.quit());
