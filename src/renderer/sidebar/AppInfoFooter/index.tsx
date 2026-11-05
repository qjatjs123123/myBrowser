import type { TAppMode } from '@shared/ipc/app';

import { useAppInfo } from '@/hooks/useAppInfo';

const MODE_LABEL: Record<TAppMode, string> = {
  development: '개발',
  test: '테스트',
  production: '배포',
};

/** 사이드바 하단 — 앱 이름·버전·실행 모드 */
export function AppInfoFooter() {
  const state = useAppInfo();

  return (
    <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground" aria-label="앱 정보">
      {(() => {
        if (state.status === 'loading') return <span>앱 정보 불러오는 중…</span>;
        if (state.status === 'error') return <span className="text-destructive">{state.message}</span>;
        const { name, version, mode } = state.info;
        return <span>{`${name} v${version} · ${MODE_LABEL[mode]}`}</span>;
      })()}
    </footer>
  );
}
