import type { Page } from 'playwright-core';

import { findRefLocator } from './refLocator';

/** 오버레이 호스트 표시 — target 해석·snapshot 이 이 속성의 요소를 건너뛴다 (SR-7) */
export const OVERLAY_ATTRIBUTE = 'data-mybrowser-overlay';
const HIGHLIGHT_POINT_SIZE = 40;
const HIGHLIGHT_PADDING = 4;
/** 강조 영역을 읽을 때 기다리는 최대 시간 — 오버레이는 보조 표시라 짧게 */
const REF_RECT_TIMEOUT_MS = 1000;

/** CSS px 좌표 (탭 뷰포트 기준) */
export interface ICssPoint {
  x: number;
  y: number;
}

interface ICssRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 페이지 안 함수로 보내는 명령 — 직렬화 가능한 값만 */
type TOverlayPageCommand =
  | { kind: 'ensure' }
  | { kind: 'cursor'; x: number; y: number }
  | ({ kind: 'highlight' } & ICssRect)
  | { kind: 'clear' };

/** 재주입 리스너를 page 마다 1번만 건다 */
const watchedPageSet = new WeakSet<Page>();

/**
 * [커서 오버레이] 탭에 shadow root 1개(호스트 `[data-mybrowser-overlay]`, `pointer-events:none`, aria-hidden)를 주입한다.
 * 메인 프레임이 이동하면 다시 주입한다. 실패는 무시 — 오버레이 때문에 행동이 실패하지 않는다.
 */
export async function ensureOverlay(page: Page): Promise<void> {
  watchNavigation(page);
  await sendOverlayCommand(page, { kind: 'ensure' });
}

/** 커서(12px 원)를 CSS px 좌표로 옮긴다 — 200ms 이동 애니메이션 */
export async function showCursor(page: Page, point: ICssPoint): Promise<void> {
  watchNavigation(page);
  await sendOverlayCommand(page, { kind: 'cursor', x: point.x, y: point.y });
}

/** 승인 대기 대상을 강조 테두리로 — ref 요소의 영역, 또는 좌표 둘레 */
export async function showHighlight(page: Page, target: { ref: string } | ICssPoint): Promise<void> {
  watchNavigation(page);
  const rect = 'ref' in target ? await getRefRect(page, target.ref) : getPointRect(target);
  if (rect === null) return;
  await sendOverlayCommand(page, { kind: 'highlight', ...padRect(rect) });
}

/** 강조 테두리를 지운다 (커서는 남긴다) */
export async function clearHighlight(page: Page): Promise<void> {
  await sendOverlayCommand(page, { kind: 'clear' });
}

/** ref 요소의 중심 — 구조 click 의 커서 표시용. 찾을 수 없으면 null */
export async function getRefCenter(page: Page, ref: string): Promise<ICssPoint | null> {
  const rect = await getRefRect(page, ref);
  return rect === null ? null : { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

async function getRefRect(page: Page, ref: string): Promise<ICssRect | null> {
  try {
    const locator = await findRefLocator(page, ref);
    if (!locator) return null;
    return await locator.boundingBox({ timeout: REF_RECT_TIMEOUT_MS });
  } catch {
    return null;
  }
}

function getPointRect({ x, y }: ICssPoint): ICssRect {
  const half = HIGHLIGHT_POINT_SIZE / 2;
  return { x: x - half, y: y - half, width: HIGHLIGHT_POINT_SIZE, height: HIGHLIGHT_POINT_SIZE };
}

function padRect({ x, y, width, height }: ICssRect): ICssRect {
  const pad = HIGHLIGHT_PADDING;
  return { x: x - pad, y: y - pad, width: width + pad * 2, height: height + pad * 2 };
}

function watchNavigation(page: Page): void {
  if (watchedPageSet.has(page)) return;
  watchedPageSet.add(page);
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    void page
      .waitForLoadState('domcontentloaded')
      .then(() => sendOverlayCommand(page, { kind: 'ensure' }))
      .catch(() => undefined);
  });
}

async function sendOverlayCommand(page: Page, cmd: TOverlayPageCommand): Promise<void> {
  try {
    await page.evaluate(applyOverlayCommand, cmd);
  } catch {
    // 페이지가 닫혔거나 이동 중 — 오버레이는 보조 표시라 무시한다
  }
}

/** 페이지 안에서 쓰는 DOM 의 최소 모양 — main 은 DOM lib 을 쓰지 않는다 */
interface IOverlayElement {
  style: { cssText: string; left: string; top: string; width: string; height: string; display: string };
  shadowRoot: { querySelector(selector: string): IOverlayElement | null } | null;
  setAttribute(name: string, value: string): void;
  attachShadow(init: { mode: 'open' }): { appendChild(el: IOverlayElement): void };
  appendChild(el: IOverlayElement): void;
}

interface IOverlayDocument {
  querySelector(selector: string): IOverlayElement | null;
  createElement(tag: string): IOverlayElement;
  documentElement: IOverlayElement;
}

/**
 * 페이지 안에서 실행 — 직렬화되므로 바깥을 참조하지 않는다. 스타일은 CSSOM(cssText)으로만 넣는다
 * (CSP 가 `<style>`·style 속성을 막는 페이지에서도 동작하게).
 */
function applyOverlayCommand(cmd: TOverlayPageCommand): void {
  const ATTRIBUTE = 'data-mybrowser-overlay';
  const doc = (globalThis as unknown as { document: IOverlayDocument }).document;
  const createPart = (part: string, cssText: string) => {
    const el = doc.createElement('div');
    el.setAttribute('data-part', part);
    el.style.cssText = cssText;
    return el;
  };
  const createHost = () => {
    const host = doc.createElement('div');
    host.setAttribute(ATTRIBUTE, '');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden;';
    const root = host.attachShadow({ mode: 'open' });
    root.appendChild(
      createPart(
        'cursor',
        'position:absolute;display:none;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;' +
          'background:rgba(37,99,235,0.85);box-shadow:0 0 0 2px #fff;pointer-events:none;' +
          'transition:left 200ms ease-out,top 200ms ease-out;',
      ),
    );
    root.appendChild(
      createPart(
        'highlight',
        'position:absolute;display:none;border:2px solid #f59e0b;border-radius:4px;' +
          'box-shadow:0 0 0 4px rgba(245,158,11,0.25);pointer-events:none;box-sizing:border-box;',
      ),
    );
    doc.documentElement.appendChild(host);
    return host;
  };
  const host = doc.querySelector(`[${ATTRIBUTE}]`) ?? createHost();
  const cursor = host.shadowRoot?.querySelector('[data-part=cursor]');
  const highlight = host.shadowRoot?.querySelector('[data-part=highlight]');
  if (!cursor || !highlight) return;
  if (cmd.kind === 'cursor') {
    cursor.style.display = 'block';
    cursor.style.left = `${cmd.x}px`;
    cursor.style.top = `${cmd.y}px`;
  } else if (cmd.kind === 'highlight') {
    highlight.style.display = 'block';
    highlight.style.left = `${cmd.x}px`;
    highlight.style.top = `${cmd.y}px`;
    highlight.style.width = `${cmd.width}px`;
    highlight.style.height = `${cmd.height}px`;
  } else if (cmd.kind === 'clear') {
    highlight.style.display = 'none';
  }
}
