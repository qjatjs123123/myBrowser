/**
 * [spec 014] Linux 둥근 창 — 플랫폼 판정을 Linux 로 고정해 루트의 창 모양 속성을 본다.
 * isLinuxPlatform 은 모듈을 불러올 때 한 번 정해지므로 별도 파일에서 mock 한다 (BrowserChrome 의 isMacPlatform 은 원래 함수).
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TWindowState } from '@shared/ipc/window';

import App from '../App';

vi.mock('@/utils/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/platform')>()),
  isLinuxPlatform: () => true,
}));

/** jsdom 에 없는 ResizeObserver 대역 — 콘텐츠 영역 bounds 훅이 쓴다 (App.test 와 같음) */
class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

async function renderApp(): Promise<HTMLElement> {
  vi.mocked(window.api.app.getInfo).mockResolvedValue({
    ok: true,
    data: { name: 'myBrowser', version: '0.1.0', mode: 'test' },
  });
  vi.mocked(window.api.tabs.list).mockResolvedValue({ ok: true, data: { tabList: [], activeTabId: null } });
  render(<App />);
  await screen.findByText('myBrowser v0.1.0 · 테스트');
  return screen.getByRole('main', { name: '브라우징 영역' });
}

function emitWindowState(state: TWindowState): void {
  const listener = vi.mocked(window.api.window.onStateChanged).mock.calls[0]?.[0];
  if (!listener) throw new Error('onStateChanged 가 구독되지 않았습니다');
  act(() => listener(state));
}

describe('App — Linux 둥근 창 (spec 014)', () => {
  beforeEach(() => vi.stubGlobal('ResizeObserver', FakeResizeObserver));
  afterEach(() => vi.unstubAllGlobals());

  it('처음에는 루트가 둥근 창 모양이다', async () => {
    const root = await renderApp();
    expect(root).toHaveAttribute('data-window-frame', 'rounded');
  });

  it('최대화되면 직각, 풀리면 다시 둥글게', async () => {
    const root = await renderApp();
    emitWindowState({ isMaximized: true });
    expect(root).toHaveAttribute('data-window-frame', 'square');
    emitWindowState({ isMaximized: false });
    expect(root).toHaveAttribute('data-window-frame', 'rounded');
  });

  it('루트는 항상 앱 배경색을 그린다 — body 가 투명해도 비치지 않게', async () => {
    const root = await renderApp();
    expect(root).toHaveClass('bg-background');
  });

  it('최대화가 아니면 가장자리 손잡이 8개와 탭 콘텐츠 여백이 있다 (spec 016)', async () => {
    await renderApp();
    expect(screen.getAllByTestId('window-resize-edge')).toHaveLength(8);
    expect(screen.getByTestId('tab-content-row')).toHaveClass('pl-1', 'pb-1');
  });

  it('최대화되면 손잡이와 여백이 없어지고, 풀리면 다시 생긴다 (spec 016)', async () => {
    await renderApp();
    emitWindowState({ isMaximized: true });
    expect(screen.queryAllByTestId('window-resize-edge')).toHaveLength(0);
    expect(screen.getByTestId('tab-content-row')).not.toHaveClass('pl-1');
    emitWindowState({ isMaximized: false });
    expect(screen.getAllByTestId('window-resize-edge')).toHaveLength(8);
  });

  it('탭 줄은 CSS 드래그 영역 대신 앱이 끌기를 처리한다 (spec 016)', async () => {
    await renderApp();
    expect(screen.getByTestId('window-top-bar')).not.toHaveClass('[-webkit-app-region:drag]');
  });
});
