import { EllipsisVertical } from 'lucide-react';
import type { MouseEvent } from 'react';

import type { TShowMenuRequest } from '@shared/ipc/app';

import { Button } from '@/components/ui/button';

interface IMoreMenuButtonProps {
  /** 버튼 왼쪽 아래 좌표(창 기준 정수) — 그 자리에 네이티브 메뉴가 열린다 */
  onOpen: (point: TShowMenuRequest) => void;
}

/** 툴바 [메뉴] 세로 점 3개 (spec 023 FR-2·3) — 항목은 main 의 네이티브 팝업 */
export function MoreMenuButton({ onOpen }: IMoreMenuButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => onOpen(toMenuPoint(event.currentTarget.getBoundingClientRect()));
  return (
    <Button
      variant="ghost"
      aria-label="메뉴"
      aria-haspopup="menu"
      title="메뉴"
      onClick={handleClick}
      className="size-8 shrink-0 rounded-full p-0 text-muted-foreground"
    >
      <EllipsisVertical className="size-[18px]" />
    </Button>
  );
}

/** 사각형 왼쪽 아래를 0 이상 정수로 — IPC 스키마가 정수만 받는다 */
export function toMenuPoint(rect: Pick<DOMRect, 'left' | 'bottom'>): TShowMenuRequest {
  return { x: Math.max(0, Math.round(rect.left)), y: Math.max(0, Math.round(rect.bottom)) };
}
