import { type LucideIcon, Minus, Plus, X } from 'lucide-react';

import type { TIpcResult } from '@shared/ipc/result';

import { useWindowControls } from '@/hooks/useWindowControls';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

interface IWindowControlsProps {
  /** macOS 면 네이티브 신호등이 그 자리에 그려지므로 빈 자리만 둔다 */
  isMac: boolean;
}

/**
 * 창 신호등 (spec 010 FR-3·4) — Linux·Windows 는 닫기·최소화·최대화 원 3개를 직접 그리고(묶음에 마우스를 올리면 ×·−·+),
 * macOS 는 네이티브 신호등 자리만 비워 둔다. 드래그 영역 안이라 no-drag.
 */
export function WindowControls({ isMac }: IWindowControlsProps) {
  const controls = useWindowControls();
  if (isMac) return <div aria-hidden className="w-[72px] shrink-0" />;
  return (
    <div className="group/traffic flex shrink-0 items-center gap-0.5 px-2.5 [-webkit-app-region:no-drag]">
      <TrafficButton label="창 닫기" Glyph={X} colorClass="bg-traffic-close" onClick={controls.close} />
      <TrafficButton label="창 최소화" Glyph={Minus} colorClass="bg-traffic-minimize" onClick={controls.minimize} />
      <TrafficButton
        label="창 최대화"
        Glyph={Plus}
        colorClass="bg-traffic-maximize"
        onClick={controls.toggleMaximize}
      />
    </div>
  );
}

interface ITrafficButtonProps {
  label: string;
  Glyph: LucideIcon;
  colorClass: string;
  onClick: () => Promise<TIpcResult<null>>;
}

/** 신호등 한 개 — 12px 원, 클릭 영역 20px. 실패는 main 의 메시지로 toast */
function TrafficButton({ label, Glyph, colorClass, onClick }: ITrafficButtonProps) {
  const handleClick = async () => {
    const result = await onClick();
    if (!result.ok) toast.error(result.error.message);
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => void handleClick()}
      className="flex size-5 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={cn('flex size-3 items-center justify-center rounded-full', colorClass)}>
        <Glyph
          aria-hidden
          strokeWidth={3}
          className="size-2 text-traffic-glyph opacity-0 transition-opacity duration-150 group-hover/traffic:opacity-100"
        />
      </span>
    </button>
  );
}
