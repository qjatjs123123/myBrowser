import { AppInfoFooter } from '@/sidebar/AppInfoFooter';

/** 앱 레이아웃 — 왼쪽 브라우징 영역, 오른쪽 에이전트 사이드바 (자리만, 내용은 다음 spec) */
export default function App() {
  return (
    <div className="flex h-full">
      <main className="flex min-w-0 flex-1 flex-col" aria-label="브라우징 영역">
        <header className="flex h-[76px] items-end border-b border-border bg-muted px-3 pb-2">
          <h1 className="text-sm font-medium">새 탭</h1>
        </header>
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          탭이 여기에 표시됩니다
        </div>
      </main>
      <aside className="flex w-sidebar shrink-0 flex-col border-l border-border" aria-label="에이전트 사이드바">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">에이전트</h2>
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
          할 일을 입력하면 여기에 진행 상황이 표시됩니다
        </div>
        <AppInfoFooter />
      </aside>
    </div>
  );
}
