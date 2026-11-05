import type { Page } from 'playwright-core';

import type { TTabsSnapshot } from '@shared/ipc/tabs';

/**
 * [브라우저 제어 ↔ 탭] browser/ 가 electron 없이 탭을 다루는 포트 — 조립 코드가 TabManager 로 구현한다.
 * 의존 방향 browser → tabs 를 인터페이스로 끊어 vitest(node)에서 가짜로 테스트한다.
 */
export interface ITabsPort {
  list(): TTabsSnapshot;
  activate(id: string): void;
  /** 새 탭을 활성으로 열고 id 를 돌려준다 */
  create(url?: string): string;
  /** 없는 탭이면 null */
  getCdpTargetId(id: string): Promise<string | null>;
}

/** [CDP 연결] targetId 로 playwright Page 를 찾는 연결 — 앱 수명 동안 1개 (run 마다 새로 만들지 않는다) */
export interface ICdpConnection {
  getPage(targetId: string): Promise<Page>;
  close(): Promise<void>;
}

/** 대기 함수 — 테스트가 가짜를 주입해 실제로 기다리지 않게 한다 */
export type TSleep = (ms: number) => Promise<void>;
