/**
 * [spec 005] 구독 계정 활성화 — gateway 모드에서 [구독하고 시작하기] → 구매 탭 → 자동 연결 → run → 크레딧 갱신,
 * 재실행 시 저장 토큰 유지, 402·401 문장. 모델 호출은 로컬 가짜 게이트웨이(e2e/fixtures/gateway.ts)로만 간다.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { getSidebar, runTask } from './helpers';
import { type IFakeGateway, type TFakeMessagesStatus, startFakeGateway } from './fixtures/gateway';

function getAccountCard(win: Page): Locator {
  return getSidebar(win).getByRole('region', { name: '계정' });
}

/** prod 프로필 env — 가짜 모델을 끄고 가짜 게이트웨이로 보낸다 (.env 는 test 모드라 읽지 않는다, spec 007) */
function toGatewayEnv(gateway: IFakeGateway) {
  return {
    MYBROWSER_FAKE_MODEL: '0',
    MYBROWSER_FAKE_SCENARIO: undefined,
    MYBROWSER_PROFILE: 'prod',
    MYBROWSER_GATEWAY_URL: gateway.url,
  };
}

/** [구독하고 시작하기] → 구매 탭이 열리고 → 폴링으로 자동 연결돼 크레딧이 보일 때까지 */
async function activate(win: Page): Promise<void> {
  const card = getAccountCard(win);
  await card.getByRole('button', { name: '구독하고 시작하기' }).click();
  await expect(card).toContainText('구매 페이지에서 결제를 마치면 자동으로 연결됩니다');
  await expect(win.getByRole('tab', { name: '가짜 구독 결제' })).toBeVisible();
  await expect(card).toContainText('크레딧 1000', { timeout: 15_000 });
}

/** 테스트마다 새 가짜 게이트웨이 + 임시 프로필 */
async function withGateway(
  messagesStatus: TFakeMessagesStatus,
  body: (gateway: IFakeGateway, userDataDir: string) => Promise<void>,
): Promise<void> {
  const gateway = await startFakeGateway({ messagesStatus });
  const userDataDir = mkdtempSync(join(tmpdir(), 'mybrowser-account-'));
  try {
    await body(gateway, userDataDir);
  } finally {
    await gateway.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

test('구독하고 시작하기를 누르면 자동으로 연결되고 할 일 실행 뒤 크레딧이 줄어든다', async ({ launchApp }) => {
  await withGateway(200, async (gateway, userDataDir) => {
    const { app, win } = await launchApp({ userDataDir, appEnv: toGatewayEnv(gateway) });
    try {
      await activate(win);
      await runTask(win, '아무 일');
      await expect(getSidebar(win).getByRole('region', { name: '실행 결과' })).toContainText('완료했습니다');
      await expect(getAccountCard(win)).toContainText('크레딧 990');
      expect(JSON.stringify(gateway.requestLog)).not.toMatch(/[0-9a-f]{64}/);
    } finally {
      await app.close();
    }
  });
});

test('연결한 뒤 앱을 다시 켜면 바로 준비됨으로 시작한다', async ({ launchApp }) => {
  await withGateway(200, async (gateway, userDataDir) => {
    const first = await launchApp({ userDataDir, appEnv: toGatewayEnv(gateway) });
    await activate(first.win);
    await first.app.close();
    const second = await launchApp({ userDataDir, appEnv: toGatewayEnv(gateway) });
    try {
      await expect(getAccountCard(second.win)).toContainText('준비됨');
      await expect(getAccountCard(second.win)).toContainText('크레딧 1000');
    } finally {
      await second.app.close();
    }
  });
});

test('크레딧이 부족하면 run 이 충전 안내 문장으로 실패한다', async ({ launchApp }) => {
  await withGateway(402, async (gateway, userDataDir) => {
    const { app, win } = await launchApp({ userDataDir, appEnv: toGatewayEnv(gateway) });
    try {
      await activate(win);
      await runTask(win, '아무 일');
      await expect(getSidebar(win)).toContainText('크레딧이 부족합니다');
    } finally {
      await app.close();
    }
  });
});

test('게이트웨이가 401 이면 연결이 해제되고 계정 카드가 다시 구독 버튼을 보인다', async ({ launchApp }) => {
  await withGateway(401, async (gateway, userDataDir) => {
    const { app, win } = await launchApp({ userDataDir, appEnv: toGatewayEnv(gateway) });
    try {
      await activate(win);
      await runTask(win, '아무 일');
      await expect(getSidebar(win)).toContainText('기기 연결이 해제됐습니다');
      await expect(getAccountCard(win).getByRole('button', { name: '구독하고 시작하기' })).toBeVisible();
    } finally {
      await app.close();
    }
  });
});

test('가짜 모델 모드에서는 계정 카드가 보이지 않는다', async ({ win }) => {
  await expect(getSidebar(win).getByRole('button', { name: '작업 실행' })).toBeVisible();
  await expect(getAccountCard(win)).toHaveCount(0);
});
