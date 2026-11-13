import { DEFAULT_ZOOM_PERCENT } from '@shared/ipc/tabs';

import { Button } from '@/components/ui/button';

interface IZoomBadgeProps {
  zoomPercent: number;
  onReset: () => void;
}

/** 확대/축소 배율 버튼 (spec 021 FR-11) — 100% 가 아닐 때만 보이고 누르면 100% 로 */
export function ZoomBadge({ zoomPercent, onReset }: IZoomBadgeProps) {
  if (zoomPercent === DEFAULT_ZOOM_PERCENT) return null;
  const text = `${String(zoomPercent)}%`;
  return (
    <Button
      variant="ghost"
      aria-label={`확대/축소 ${text} — 눌러서 100%로`}
      title="100%로 되돌리기"
      onClick={onReset}
      className="h-8 shrink-0 rounded-full px-2 text-xs text-muted-foreground tabular-nums"
    >
      {text}
    </Button>
  );
}
