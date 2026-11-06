import { z } from 'zod';

/** [skills] 이름 최대 글자 수 (spec 013 FR-4) */
export const SKILL_NAME_MAX = 40;
/** [skills] 설명 최대 글자 수 */
export const SKILL_DESCRIPTION_MAX = 200;
/** [skills] 내용 최대 글자 수 */
export const SKILL_BODY_MAX = 4000;
/** [skills] 스킬 최대 개수 (FR-8) */
export const SKILL_COUNT_MAX = 30;
/** [skills] 켜진 스킬 내용 합 최대 글자 수 (FR-8) */
export const SKILL_ENABLED_BODY_TOTAL_MAX = 12000;

/** [skills] main 이 돌려주는 사용자 문장 — NOT_FOUND·CONFLICT·LIMIT */
export const SKILL_MESSAGE = {
  notFound: '스킬을 찾을 수 없습니다',
  duplicateName: '같은 이름의 스킬이 있습니다',
  tooMany: '스킬은 30개까지 만들 수 있습니다',
  tooLong: '켜진 스킬 내용이 너무 깁니다 (12000자까지)',
} as const;

const SkillIdSchema = z.string().uuid();
/** 줄바꿈 금지 — 시스템 프롬프트의 `## {이름}` 구조 보호 */
const SkillNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(SKILL_NAME_MAX)
  .regex(/^[^\r\n]+$/);
const SkillDescriptionSchema = z.string().trim().max(SKILL_DESCRIPTION_MAX);
const SkillBodySchema = z.string().trim().min(1).max(SKILL_BODY_MAX);

/** [skills] 저장된 스킬 한 건 — 사용자가 적은 지침 (새 실행 능력 없음, SR-1) */
export const SkillSchema = z.strictObject({
  id: SkillIdSchema,
  name: z.string(),
  description: z.string(),
  body: z.string(),
  isEnabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** [skills:list|create|update|delete] 응답 — 만든 순서의 전체 목록 */
export const SkillListResponseSchema = z.strictObject({
  skillList: z.array(SkillSchema).max(SKILL_COUNT_MAX),
});

/** [skills:create] 요청 — 새 스킬은 켜진 상태로 만든다 */
export const SkillCreateRequestSchema = z.strictObject({
  name: SkillNameSchema,
  description: SkillDescriptionSchema,
  body: SkillBodySchema,
});

/** [skills:update] 요청 — id 외에 바꿀 값이 하나 이상 있어야 한다 */
export const SkillUpdateRequestSchema = z
  .strictObject({
    id: SkillIdSchema,
    name: SkillNameSchema.optional(),
    description: SkillDescriptionSchema.optional(),
    body: SkillBodySchema.optional(),
    isEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 1, '바꿀 값이 없습니다');

/** [skills:delete] 요청 */
export const SkillDeleteRequestSchema = z.strictObject({ id: SkillIdSchema });

export type TSkill = z.infer<typeof SkillSchema>;
export type TSkillListResponse = z.infer<typeof SkillListResponseSchema>;
export type TSkillCreateRequest = z.infer<typeof SkillCreateRequestSchema>;
export type TSkillUpdateRequest = z.infer<typeof SkillUpdateRequestSchema>;
export type TSkillDeleteRequest = z.infer<typeof SkillDeleteRequestSchema>;

/** main 측 스킬 저장 결과 — 실패는 IPC 봉투와 같은 code·message 로 옮긴다 */
export type TSkillStoreResult =
  { ok: true; skillList: TSkill[] } | { ok: false; code: 'NOT_FOUND' | 'CONFLICT' | 'LIMIT'; message: string };

/** main 측 저장 포트 — store repo 가 구현, 핸들러·agent service 가 주입받는다 */
export interface ISkillStore {
  /** created_at 오름차순 (만든 순서) */
  list(): TSkill[];
  /** isEnabled 만, 같은 순서 */
  listEnabled(): TSkill[];
  create(input: TSkillCreateRequest): TSkillStoreResult;
  update(input: TSkillUpdateRequest): TSkillStoreResult;
  remove(id: string): TSkillStoreResult;
}
