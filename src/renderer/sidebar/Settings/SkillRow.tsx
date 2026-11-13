import { Pencil, Trash2 } from 'lucide-react';

import type { TSkill } from '@shared/ipc/skills';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

interface ISkillRowProps {
  skill: TSkill;
  /** 켜기 스위치 — 바뀔 값 */
  onToggle: (isEnabled: boolean) => void;
  /** [편집] */
  onEdit: () => void;
  /** 확인 창에서 [삭제] 를 눌렀을 때 */
  onDelete: () => void;
}

/**
 * 스킬 한 줄 — 이름 + 설명(한 줄 말줄임) + 켜기 스위치 + [편집] + [삭제] (spec 013 FR-3·FR-5).
 * [삭제] 는 확인 창을 거치고, 확인 창의 기본 포커스는 [취소] (radix AlertDialog 기본).
 */
export function SkillRow({ skill, onToggle, onEdit, onDelete }: ISkillRowProps) {
  return (
    <div className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 py-2 transition-colors duration-150 hover:bg-muted">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm">{skill.name}</span>
        {skill.description && <span className="truncate text-xs text-muted-foreground">{skill.description}</span>}
      </div>
      <Switch aria-label={`${skill.name} 사용`} checked={skill.isEnabled} onCheckedChange={onToggle} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`${skill.name} 편집`}
        title="편집"
        onClick={onEdit}
        className="text-muted-foreground"
      >
        <Pencil />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${skill.name} 삭제`}
            title="삭제"
            className="text-muted-foreground"
          >
            <Trash2 />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>스킬을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              ‘{skill.name}’ 스킬이 지워지고 다음 실행부터 적용되지 않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
