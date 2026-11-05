import { z } from 'zod';

import { IPC } from '@shared/ipc/channels';
import { fail, ok, type TIpcResult } from '@shared/ipc/result';
import {
  CreateTabRequestSchema,
  CreateTabResponseSchema,
  ListTabsResponseSchema,
  NavigateRequestSchema,
  SetBoundsRequestSchema,
  TabRequestSchema,
  type TCreateTabResponse,
  type TListTabsResponse,
  type TTabsSnapshot,
} from '@shared/ipc/tabs';

/** tabs:list 는 요청 인자가 없다 */
const ListTabsRequestSchema = z.undefined();

const INVALID_MESSAGE = '요청 형식이 올바르지 않습니다';
const NOT_FOUND_MESSAGE = '탭을 찾을 수 없습니다';

/** 핸들러가 부르는 TabManager 의 공개 메서드 — 테스트에서 가짜를 넣는다 */
export interface ITabsHandlerTarget {
  getSnapshot(): TTabsSnapshot;
  createTab(url?: string): string;
  closeTab(id: string): void;
  activateTab(id: string): void;
  navigate(id: string, url: string): void;
  goBack(id: string): void;
  goForward(id: string): void;
  reload(id: string): void;
  stop(id: string): void;
  setBounds(rect: { x: number; y: number; width: number; height: number }): void;
  hasTab(id: string): boolean;
}

type TTabMethod = 'closeTab' | 'activateTab' | 'goBack' | 'goForward' | 'reload' | 'stop';

/**
 * [tabs 핸들러] 계약의 invoke 10채널 — safeParse → 탭 존재 확인 → TabManager 호출 → 봉투.
 * 규칙: .claude/rules/electron/ipc.md 「핸들러」 — 로직은 TabManager 에
 */
export function createTabsHandlers(tabManager: ITabsHandlerTarget) {
  const byTabId = (method: TTabMethod) => (raw: unknown) => runOnTab(tabManager, raw, method);
  return {
    [IPC.tabs.list]: (raw?: unknown) => listTabs(tabManager, raw),
    [IPC.tabs.create]: (raw: unknown) => createTab(tabManager, raw),
    [IPC.tabs.close]: byTabId('closeTab'),
    [IPC.tabs.activate]: byTabId('activateTab'),
    [IPC.tabs.navigate]: (raw: unknown) => navigateTab(tabManager, raw),
    [IPC.tabs.goBack]: byTabId('goBack'),
    [IPC.tabs.goForward]: byTabId('goForward'),
    [IPC.tabs.reload]: byTabId('reload'),
    [IPC.tabs.stop]: byTabId('stop'),
    [IPC.tabs.setBounds]: (raw: unknown) => setBounds(tabManager, raw),
  };
}

function listTabs(tabManager: ITabsHandlerTarget, raw: unknown): TIpcResult<TListTabsResponse> {
  const parsed = ListTabsRequestSchema.safeParse(raw);
  if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
  return ok(ListTabsResponseSchema.parse(tabManager.getSnapshot()));
}

function createTab(tabManager: ITabsHandlerTarget, raw: unknown): TIpcResult<TCreateTabResponse> {
  const parsed = CreateTabRequestSchema.safeParse(raw);
  if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
  return ok(CreateTabResponseSchema.parse({ tabId: tabManager.createTab(parsed.data.url) }));
}

function runOnTab(tabManager: ITabsHandlerTarget, raw: unknown, method: TTabMethod): TIpcResult<null> {
  const parsed = TabRequestSchema.safeParse(raw);
  if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
  if (!tabManager.hasTab(parsed.data.tabId)) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);
  tabManager[method](parsed.data.tabId);
  return ok(null);
}

function navigateTab(tabManager: ITabsHandlerTarget, raw: unknown): TIpcResult<null> {
  const parsed = NavigateRequestSchema.safeParse(raw);
  if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
  if (!tabManager.hasTab(parsed.data.tabId)) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);
  tabManager.navigate(parsed.data.tabId, parsed.data.url);
  return ok(null);
}

function setBounds(tabManager: ITabsHandlerTarget, raw: unknown): TIpcResult<null> {
  const parsed = SetBoundsRequestSchema.safeParse(raw);
  if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
  tabManager.setBounds(parsed.data);
  return ok(null);
}
