import { z } from 'zod';

import { RefSchema } from './ref';

/** [type_text] ref 입력칸에 글 입력 — 비밀 필드는 가드가 차단(SR-2), submit 이면 확정 패턴도 검사(SR-1) */
export const TypeTextInputSchema = z.strictObject({
  ref: RefSchema,
  text: z.string().max(1000),
  submit: z.boolean().optional(),
});

export type TTypeTextInput = z.infer<typeof TypeTextInputSchema>;
