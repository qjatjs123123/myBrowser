import { z } from 'zod';

/** [ask_user] 사람 개입 도구 — 빠지거나 애매한 정보를 사용자에게 묻는다 (비밀번호·카드번호는 묻지 않는다, SR-5) */
export const AskUserInputSchema = z.strictObject({
  question: z.string().min(1).max(300),
  optionList: z.array(z.string().min(1).max(60)).max(6).optional(),
});

export type TAskUserInput = z.infer<typeof AskUserInputSchema>;
