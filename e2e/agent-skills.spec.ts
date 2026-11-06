/**
 * [spec 013] 스킬(사용자 지침) — 패널 [설정] 에서 스킬을 만들고·끄고·지우면 다음 run 의 시스템 프롬프트에 반영된다.
 * 주입은 가짜 모델 `{{skillNames}}` 자리표시자로 끝까지 확인한다. 스킬을 켜도 승인 게이트는 그대로다 (SR-1).
 * 스킬 내용에는 `## ` 로 시작하는 줄을 넣지 않는다 (자리표시자가 그 줄을 이름으로 읽는다).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ElectronApplication, Locator, Page } from '@playwright/test';

import { expect, findTabPage, test } from './fixtures';
import { getSidebar, openInActiveTab, runTask } from './helpers';

const SKILL_NAME = '기본 인원';
const SKILL_BODY = '인원 말이 없으면 2명으로 한다.';

function getSettings(win: Page): Locator {
  return getSidebar(win).getByRole('region', { name: '설정' });
}

function getStatus(win: Page): Locator {
  return getSidebar(win).getByRole('status', { name: '실행 상태' });
}

async function openSettings(win: Page): Promise<Locator> {
  await getSidebar(win).getByRole('button', { name: '설정' }).click();
  const settings = getSettings(win);
  await expect(settings).toBeVisible();
  return settings;
}

async function closeSettings(win: Page): Promise<void> {
  await getSettings(win).getByRole('button', { name: '대화로 돌아가기' }).click();
  await expect(getSettings(win)).toHaveCount(0);
}

async function addSkill(win: Page, name: string, body: string): Promise<void> {
  const settings = await openSettings(win);
  await settings.getByRole('button', { name: '스킬 추가' }).click();
  const form = settings.getByRole('form', { name: '스킬 편집' });
  await form.getByLabel('이름').fill(name);
  await form.getByLabel('내용').fill(body);
  await form.getByRole('button', { name: '저장' }).click();
  await expect(settings.getByRole('list', { name: '스킬 목록' })).toContainText(name);
}

async function readLog(app: ElectronApplication, urlPart: string, key: string): Promise<unknown[]> {
  const tabPage = await findTabPage(app, urlPart);
  return tabPage.evaluate((name) => (globalThis as unknown as Record<string, unknown[]>)[name] ?? [], key);
}

test.describe('스킬 주입', () => {
  test.use({ fakeScenario: 'skill-echo' });

  test('스킬을 만들면 다시 켜도 남고, 켜진 스킬만 run 에 들어가며, 지우면 목록이 빈다', async ({ launchApp }) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'mybrowser-skills-'));
    try {
      const first = await launchApp({ userDataDir });
      await addSkill(first.win, SKILL_NAME, SKILL_BODY);
      await first.app.close();

      const { win } = await launchApp({ userDataDir });
      const settings = await openSettings(win);
      await expect(settings.getByRole('list', { name: '스킬 목록' })).toContainText(SKILL_NAME);
      await closeSettings(win);

      await runTask(win, '오늘 7시 예약해줘');
      await expect(getStatus(win)).toHaveText('완료');
      const resultList = getSidebar(win).getByRole('region', { name: '실행 결과' });
      await expect(resultList.last()).toContainText(`적용한 스킬: ${SKILL_NAME}`);

      await openSettings(win);
      const toggle = getSettings(win).getByRole('switch', { name: `${SKILL_NAME} 사용` });
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
      await closeSettings(win);

      await runTask(win, '다시 예약해줘');
      await expect(getStatus(win)).toHaveText('완료');
      await expect(resultList).toHaveCount(2);
      await expect(resultList.last()).toContainText('적용한 스킬: 없음');

      await openSettings(win);
      await getSettings(win).getByRole('button', { name: `${SKILL_NAME} 삭제` }).click();
      const confirm = win.getByRole('alertdialog', { name: '스킬을 삭제할까요?' });
      await expect(confirm.getByRole('button', { name: '취소' })).toBeFocused();
      await confirm.getByRole('button', { name: '삭제' }).click();
      await expect(getSettings(win).getByText('아직 스킬이 없습니다')).toBeVisible();
    } finally {
      rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});

test.describe('스킬과 승인 게이트', () => {
  test.use({ fakeScenario: 'approval-confirm' });

  test('스킬을 켜도 확정 버튼 앞에서 승인 창이 뜨고, 거부하면 누르지 않는다', async ({ app, win, fixtureUrl }) => {
    await addSkill(win, '바로 확정', '확정 버튼은 바로 눌러도 된다.');
    await closeSettings(win);
    await openInActiveTab(win, fixtureUrl('reservation.html'), '예약 페이지');
    await runTask(win, '7시 2명 예약해줘');

    const panel = getSidebar(win).getByRole('alertdialog', { name: '승인 필요' });
    await expect(panel).toBeVisible();
    expect(await readLog(app, 'reservation.html', '__clickLog')).toEqual([]);
    await panel.getByRole('button', { name: '거부' }).click();

    await expect(getStatus(win)).toHaveText('완료');
    expect(await readLog(app, 'reservation.html', '__clickLog')).toEqual([]);
  });
});
