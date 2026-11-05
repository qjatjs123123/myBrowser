import type { Page } from 'playwright-core';

import { toActionFailure } from './actions';

/** 스크린샷 상한 — 모델 비전 입력 크기 (spec 004 FR-6) */
export const SCREENSHOT_MAX_WIDTH = 1280;
export const SCREENSHOT_MAX_HEIGHT = 800;
/** PNG IHDR 의 가로·세로 위치 (바이트, big-endian uint32) */
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;

/** 스크린샷 결과 + 좌표 변환 비율(scale = CSS px / 스크린샷 px) — 드라이버가 scale 을 보관한다 */
export type TScreenshotCapture =
  { ok: true; pngBase64: string; width: number; height: number; scale: number } | { ok: false; reason: string };

interface IViewportInfo {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
}

/**
 * [스크린샷] 현재 뷰포트를 PNG 로 찍고 1280×800 이하로 축소한다. 뷰포트 크기는 바꾸지 않고
 * CDP `Page.captureScreenshot` 의 clip.scale 로 줄인다 (playwright screenshot 은 임의 축소를 못 한다).
 */
export async function takeScreenshot(page: Page): Promise<TScreenshotCapture> {
  try {
    const viewport = (await page.evaluate(VIEWPORT_EXPRESSION)) as IViewportInfo;
    const pngBase64 = await captureWithinLimit(page, viewport);
    const { width, height } = readPngSize(pngBase64);
    return { ok: true, pngBase64, width, height, scale: viewport.width / width };
  } catch (error) {
    return toActionFailure(error);
  }
}

/** 뷰포트를 상한 안에 넣는 축소 비율 (1 이하) */
export function getFitRatio(width: number, height: number): number {
  return Math.min(1, SCREENSHOT_MAX_WIDTH / width, SCREENSHOT_MAX_HEIGHT / height);
}

const VIEWPORT_EXPRESSION =
  '({ width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY })';

/**
 * clip.scale 에 devicePixelRatio 가 곱해지는지는 환경(에뮬레이션·실제 HiDPI)마다 다르다 —
 * CSS 기준 비율로 찍고, 결과 PNG 가 상한을 넘으면 그만큼 더 줄여 1번 다시 찍는다.
 */
async function captureWithinLimit(page: Page, viewport: IViewportInfo): Promise<string> {
  const ratio = getFitRatio(viewport.width, viewport.height);
  const first = await capturePng(page, viewport, ratio);
  const size = readPngSize(first);
  const correction = getFitRatio(size.width, size.height);
  return correction === 1 ? first : capturePng(page, viewport, ratio * correction);
}

async function capturePng(page: Page, viewport: IViewportInfo, scale: number): Promise<string> {
  const session = await page.context().newCDPSession(page);
  try {
    // clip 은 문서 좌표 — 스크롤 위치를 더해야 지금 보이는 영역이다
    const clip = { x: viewport.scrollX, y: viewport.scrollY, width: viewport.width, height: viewport.height, scale };
    const { data } = await session.send('Page.captureScreenshot', { format: 'png', clip });
    return data;
  } finally {
    await session.detach().catch(() => undefined);
  }
}

/** PNG IHDR 의 가로·세로 (바이트 16~23, big-endian) */
export function readPngSize(pngBase64: string): { width: number; height: number } {
  const buffer = Buffer.from(pngBase64, 'base64');
  return { width: buffer.readUInt32BE(PNG_WIDTH_OFFSET), height: buffer.readUInt32BE(PNG_HEIGHT_OFFSET) };
}
