import { BrowserChrome } from '@/chrome/BrowserChrome';
import { AccountCard } from '@/sidebar/AccountCard';
import { AgentPanel } from '@/sidebar/AgentPanel';
import { AppInfoFooter } from '@/sidebar/AppInfoFooter';

/** 앱 레이아웃 — 왼쪽 브라우징 영역(크롬 + 탭 콘텐츠), 오른쪽 에이전트 사이드바(할 일 실행·진행 단계) */
export default function App() {
  return (
    <div className="flex h-full">
      <main className="flex min-w-0 flex-1 flex-col" aria-label="브라우징 영역">
        <BrowserChrome />
      </main>
      <aside className="flex w-sidebar shrink-0 flex-col border-l border-border" aria-label="에이전트 사이드바">
        <AgentPanel accountSlot={<AccountCard />} />
        <AppInfoFooter />
      </aside>
    </div>
  );
}
