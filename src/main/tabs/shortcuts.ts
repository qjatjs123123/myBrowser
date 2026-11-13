import type { TShortcutPressedEvent } from '@shared/ipc/shortcut';
import type { TZoomDirection } from '@shared/ipc/tabs';

import type { IPreventableEvent } from './electronTabView';

/** [단축키] main 이 판정·실행하는 동작 — 메뉴 accelerator 대신 before-input-event 한 경로로 처리한다 */
export type TShortcutAction =
  | 'newTab'
  | 'closeTab'
  | 'focusAddressBar'
  | 'reload'
  | 'goBack'
  | 'goForward'
  | 'nextTab'
  | 'prevTab'
  | 'toggleSidebar'
  | 'openFindBar'
  | 'toggleBookmark'
  | 'openHistory'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset';

/** before-input-event 의 input 중 판정에 필요한 부분 (Electron `Input` 과 호환) */
export interface IShortcutInput {
  type: string;
  key: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

/** 단축키가 다루는 TabManager 의 공개 메서드 */
export interface IShortcutTabTarget {
  createTab(url?: string): string;
  closeTab(id: string): void;
  cycleTab(delta: 1 | -1): void;
  reload(id: string): void;
  goBack(id: string): void;
  goForward(id: string): void;
  zoom(id: string, direction: TZoomDirection): void;
  getActiveTabId(): string | null;
}

export interface IShortcutRunnerOptions {
  tabManager: IShortcutTabTarget;
  /** renderer 가 처리할 동작(포커스)을 shortcut:pressed 로 보낸다 */
  emitShortcut: (action: TShortcutPressedEvent['action']) => void;
  /** 메인 창(크롬 renderer) webContents 에 포커스 — 탭 페이지에 있던 포커스를 주소창 쪽으로 가져온다 */
  focusChrome: () => void;
}

export type TShortcutRunner = (action: TShortcutAction) => void;

/** before-input-event 를 붙일 수 있는 webContents 의 최소 모양 */
export interface IInputEventSource {
  on(event: 'before-input-event', listener: (event: IPreventableEvent, input: IShortcutInput) => void): unknown;
}

/** 주 수식키(Ctrl·mac Cmd) + 키 */
const PRIMARY_KEY_ACTION: Readonly<Record<string, TShortcutAction>> = {
  t: 'newTab',
  w: 'closeTab',
  l: 'focusAddressBar',
  r: 'reload',
  tab: 'nextTab',
  f: 'openFindBar',
  d: 'toggleBookmark',
  h: 'openHistory',
  '=': 'zoomIn',
  '+': 'zoomIn',
  '-': 'zoomOut',
  '0': 'zoomReset',
};

/** 주 수식키 + Shift + 키 — 이 밖의 Shift 조합(Ctrl+Shift+T 등)은 단축키가 아니다 */
const PRIMARY_SHIFT_KEY_ACTION: Readonly<Record<string, TShortcutAction>> = {
  tab: 'prevTab',
  a: 'toggleSidebar',
  // Ctrl+Shift+= 는 key 가 '+' 다 (spec 021 FR-10)
  '+': 'zoomIn',
};

/** mac 은 Cmd+H 가 OS 의 앱 숨기기라 기록은 Cmd+Shift+H (spec 021 FR-6) */
const MAC_KEY_OVERRIDE: Readonly<Record<string, TShortcutAction | null>> = {
  h: null,
  'shift+h': 'openHistory',
};

/** Alt + 키 */
const ALT_KEY_ACTION: Readonly<Record<string, TShortcutAction>> = {
  arrowleft: 'goBack',
  arrowright: 'goForward',
};

/**
 * [단축키 판정] 키 입력 → 동작. keyDown 만, darwin 은 Cmd·그 외 Ctrl 이 주 수식키.
 * 다른 수식키가 섞이면 null — 단 주 수식키+Shift+Tab 은 prevTab, +Shift+A 는 toggleSidebar, +Shift+'+' 는 zoomIn.
 */
export function toShortcutAction(input: IShortcutInput, platform: NodeJS.Platform): TShortcutAction | null {
  if (input.type !== 'keyDown') return null;
  const isMac = platform === 'darwin';
  const isPrimary = isMac ? input.meta : input.control;
  const isOtherModifier = isMac ? input.control : input.meta;
  const key = input.key.toLowerCase();
  if (isOtherModifier) return null;
  if (input.alt) return isPrimary || input.shift ? null : (ALT_KEY_ACTION[key] ?? null);
  if (!isPrimary) return null;
  const macKey = input.shift ? `shift+${key}` : key;
  if (isMac && macKey in MAC_KEY_OVERRIDE) return MAC_KEY_OVERRIDE[macKey] ?? null;
  if (input.shift) return PRIMARY_SHIFT_KEY_ACTION[key] ?? null;
  return PRIMARY_KEY_ACTION[key] ?? null;
}

/** [단축키 실행] 동작을 TabManager·크롬 포커스·renderer 이벤트로 옮긴다 — 탭 대상 동작은 활성 탭에 */
export function createShortcutRunner(options: IShortcutRunnerOptions): TShortcutRunner {
  const actionMap: Record<TShortcutAction, () => void> = {
    ...createFocusActions(options),
    ...createTabActions(options.tabManager),
  };
  return (action) => actionMap[action]();
}

/**
 * 크롬(renderer) 쪽 동작 — 새 탭은 시작 화면 검색창, 주소창 포커스, 사이드바 토글, 찾기 줄·북마크·방문 기록(spec 021).
 * toggleSidebar 는 탭·포커스를 건드리지 않고 renderer 에 알리기만 한다 (패널 상태는 renderer 가 들고 있다)
 */
function createFocusActions({ tabManager, emitShortcut, focusChrome }: IShortcutRunnerOptions) {
  return {
    newTab: () => {
      tabManager.createTab();
      focusChrome();
      emitShortcut('focusNewTabSearch');
    },
    focusAddressBar: () => {
      focusChrome();
      emitShortcut('focusAddressBar');
    },
    toggleSidebar: () => emitShortcut('toggleSidebar'),
    openFindBar: () => {
      focusChrome();
      emitShortcut('openFindBar');
    },
    // 북마크 토글은 포커스를 옮기지 않는다 — 페이지에서 Ctrl+D 해도 페이지 입력 위치가 그대로
    toggleBookmark: () => emitShortcut('toggleBookmark'),
    openHistory: () => {
      tabManager.createTab();
      focusChrome();
      emitShortcut('focusHistorySearch');
    },
  };
}

/** 활성 탭(또는 탭 순환)에 바로 적용되는 동작 */
function createTabActions(tabManager: IShortcutTabTarget) {
  const runOnActive = (run: (id: string) => void) => () => {
    const id = tabManager.getActiveTabId();
    if (id) run(id);
  };
  return {
    closeTab: runOnActive((id) => tabManager.closeTab(id)),
    reload: runOnActive((id) => tabManager.reload(id)),
    goBack: runOnActive((id) => tabManager.goBack(id)),
    goForward: runOnActive((id) => tabManager.goForward(id)),
    zoomIn: runOnActive((id) => tabManager.zoom(id, 'in')),
    zoomOut: runOnActive((id) => tabManager.zoom(id, 'out')),
    zoomReset: runOnActive((id) => tabManager.zoom(id, 'reset')),
    nextTab: () => tabManager.cycleTab(1),
    prevTab: () => tabManager.cycleTab(-1),
  };
}

/** [단축키 입력 핸들러] 단축키면 기본 동작(페이지·메뉴)을 막고 실행한다 — 탭 View 의 onInput 과 메인 창이 함께 쓴다 */
export function createShortcutInputHandler(runner: TShortcutRunner, platform: NodeJS.Platform) {
  return (event: IPreventableEvent, input: IShortcutInput): void => {
    const action = toShortcutAction(input, platform);
    if (!action) return;
    event.preventDefault();
    runner(action);
  };
}

/** [단축키 연결] webContents 의 before-input-event 에 단축키 핸들러를 붙인다 (메인 창용) */
export function attachShortcuts(source: IInputEventSource, runner: TShortcutRunner, platform: NodeJS.Platform): void {
  source.on('before-input-event', createShortcutInputHandler(runner, platform));
}
