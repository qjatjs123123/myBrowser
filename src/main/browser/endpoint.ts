import { readFile as readFileFromDisk } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleepFor } from 'node:timers/promises';

import type { TSleep } from './types';

const POLL_INTERVAL_MS = 100;
const POLL_TIMEOUT_MS = 5000;
const ACTIVE_PORT_FILE = 'DevToolsActivePort';

export interface IResolveCdpEndpointOptions {
  /** env.cdpPort — 0 이면 Chromium 이 고른 임의 포트(테스트) */
  port: number;
  userDataDir: string;
  readFile?: (path: string) => Promise<string>;
  sleep?: TSleep;
}

/**
 * [CDP 엔드포인트] connectOverCDP 에 넘길 URL — 고정 포트면 바로, 0 이면 Chromium 이 userData 에 쓴
 * DevToolsActivePort 첫 줄의 포트를 최대 5s 기다려 읽는다. 끝내 못 읽으면 throw.
 */
export async function resolveCdpEndpoint(options: IResolveCdpEndpointOptions): Promise<string> {
  if (options.port !== 0) return toEndpoint(options.port);
  const { userDataDir, readFile = (path) => readFileFromDisk(path, 'utf8'), sleep = sleepFor } = options;
  const path = join(userDataDir, ACTIVE_PORT_FILE);
  for (let elapsed = 0; elapsed <= POLL_TIMEOUT_MS; elapsed += POLL_INTERVAL_MS) {
    const port = await readActivePort(readFile, path);
    if (port !== null) return toEndpoint(port);
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`CDP 포트를 찾지 못했습니다: ${path}`);
}

/** 파일이 아직 없거나 첫 줄이 포트가 아니면 null — 다음 폴링에서 다시 읽는다 */
async function readActivePort(readFile: (path: string) => Promise<string>, path: string): Promise<number | null> {
  try {
    const firstLine = (await readFile(path)).split('\n')[0]?.trim() ?? '';
    const port = Number(firstLine);
    return /^\d+$/.test(firstLine) && port > 0 && port < 65536 ? port : null;
  } catch {
    return null;
  }
}

function toEndpoint(port: number): string {
  return `http://127.0.0.1:${port}`;
}
