import { type CSSProperties, useState } from 'react';

import type { TIpcResult } from '@shared/ipc/result';

import { AgentToggleButton } from '@/chrome/AgentToggleButton';
import { BrowserChrome } from '@/chrome/BrowserChrome';
import { SidebarResizer } from '@/chrome/SidebarResizer';
import { WindowResizeEdges } from '@/chrome/WindowResizeEdges';
import { type TAgentRun, useAgentRun } from '@/hooks/useAgentRun';
import { useShortcut } from '@/hooks/useShortcut';
import { SIDEBAR_WIDTH, useSidebarOpen } from '@/hooks/useSidebarOpen';
import { useWindowControls } from '@/hooks/useWindowControls';
import { useWindowPointer } from '@/hooks/useWindowPointer';
import { useWindowState } from '@/hooks/useWindowState';
import { AccountCard } from '@/sidebar/AccountCard';
import { AgentPanel } from '@/sidebar/AgentPanel';
import { AppInfoFooter } from '@/sidebar/AppInfoFooter';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { isLinuxPlatform } from '@/utils/platform';

/** Linux 는 앱이 창 모서리를 둥글게 그린다 — 최대화·전체 화면이면 직각 (spec 014) */
const IS_ROUNDED_FRAME = isLinuxPlatform(navigator.userAgent);
/** 둥근 창 루트 — 반지름·잘라내기 + 레이아웃을 밀지 않는 1px 테두리 덧그림 */
const ROUNDED_FRAME_CLASS =
  'data-[window-frame=rounded]:overflow-hidden data-[window-frame=rounded]:rounded-[var(--window-radius)] data-[window-frame=rounded]:after:pointer-events-none data-[window-frame=rounded]:after:absolute data-[window-frame=rounded]:after:inset-0 data-[window-frame=rounded]:after:z-50 data-[window-frame=rounded]:after:rounded-[inherit] data-[window-frame=rounded]:after:border data-[window-frame=rounded]:after:border-border';

/**
 * 앱 레이아웃 — 탭 줄·툴바는 창 전체 폭, 그 아래 [탭 콘텐츠 | 에이전트 사이드바] (spec 011).
 * run 을 여기서 한 번 구독해 사이드바와 툴바 [에이전트] 버튼이 같은 상태를 본다.
 * 패널 보임 = 열어 둠 || 아직 닫지 않은 승인·질문 대기 (렌더 중 계산 — 카드가 보이는 채로 마운트돼 거부 포커스가 잡힌다).
 * 폭은 손잡이로 조절해 `--sidebar-width` 만 덮어쓰고, Ctrl+Shift+A(toggleSidebar)는 [에이전트] 버튼과 같다 (spec 012).
 */
export default function App() {
  const run = useAgentRun();
  const { isOpen, setIsOpen, width, setWidth } = useSidebarOpen();
  const { isMaximized } = useWindowState();
  const windowPointer = useWindowPointer({ onError: toast.error });
  const windowControls = useWindowControls();
  // Linux 는 창 이동·최대화 토글·크기 조절을 앱이 처리한다 — WSLg 가 CSS 드래그 영역을 처리하지 않는다 (spec 016)
  const hasResizeEdges = IS_ROUNDED_FRAME && !isMaximized;
  const windowDrag = IS_ROUNDED_FRAME
    ? {
        onPointerDown: windowPointer.handlePointerDown.bind(null, 'move'),
        onDoubleClick: () => void notifyFailure(windowControls.toggleMaximize()),
      }
    : undefined;
  const [dismissedRequestId, setDismissedRequestId] = useState<string | null>(null);
  const pendingRequestId = getPendingRequestId(run);
  const isPanelVisible = isOpen || (pendingRequestId !== null && pendingRequestId !== dismissedRequestId);
  const needsAttention = pendingRequestId !== null && !isPanelVisible;

  const closePanel = () => {
    setIsOpen(false);
    if (pendingRequestId !== null) setDismissedRequestId(pendingRequestId);
  };
  const togglePanel = () => (isPanelVisible ? closePanel() : setIsOpen(true));
  useShortcut((action) => {
    if (action === 'toggleSidebar') togglePanel();
  });

  return (
    <main
      className={cn('relative flex h-full min-w-0 flex-col bg-background', ROUNDED_FRAME_CLASS)}
      aria-label="브라우징 영역"
      data-window-frame={getWindowFrame(isMaximized)}
    >
      {hasResizeEdges && <WindowResizeEdges onPointerDown={windowPointer.handlePointerDown} />}
      <BrowserChrome
        windowDrag={windowDrag}
        hasEdgeInset={hasResizeEdges}
        toolbarEnd={
          <AgentToggleButton isPressed={isPanelVisible} needsAttention={needsAttention} onToggle={togglePanel} />
        }
        sidePanel={
          <aside
            hidden={!isPanelVisible}
            className="relative flex w-sidebar shrink-0 flex-col border-l border-border"
            style={toSidebarStyle(width)}
            aria-label="에이전트 사이드바"
          >
            <SidebarResizer
              width={width}
              minWidth={SIDEBAR_WIDTH.min}
              maxWidth={SIDEBAR_WIDTH.max}
              onResize={setWidth}
            />
            <AgentPanel
              run={run}
              accountSlot={<AccountCard />}
              onClose={closePanel}
              onRequestHandled={() => setIsOpen(true)}
            />
            <AppInfoFooter />
          </aside>
        }
      />
    </main>
  );
}

/** 답을 기다리는 승인·질문의 requestId — 없으면 null */
function getPendingRequestId({ pendingApproval, pendingQuestion }: TAgentRun): string | null {
  return pendingApproval?.requestId ?? pendingQuestion?.requestId ?? null;
}

/** 사이드바 폭 토큰 덮어쓰기 — inline style 의 유일한 예외 (react-convention, spec 012) */
function toSidebarStyle(width: number): CSSProperties & { '--sidebar-width': string } {
  return { '--sidebar-width': `${width}px` };
}

/** 루트의 창 모양 — Linux 가 아니면 속성 없음(OS 가 모서리를 그린다) */
function getWindowFrame(isMaximized: boolean): 'rounded' | 'square' | undefined {
  if (!IS_ROUNDED_FRAME) return undefined;
  return isMaximized ? 'square' : 'rounded';
}

/** IPC 결과가 실패면 main 의 메시지를 toast 로 보여준다 */
async function notifyFailure(task: Promise<TIpcResult<unknown>>): Promise<void> {
  const result = await task;
  if (!result.ok) toast.error(result.error.message);
}
