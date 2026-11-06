import { Plus, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { TSkill } from '@shared/ipc/skills';

import { Button } from '@/components/ui/button';
import { useSkills } from '@/hooks/useSkills';
import { toast } from '@/lib/toast';

import { SkillEditor } from './SkillEditor';
import type { TSkillEditorFormValues } from './skillEditorValidation';
import { SkillRow } from './SkillRow';

const EMPTY_TEXT = '아직 스킬이 없습니다';
const LOADING_TEXT = '스킬을 불러오는 중…';
const FAILED_TEXT = '스킬을 불러오지 못했습니다';

type TEditorState = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; skill: TSkill };

/**
 * 스킬 섹션 본문 — 목록 ↔ 편집 폼 전환 (spec 013 FR-3~6). 열 때(마운트)마다 목록을 새로 읽고,
 * 저장·토글·삭제는 main 이 돌려준 최신 목록으로 바꾼다. IPC 실패는 main 메시지로 toast.
 */
export function SkillList() {
  const skills = useSkills();
  const [editor, setEditor] = useState<TEditorState>({ kind: 'closed' });
  const { loadError } = skills;

  useEffect(() => {
    if (loadError) toast.error(loadError.message);
  }, [loadError]);

  const handleSave = async (values: TSkillEditorFormValues) => {
    const result =
      editor.kind === 'edit' ? await skills.update({ id: editor.skill.id, ...values }) : await skills.create(values);
    if (result.ok) setEditor({ kind: 'closed' });
    return result;
  };

  const handleToggle = async (id: string, isEnabled: boolean) => {
    const result = await skills.update({ id, isEnabled });
    if (!result.ok) toast.error(result.error.message);
  };

  const handleDelete = async (id: string) => {
    const result = await skills.remove(id);
    if (!result.ok) toast.error(result.error.message);
  };

  if (editor.kind !== 'closed') {
    const skill = editor.kind === 'edit' ? editor.skill : null;
    return (
      <SkillEditor
        key={skill?.id ?? 'new'}
        skill={skill}
        onSave={handleSave}
        onCancel={() => setEditor({ kind: 'closed' })}
      />
    );
  }
  if (skills.status === 'loading') {
    return (
      <p role="status" className="px-2 py-4 text-center text-sm text-muted-foreground">
        {LOADING_TEXT}
      </p>
    );
  }
  if (skills.status === 'error') return <LoadFailed onRetry={skills.reload} />;
  return (
    <div className="flex flex-col gap-2">
      {skills.skillList.length === 0 ? (
        <p className="px-2 py-4 text-center text-sm text-muted-foreground">{EMPTY_TEXT}</p>
      ) : (
        <ul role="list" aria-label="스킬 목록" className="flex flex-col gap-0.5">
          {skills.skillList.map((skill) => (
            <li key={skill.id}>
              <SkillRow
                skill={skill}
                onToggle={(isEnabled) => void handleToggle(skill.id, isEnabled)}
                onEdit={() => setEditor({ kind: 'edit', skill })}
                onDelete={() => void handleDelete(skill.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" className="self-start" onClick={() => setEditor({ kind: 'create' })}>
        <Plus aria-hidden />
        스킬 추가
      </Button>
    </div>
  );
}

interface ILoadFailedProps {
  onRetry: () => void;
}

/** 목록 읽기 실패 자리 — [다시 시도] */
function LoadFailed({ onRetry }: ILoadFailedProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-4 text-center text-sm text-muted-foreground">
      <p>{FAILED_TEXT}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw aria-hidden />
        다시 시도
      </Button>
    </div>
  );
}
