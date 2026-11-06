import { zodResolver } from '@hookform/resolvers/zod';
import { useId } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import type { TIpcResult } from '@shared/ipc/result';
import { SKILL_BODY_MAX, type TSkill } from '@shared/ipc/skills';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';

import {
  SKILL_EDITOR_MESSAGE,
  SkillEditorFormSchema,
  type TSkillEditorFormInput,
  type TSkillEditorFormValues,
} from './skillEditorValidation';

const SENSITIVE_HINT = '비밀번호·카드번호 같은 민감 정보는 적지 마세요';

interface ISkillEditorProps {
  /** 고칠 스킬 — null 이면 새 스킬 */
  skill: TSkill | null;
  /** [저장] — 결과 봉투를 돌려준다 (성공하면 부모가 목록으로 돌아간다) */
  onSave: (values: TSkillEditorFormValues) => Promise<TIpcResult<unknown>>;
  /** [취소] */
  onCancel: () => void;
}

/**
 * 스킬 편집 폼 — 이름·설명·내용 + 글자 수·민감 정보 안내 (spec 013 FR-4).
 * 칸 오류는 아래 문구(aria-invalid·aria-describedby) + 제출이 막히면 toast 1개, 저장 실패는 main 메시지로 toast 하고 폼을 그대로 둔다.
 */
export function SkillEditor({ skill, onSave, onCancel }: ISkillEditorProps) {
  const idPrefix = useId();
  const { register, handleSubmit, control, formState } = useForm<
    TSkillEditorFormInput,
    unknown,
    TSkillEditorFormValues
  >({
    resolver: zodResolver(SkillEditorFormSchema),
    defaultValues: { name: skill?.name ?? '', description: skill?.description ?? '', body: skill?.body ?? '' },
  });
  const body = useWatch({ control, name: 'body' }) ?? '';
  const { errors, isSubmitting } = formState;
  const fieldId = (name: keyof TSkillEditorFormInput) => `${idPrefix}-${name}`;
  const errorId = (name: keyof TSkillEditorFormInput) => `${idPrefix}-${name}-error`;

  const handleValid = async (values: TSkillEditorFormValues) => {
    const result = await onSave(values);
    if (!result.ok) toast.error(result.error.message);
  };

  const handleInvalid = () => toast.error(SKILL_EDITOR_MESSAGE.invalidSubmit);

  return (
    <form
      aria-label="스킬 편집"
      noValidate
      onSubmit={(event) => void handleSubmit(handleValid, handleInvalid)(event)}
      className="flex flex-col gap-3 px-1"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId('name')} className="text-sm font-medium">
          이름
        </label>
        <Input
          id={fieldId('name')}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? errorId('name') : undefined}
          {...register('name')}
        />
        <FieldError id={errorId('name')} message={errors.name?.message} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId('description')} className="text-sm font-medium">
          설명 <span className="font-normal text-muted-foreground">(선택)</span>
        </label>
        <Input
          id={fieldId('description')}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? errorId('description') : undefined}
          {...register('description')}
        />
        <FieldError id={errorId('description')} message={errors.description?.message} />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor={fieldId('body')} className="text-sm font-medium">
            내용
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {body.length} / {SKILL_BODY_MAX}
          </span>
        </div>
        <Textarea
          id={fieldId('body')}
          rows={6}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={errors.body ? `${errorId('body')} ${idPrefix}-hint` : `${idPrefix}-hint`}
          className="max-h-80"
          {...register('body')}
        />
        <FieldError id={errorId('body')} message={errors.body?.message} />
        <p id={`${idPrefix}-hint`} className="text-xs text-muted-foreground">
          {SENSITIVE_HINT}
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          저장
        </Button>
      </div>
    </form>
  );
}

interface IFieldErrorProps {
  id: string;
  message: string | undefined;
}

/** 칸 아래 오류 문구 — 없으면 그리지 않는다 */
function FieldError({ id, message }: IFieldErrorProps) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}
