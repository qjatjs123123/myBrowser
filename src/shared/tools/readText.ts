import { z } from 'zod';

import { RefSchema } from './ref';

/** [read_text] ref 요소(없으면 본문)의 글을 읽는다 */
export const ReadTextInputSchema = z.strictObject({ ref: RefSchema.optional() });

export type TReadTextInput = z.infer<typeof ReadTextInputSchema>;
