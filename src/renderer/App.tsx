import { type CSSProperties, useState } from 'react';

import { AgentToggleButton } from '@/chrome/AgentToggleButton';
import { BrowserChrome } from '@/chrome/BrowserChrome';
import { SidebarResizer } from '@/chrome/SidebarResizer';
import { type TAgentRun, useAgentRun } from '@/hooks/useAgentRun';
import { useShortcut } from '@/hooks/useShortcut';
import { SIDEBAR_WIDTH, useSidebarOpen } from '@/hooks/useSidebarOpen';
import { AccountCard } from '@/sidebar/AccountCard';
import { AgentPanel } from '@/sidebar/AgentPanel';
import { AppInfoFooter } from '@/sidebar/AppInfoFooter';

/**
 * 앱 레이아웃 — 탭 줄·툴바는 창 전체 폭, 그 아래 [탭 콘텐츠 | 에이전트 사이드바] (spec 011).
 * run 을 여기서 한 번 구독해 사이드바와 툴바 [에이전트] 버튼이 같은 상태를 본다.
 * 패널 보임 = 열어 둠 || 아직 닫지 않은 승인·질문 대기 (렌더 중 계산 — 카드가 보이는 채로 마운트돼 거부 포커스가 잡힌다).
 * 폭은 손잡이로 조절해 `--sidebar-width` 만 덮어쓰고, Ctrl+Shift+A(toggleSidebar)는 [에이전트] 버튼과 같다 (spec 012).
 */
export default function App() {
  const run = useAgentRun();
  const { isOpen, setIsOpen, width, setWidth } = useSidebarOpen();
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
    <main className="flex h-full min-w-0 flex-col" aria-label="브라우징 영역">
      <BrowserChrome
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
