/**
 * [평가 세트] 실행 진행 공용 모듈 — 앱 화면에서 할 일이 끝날 때까지 승인 창·질문 카드에 답한다 (spec 005 FR-8, spec 020).
 * 픽스처 세트(agent.eval.ts)와 실제 사이트 세트(sites.eval.ts)가 같이 쓴다. 승인 답은 호출하는 쪽이 정한다 —
 * 실제 사이트 세트는 항상 거부만 넘긴다 (spec 020 SR-1).
 */
import type { ElectronApplication, Locator, Page } from '@playwright/test';

import { expect } from '../e2e/fixtures';
import { getSidebar } from '../e2e/helpers';
import type { TApprovalAnswer } from './scenarios';

/** 상태 배지의 끝 상태 문구 — src/renderer/sidebar/AgentPanel/StatusBadge.tsx */
const FINAL_LABEL_LIST = ['완료', '실패', '중지됨', '확정 직전 정지'];
const POLL_MS = 200;
/** 실제 사이트 시작 페이지가 뜨기를 기다리는 시간 */
const SITE_OPEN_TIMEOUT_MS = 30_000;
/** 크롬(사이드바) 창 URL — 탭 페이지와 구분한다 (e2e/fixtures.ts 와 같은 기준) */
const CHROME_URL_PATTERN = /\/renderer\/index\.html$|^http:\/\/localhost:\d+\/?$/;

/** 사이트 시작 페이지를 열지 못했을 때 결과 줄의 error */
export const SITE_OPEN_FAILED = '시작 페이지 열기 실패';

/** 끝까지 진행할 때의 답 */
export interface IDriveAnswers {
  /** 승인 창이 뜨면 고를 답 */
  approvalAnswer: TApprovalAnswer;
  /** 질문 카드가 뜨면 누를 선택지 — 없으면 첫 선택지 */
  questionOption?: string;
}

/** 끝 상태가 될 때까지 승인 창·질문 카드에 답한다 — 답한 승인 창 수를 돌려준다 (시간 상한은 테스트 timeout) */
export async function driveUntilEnd(win: Page, answers: IDriveAnswers): Promise<number> {
  const sidebar = getSidebar(win);
  const status = sidebar.getByRole('status', { name: '실행 상태' });
  const panel = sidebar.getByRole('alertdialog', { name: '승인 필요' });
  const card = sidebar.getByRole('dialog', { name: '에이전트 질문' });
  let approvals = 0;
  while (!FINAL_LABEL_LIST.includes((await status.textContent())?.trim() ?? '')) {
    if (await panel.isVisible()) {
      await answerApproval(panel, answers.approvalAnswer);
      approvals += 1;
    } else if (await card.isVisible()) {
      await answerQuestion(card, answers.questionOption);
    } else {
      await win.waitForTimeout(POLL_MS);
    }
  }
  return approvals;
}

/** 가드 승인(세 버튼)과 모델 승인([승인]/[거부])을 구분해 답한다 */
async function answerApproval(panel: Locator, answer: TApprovalAnswer): Promise<void> {
  const isGuard = (await panel.getByRole('button', { name: '에이전트가 누르기' }).count()) > 0;
  if (answer === 'denied') await panel.getByRole('button', { name: '거부' }).click();
  else if (!isGuard) await panel.getByRole('button', { name: '승인' }).click();
  else if (answer === 'agent') await panel.getByRole('button', { name: '에이전트가 누르기' }).click();
  else {
    await panel.getByRole('button', { name: '직접 누를게요' }).click();
    await panel.getByRole('button', { name: '계속' }).click();
  }
  await expect(panel).toBeHidden();
}

/** 지정한 선택지(없으면 첫 선택지)를 누른다 */
async function answerQuestion(card: Locator, option: string | undefined): Promise<void> {
  const button = option ? card.getByRole('button', { name: option }) : card.getByRole('button').first();
  await button.click();
  await expect(card).toBeHidden();
}

/**
 * [실제 사이트] 주소창에 시작 URL 을 넣고 Enter → 그 host 의 탭 페이지가 잡히고 domcontentloaded 까지 기다린다.
 * 리다이렉트·동적 제목·봇 차단이 있어 제목은 비교하지 않는다 (spec 020 Task 3). 실패하면 SITE_OPEN_FAILED 로 throw.
 */
export async function openSiteInActiveTab(app: ElectronApplication, win: Page, startUrl: string): Promise<void> {
  try {
    const addressBar = win.getByRole('combobox', { name: '주소창' });
    await addressBar.click();
    await addressBar.fill(startUrl);
    await expect(addressBar).toHaveValue(startUrl);
    await addressBar.press('Enter');
    const page = await waitForTabPage(app, new URL(startUrl).hostname);
    await page.waitForLoadState('domcontentloaded', { timeout: SITE_OPEN_TIMEOUT_MS });
  } catch {
    throw new Error(SITE_OPEN_FAILED);
  }
}

/** host(앞의 www. 는 빼고 비교)를 URL 에 가진 탭 페이지를 기다린다 */
async function waitForTabPage(app: ElectronApplication, hostname: string): Promise<Page> {
  const hostPart = hostname.replace(/^www\./, '');
  const deadline = Date.now() + SITE_OPEN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const page = findTabPageList(app).find((candidate) => candidate.url().includes(hostPart));
    if (page) return page;
    await new Promise((resolveWait) => setTimeout(resolveWait, POLL_MS));
  }
  throw new Error(SITE_OPEN_FAILED);
}

/** 크롬 창을 뺀 탭 페이지들 */
function findTabPageList(app: ElectronApplication): Page[] {
  return app.windows().filter((page) => !CHROME_URL_PATTERN.test(page.url()));
}

/** 지금 주소창 값 — 끝 URL 로 쓴다 */
export async function getAddressBarUrl(win: Page): Promise<string | null> {
  const value = await win.getByRole('combobox', { name: '주소창' }).inputValue();
  return value === '' ? null : value;
}

/** 끝 URL 의 탭 페이지(없으면 마지막 탭 페이지)를 path 에 찍는다 — 실패해도 실행 결과에는 영향 없음 */
export async function captureTab(app: ElectronApplication, endUrl: string | null, path: string): Promise<void> {
  const tabList = findTabPageList(app);
  const page = tabList.find((candidate) => candidate.url() === endUrl) ?? tabList.at(-1);
  await page?.screenshot({ path }).catch(() => undefined);
}
