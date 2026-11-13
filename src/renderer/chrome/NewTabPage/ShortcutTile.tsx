import { Button } from '@/components/ui/button';

export interface IShortcutTileProps {
  label: string;
  initial: string;
  onSelect: () => void;
}

/** 바로가기 타일 — 48px 원 안의 첫 글자 + 라벨. 접근 이름은 라벨만 */
export function ShortcutTile({ label, initial, onSelect }: IShortcutTileProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      title={label}
      onClick={onSelect}
      className="h-auto w-20 flex-col gap-2 rounded-lg px-1 py-2 text-xs font-normal"
    >
      <span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-full bg-muted text-base font-semibold text-muted-foreground"
      >
        {initial}
      </span>
      <span className="w-full truncate">{label}</span>
    </Button>
  );
}
