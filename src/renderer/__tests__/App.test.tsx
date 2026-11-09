import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TApprovalRequest } from '@shared/agent/run';
import type { TAgentEvent } from '@shared/ipc/agent';

import App from '../App';

const APPROVAL: TApprovalRequest = {
  requestId: 'req-1',
  stepN: 1,
  kind: 'guard',
  source: 'structure',
  reason: '확정 버튼',
  display: { action: '클릭', target: '예약 확정' },
  modelNote: null,
};

/** 앱 정보·탭 목록 응답을 깔고 App 을 그린다 */
async function renderApp(): Promise<void> {
  vi.mocked(window.api.app.getInfo).mockResolvedValue({
    ok: true,
    data: { name: 'myBrowser', version: '0.1.0', mode: 'test' },
  });
  vi.mocked(window.api.tabs.list).mockResolvedValue({ ok: true, data: { tabList: [], activeTabId: null } });
  render(<App />);
  await screen.findByText('myBrowser v0.1.0 · 테스트');
  sidebarElement = null;
  getSidebarElement();
}

/** 사이드바 요소 — hidden 이 되면 역할 질의로 찾을 수 없으므로 열려 있을 때 한 번 찾아 둔다 */
let sidebarElement: HTMLElement | null = null;
function getSidebarElement(): HTMLElement {
  sidebarElement ??= screen.getByRole('complementary', { name: '에이전트 사이드바' });
  return sidebarElement;
}

function getToggle(): HTMLElement {
  return screen.getByRole('button', { name: '에이전트' });
}

/** 할 일을 실행해 run-1 을 세우고 이벤트 리스너를 돌려준다 */
async function startRun(): Promise<(event: TAgentEvent) => void> {
  vi.mocked(window.api.agent.start).mockResolvedValue({ ok: true, data: { runId: 'run-1' } });
  const sidebar = getSidebarElement();
  fireEvent.change(within(sidebar).getByRole('textbox', { name: '할 일' }), { target: { value: '예약해줘' } });
  fireEvent.click(within(sidebar).getByRole('button', { name: '작업 실행' }));
  await within(sidebar).findByRole('button', { name: '작업 중지' });
  const listener = vi.mocked(window.api.agent.onEvent).mock.calls[0]?.[0];
  if (!listener) throw new Error('onEvent 가 구독되지 않았습니다');
  return listener;
}

/** 승인 대기 이벤트를 보낸다 */
function emitApproval(emit: (event: TAgentEvent) => void): void {
  act(() => {
    emit({ type: 'status', runId: 'run-1', status: 'waiting_user' });
    emit({ type: 'approval_required', runId: 'run-1', request: APPROVAL });
  });
}

/** main 이 판정한 toggleSidebar 단축키를 보낸다 — App·BrowserChrome 이 각각 구독하므로 모든 리스너에 */
function pressToggleShortcut(): void {
  const listenerList = vi.mocked(window.api.shortcut.onPressed).mock.calls.map(([listener]) => listener);
  if (listenerList.length === 0) throw new Error('onPressed 가 구독되지 않았습니다');
  act(() => {
    for (const listener of listenerList) listener({ action: 'toggleSidebar' });
  });
}

