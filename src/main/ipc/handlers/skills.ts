import { z } from 'zod';

import { IPC } from '@shared/ipc/channels';
import { fail, ok, type TIpcResult } from '@shared/ipc/result';
import {
  SkillCreateRequestSchema,
  SkillDeleteRequestSchema,
  SkillListResponseSchema,
  SkillUpdateRequestSchema,
  type ISkillStore,
  type TSkillListResponse,
  type TSkillStoreResult,
} from '@shared/ipc/skills';

/** skills:list 는 요청 인자가 없다 */
const SkillListRequestSchema = z.undefined();

const INVALID_MESSAGE = '요청 형식이 올바르지 않습니다';

/**
 * [skills 핸들러] 스킬 4채널 (spec 013) — renderer 값은 strict 스키마로 검증하고(SR-4), 판정은 저장소가 한다.
 * 응답은 보내기 전에 parse — 계약과 어긋나면 throw → registry 가 INTERNAL 로 감싼다.
 * 규칙: .claude/rules/electron/ipc.md 「핸들러」
 */
export function createSkillsHandlers(store: ISkillStore) {
  return {
    [IPC.skills.list]: (raw?: unknown) => handleRequest(SkillListRequestSchema, raw, () => toOk(store.list())),
    [IPC.skills.create]: (raw: unknown) =>
      handleRequest(SkillCreateRequestSchema, raw, (input) => toEnvelope(store.create(input))),
    [IPC.skills.update]: (raw: unknown) =>
      handleRequest(SkillUpdateRequestSchema, raw, (input) => toEnvelope(store.update(input))),
    [IPC.skills.delete]: (raw: unknown) =>
      handleRequest(SkillDeleteRequestSchema, raw, (input) => toEnvelope(store.remove(input.id))),
  };
}

function handleRequest<TSchema extends z.ZodType>(
  schema: TSchema,
  raw: unknown,
  run: (input: z.infer<TSchema>) => TIpcResult<TSkillListResponse>,
): TIpcResult<TSkillListResponse> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
  return run(parsed.data);
}

function toEnvelope(result: TSkillStoreResult): TIpcResult<TSkillListResponse> {
  return result.ok ? toOk(result.skillList) : fail(result.code, result.message);
}

function toOk(skillList: TSkillListResponse['skillList']): TIpcResult<TSkillListResponse> {
  return ok(SkillListResponseSchema.parse({ skillList }));
}
