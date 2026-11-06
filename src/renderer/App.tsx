import { useState } from 'react';

import { AgentToggleButton } from '@/chrome/AgentToggleButton';
import { BrowserChrome } from '@/chrome/BrowserChrome';
import { type TAgentRun, useAgentRun } from '@/hooks/useAgentRun';
import { useSidebarOpen } from '@/hooks/useSidebarOpen';
import { AccountCard } from '@/sidebar/AccountCard';
import { AgentPanel } from '@/sidebar/AgentPanel';
import { AppInfoFooter } from '@/sidebar/AppInfoFooter';

/**
 * 앱 레이아웃 — 탭 줄·툴바는 창 전체 폭, 그 아래 [탭 콘텐츠 | 에이전트 사이드바] (spec 011).
 * run 을 여기서 한 번 구독해 사이드바와 툴바 [에이전트] 버튼이 같은 상태를 본다.
 * 패널 보임 = 열어 둠 || 아직 닫지 않은 승인·질문 대기 (렌더 중 계산 — 카드가 보이는 채로 마운트돼 거부 포커스가 잡힌다).
 */
export default function App() {
  const run = useAgentRun();
  const [isOpen, setIsOpen] = useSidebarOpen();
  const [dismissedRequestId, setDismissedRequestId] = useState<string | null>(null);
  const pendingRequestId = getPendingRequestId(run);
  const isPanelVisible = isOpen || (pendingRequestId !== null && pendingRequestId !== dismissedRequestId);
  const needsAttention = pendingRequestId !== null && !isPanelVisible;

  const closePanel = () => {
    setIsOpen(false);
    if (pendingRequestId !== null) setDismissedRequestId(pendingRequestId);
  };
  const togglePanel = () => (isPanelVisible ? closePanel() : setIsOpen(true));

  return (
    <main className="flex h-full min-w-0 flex-col" aria-label="브라우징 영역">
      <BrowserChrome
        toolbarEnd={
          <AgentToggleButton isPressed={isPanelVisible} needsAttention={needsAttention} onToggle={togglePanel} />
        }
        sidePanel={
          <aside
            hidden={!isPanelVisible}
            className="flex w-sidebar shrink-0 flex-col border-l border-border"
            aria-label="에이전트 사이드바"
          >
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
