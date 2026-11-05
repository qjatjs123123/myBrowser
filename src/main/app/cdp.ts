import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { log } from '../log';

/** Chromium 커맨드라인 스위치 한 개 — [이름, 값] */
export type TSwitch = [name: string, value: string];

interface ICdpOptions {
  /** env.cdpPort — resolveCdpEndpoint 와 같은 값 (0 = 임의 포트) */
  port: number;
}

const ACTIVE_PORT_FILE = 'DevToolsActivePort';

/**
 * [CDP] 원격 디버깅 스위치 계산 — 에이전트가 playwright-core 로 탭에 붙는 통로.
 * 항상 127.0.0.1 에만 연다. 설치판 기본 포트 0(임의 포트)은 env.ts 가 정한다 (spec 005 FR-2·SR-4).
 * 규칙: .claude/rules/electron/main.md 「보안 기본값」
 */
export function getCdpSwitches({ port }: ICdpOptions): TSwitch[] {
  return [
    ['remote-debugging-address', '127.0.0.1'],
    ['remote-debugging-port', String(port)],
  ];
}

/** removeStaleActivePort 가 쓰는 파일 삭제 — 테스트에서 주입 */
export interface IActivePortFs {
  rmSync: (path: string, options: { force: true }) => void;
}

/**
 * 지난 실행이 남긴 userData/DevToolsActivePort 를 ready 전에 지운다 — port 0 일 때 에이전트가
 * 이번 실행이 쓴 포트만 읽게 한다 (spec 005 FR-2). 파일이 없으면 무시, 지우지 못하면 경고만 남긴다.
 */
export function removeStaleActivePort(userDataDir: string, fs: IActivePortFs = { rmSync }): void {
  try {
    fs.rmSync(join(userDataDir, ACTIVE_PORT_FILE), { force: true });
  } catch (error) {
    log.warn('cdp', 'DevToolsActivePort 삭제 실패', error);
  }
}
