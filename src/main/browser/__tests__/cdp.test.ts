import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createCdpConnection } from '../cdp';
import { resolveCdpEndpoint } from '../endpoint';

const FIXTURE_URL = pathToFileURL(resolve(import.meta.dirname, '../../../../e2e/fixtures/pages/basic.html')).href;

let userDataDir = '';
let context: BrowserContext;
let endpoint = '';

/** 테스트 쪽(launch 한 쪽) page 의 targetId — Electron 의 webContents.debugger 가 하는 일과 같다 */
async function readTargetId(page: Page): Promise<string> {
  const session = await context.newCDPSession(page);
  const { targetInfo } = await session.send('Target.getTargetInfo');
  await session.detach();
  return targetInfo.targetId;
}

/** 가짜 시계 — sleep 이 부를 때마다 시간을 그만큼 앞으로 보낸다 (vi.useFakeTimers 를 쓰지 않는다) */
function createFakeClock() {
  let current = 0;
  const now = () => current;
  const sleep = vi.fn(async (ms: number) => {
    current += ms;
  });
  return { now, sleep };
}

beforeAll(async () => {
  userDataDir = await mkdtemp(join(tmpdir(), 'mybrowser-cdp-'));
  context = await chromium.launchPersistentContext(userDataDir, { args: ['--remote-debugging-port=0'] });
  endpoint = await resolveCdpEndpoint({ port: 0, userDataDir });
});

afterAll(async () => {
  await context?.close();
  await rm(userDataDir, { recursive: true, force: true });
});

describe('createCdpConnection', () => {
  it('DevToolsActivePort 로 찾은 엔드포인트에 연결해 targetId 로 같은 페이지를 찾는다', async () => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    const connection = await createCdpConnection({ endpoint });
    const found = await connection.getPage(await readTargetId(page));
    expect(found.url()).toBe(FIXTURE_URL);
    await expect(found.title()).resolves.toBe(await page.title());
    await connection.close();
  });

  it('같은 targetId 를 다시 찾으면 같은 Page 객체를 돌려준다 (캐시)', async () => {
    const page = await context.newPage();
    const connection = await createCdpConnection({ endpoint });
    const targetId = await readTargetId(page);
    expect(await connection.getPage(targetId)).toBe(await connection.getPage(targetId));
    await connection.close();
  });

  it('없는 targetId 는 0.2s 간격으로 5s 재시도한 뒤 실패한다', async () => {
    const { now, sleep } = createFakeClock();
    const connection = await createCdpConnection({ endpoint, now, sleep });
    await expect(connection.getPage('NO-SUCH-TARGET')).rejects.toThrow('탭의 페이지를 찾지 못했습니다');
    expect(sleep).toHaveBeenCalledWith(200);
    expect(sleep).toHaveBeenCalledTimes(25);
    await connection.close();
  });

  it('연결이 끊기면 다음 getPage 에서 한 번 다시 연결한다', async () => {
    const page = await context.newPage();
    const connect = vi.fn((url: string) => chromium.connectOverCDP(url));
    const connection = await createCdpConnection({ endpoint, connect });
    const targetId = await readTargetId(page);
    const first = await connection.getPage(targetId);
    await first.context().browser()?.close();
    const second = await connection.getPage(targetId);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
    await connection.close();
  });

  it('처음 연결에 실패하면 reject 한다', async () => {
    const connect = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(createCdpConnection({ endpoint, connect })).rejects.toThrow('ECONNREFUSED');
  });
});
