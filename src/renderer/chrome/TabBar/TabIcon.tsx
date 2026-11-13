import { Globe, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface ITabIconProps {
  faviconUrl: string | null;
  isLoading: boolean;
}

/** 탭 왼쪽 16px 아이콘 — 로딩 중이면 스피너, 파비콘이 없거나 못 불러오면 기본 아이콘 */
export function TabIcon({ faviconUrl, isLoading }: ITabIconProps) {
  if (isLoading) return <Loader2 role="img" aria-label="로딩 중" className="size-4 shrink-0 animate-spin" />;
  if (faviconUrl === null) return <DefaultTabIcon />;
  // 파비콘 주소가 바뀌면 실패 상태를 새로 시작한다
  return <TabFavicon key={faviconUrl} faviconUrl={faviconUrl} />;
}

/** 파비콘 이미지 — 불러오기 실패하면 기본 아이콘으로 바꾼다 */
function TabFavicon({ faviconUrl }: { faviconUrl: string }) {
  const [hasFailed, setHasFailed] = useState(false);
  if (hasFailed) return <DefaultTabIcon />;
  return <img src={faviconUrl} alt="" className="size-4 shrink-0" onError={() => setHasFailed(true)} />;
}

/** 파비콘 대신 쓰는 기본 아이콘 */
function DefaultTabIcon() {
  return <Globe data-testid="tab-default-icon" aria-hidden className="size-4 shrink-0" />;
}