/** jsdom 에 없는 ResizeObserver 대역 — 콘텐츠 영역 bounds 훅이 쓴다 */
class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('브라우저 크롬의 탭 목록과 사이드바 "에이전트" 제목을 보여준다', async () => {
    vi.mocked(window.api.app.getInfo).mockResolvedValue({
      ok: true,
      data: { name: 'myBrowser', version: '0.1.0', mode: 'test' },
    });
    vi.mocked(window.api.tabs.list).mockResolvedValue({ ok: true, data: { tabList: [], activeTabId: null } });
    render(<App />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '에이전트' })).toBeInTheDocument();
    expect(await screen.findByText('myBrowser v0.1.0 · 테스트')).toBeInTheDocument();
  });

  it('Linux 가 아니면 루트에 창 모양 속성이 없다 — OS 가 모서리를 그린다 (spec 014)', async () => {
    await renderApp();
    expect(screen.getByRole('main', { name: '브라우징 영역' })).not.toHaveAttribute('data-window-frame');
  });

  it('사이드바에 할 일 입력창·작업 실행 버튼·빈 상태 안내를 보여준다', async () => {
    vi.mocked(window.api.app.getInfo).mockResolvedValue({
      ok: true,
      data: { name: 'myBrowser', version: '0.1.0', mode: 'test' },
    });
    vi.mocked(window.api.tabs.list).mockResolvedValue({ ok: true, data: { tabList: [], activeTabId: null } });
    render(<App />);
    const sidebar = screen.getByRole('complementary', { name: '에이전트 사이드바' });
    expect(within(sidebar).getByRole('textbox', { name: '할 일' })).toBeInTheDocument();
    expect(within(sidebar).getByRole('button', { name: '작업 실행' })).toBeInTheDocument();
    expect(within(sidebar).getByText('할 일을 입력하면 여기에 진행 상황이 표시됩니다')).toBeInTheDocument();
    expect(
      within(sidebar)
        .getAllByRole('heading')
        .map((heading) => heading.textContent),
    ).toEqual(['에이전트']);
    await screen.findByText('myBrowser v0.1.0 · 테스트');
  });

  describe('사이드바 열기·닫기 (spec 011)', () => {
    it('[사이드바 닫기] 로 숨기고 [에이전트] 로 다시 연다', async () => {
      await renderApp();
      expect(getToggle()).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: '사이드바 닫기' }));
      expect(getSidebarElement()).not.toBeVisible();
      expect(getToggle()).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(getToggle());
      expect(getSidebarElement()).toBeVisible();
    });

    it('닫았다 열어도 입력 중이던 글자가 남아 있다', async () => {
      await renderApp();
      fireEvent.change(screen.getByRole('textbox', { name: '할 일' }), { target: { value: '쓰던 글' } });
      fireEvent.click(screen.getByRole('button', { name: '사이드바 닫기' }));
      fireEvent.click(getToggle());
      expect(screen.getByRole('textbox', { name: '할 일' })).toHaveValue('쓰던 글');
    });

    it('닫힌 동안 승인 요청이 오면 자동으로 보이고 [거부] 에 포커스가 간다', async () => {
      await renderApp();
      const emit = await startRun();
      fireEvent.click(screen.getByRole('button', { name: '사이드바 닫기' }));
      expect(getSidebarElement()).not.toBeVisible();
      emitApproval(emit);
      expect(getSidebarElement()).toBeVisible();
      await waitFor(() => expect(screen.getByRole('button', { name: '거부' })).toHaveFocus());
    });

    it('자동으로 보인 패널에서 [에이전트] 는 눌린 상태이고, 누르면 숨겨지고 확인 필요 점이 생긴다', async () => {
      await renderApp();
      const emit = await startRun();
      fireEvent.click(screen.getByRole('button', { name: '사이드바 닫기' }));
      emitApproval(emit);
      expect(getToggle()).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(getToggle());
      expect(getSidebarElement()).not.toBeVisible();
      expect(getToggle()).toHaveAccessibleDescription('확인 필요');
    });

    it('승인 대기 중 닫기·열기를 해도 승인 결정을 보내지 않는다', async () => {
      await renderApp();
      const emit = await startRun();
      emitApproval(emit);
      fireEvent.click(screen.getByRole('button', { name: '사이드바 닫기' }));
      fireEvent.click(getToggle());
      fireEvent.click(screen.getByRole('button', { name: '사이드바 닫기' }));
      fireEvent.click(getToggle());
      expect(screen.getByRole('alertdialog', { name: '승인 필요' })).toBeVisible();
      expect(window.api.agent.approve).not.toHaveBeenCalled();
    });

    it('자동으로 보인 패널에서 결정하면 결정이 끝난 뒤에도 열려 있다', async () => {
      await renderApp();
      const emit = await startRun();
      fireEvent.click(screen.getByRole('button', { name: '사이드바 닫기' }));
      emitApproval(emit);
      vi.mocked(window.api.agent.approve).mockResolvedValue({ ok: true, data: null });
      fireEvent.click(screen.getByRole('button', { name: '거부' }));
      await waitFor(() => expect(window.api.agent.approve).toHaveBeenCalledOnce());
      act(() => emit({ type: 'approval_resolved', runId: 'run-1', requestId: 'req-1', decision: 'denied' }));
      await waitFor(() => expect(getToggle()).toHaveAttribute('aria-pressed', 'true'));
      expect(getSidebarElement()).toBeVisible();
    });
  });

  describe('단축키 토글·폭 조절 (spec 012)', () => {
    it('toggleSidebar 단축키로 닫고 다시 연다', async () => {
      await renderApp();
      pressToggleShortcut();
      expect(getSidebarElement()).not.toBeVisible();
      expect(getToggle()).toHaveAttribute('aria-pressed', 'false');
      pressToggleShortcut();
      expect(getSidebarElement()).toBeVisible();
      expect(getToggle()).toHaveAttribute('aria-pressed', 'true');
    });

    it('승인 대기 중 단축키로 닫으면 숨겨지고 확인 필요 점이 생긴다', async () => {
      await renderApp();
      const emit = await startRun();
      emitApproval(emit);
      pressToggleShortcut();
      expect(getSidebarElement()).not.toBeVisible();
      expect(getToggle()).toHaveAccessibleDescription('확인 필요');
    });

    it('승인 대기 중 단축키로 닫기·열기를 해도 승인 결정을 보내지 않는다', async () => {
      await renderApp();
      const emit = await startRun();
      emitApproval(emit);
      pressToggleShortcut();
      pressToggleShortcut();
      expect(screen.getByRole('alertdialog', { name: '승인 필요' })).toBeVisible();
      expect(window.api.agent.approve).not.toHaveBeenCalled();
    });

    it('폭 손잡이를 ← 로 조절하면 사이드바 폭 토큰이 바뀌고 저장된다', async () => {
      await renderApp();
      const handle = screen.getByRole('separator', { name: '사이드바 폭 조절' });
      expect(handle).toHaveAttribute('aria-valuenow', '360');
      fireEvent.keyDown(handle, { key: 'ArrowLeft' });
      expect(handle).toHaveAttribute('aria-valuenow', '376');
      expect(getSidebarElement().style.getPropertyValue('--sidebar-width')).toBe('376px');
      expect(JSON.parse(localStorage.getItem('mybrowser:layout') ?? 'null')).toEqual({
        isSidebarOpen: true,
        sidebarWidth: 376,
      });
    });

    it('저장된 폭으로 사이드바를 그린다', async () => {
      localStorage.setItem('mybrowser:layout', JSON.stringify({ isSidebarOpen: true, sidebarWidth: 500 }));
      await renderApp();
      expect(getSidebarElement().style.getPropertyValue('--sidebar-width')).toBe('500px');
    });
  });
});
