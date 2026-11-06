import { z } from 'zod';

import { SKILL_BODY_MAX, SKILL_DESCRIPTION_MAX, SKILL_NAME_MAX } from '@shared/ipc/skills';

/** 스킬 편집 폼의 사용자 문구 (spec 013 FR-4) */
export const SKILL_EDITOR_MESSAGE = {
  nameRequired: '이름을 입력해 주세요',
  nameTooLong: `이름은 ${SKILL_NAME_MAX}자까지 쓸 수 있습니다`,
  descriptionTooLong: `설명은 ${SKILL_DESCRIPTION_MAX}자까지 쓸 수 있습니다`,
  bodyRequired: '내용을 입력해 주세요',
  bodyTooLong: `내용은 ${SKILL_BODY_MAX}자까지 쓸 수 있습니다`,
  invalidSubmit: '입력한 내용을 확인해 주세요',
} as const;

/**
 * [스킬 편집 폼] 검증 — IPC 스키마(`@shared/ipc/skills`)를 재사용하지 않는다 (zod-usage §4: 폼은 사용자 문구, IPC 는 계약).
 * 상한만 같은 상수를 쓴다. 앞뒤 공백은 잘라서 넘긴다.
 */
export const SkillEditorFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, SKILL_EDITOR_MESSAGE.nameRequired)
    .max(SKILL_NAME_MAX, SKILL_EDITOR_MESSAGE.nameTooLong),
  description: z.string().trim().max(SKILL_DESCRIPTION_MAX, SKILL_EDITOR_MESSAGE.descriptionTooLong),
  body: z
    .string()
    .trim()
    .min(1, SKILL_EDITOR_MESSAGE.bodyRequired)
    .max(SKILL_BODY_MAX, SKILL_EDITOR_MESSAGE.bodyTooLong),
});

export type TSkillEditorFormInput = z.input<typeof SkillEditorFormSchema>;
export type TSkillEditorFormValues = z.output<typeof SkillEditorFormSchema>;
