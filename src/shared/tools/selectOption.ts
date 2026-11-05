import { z } from 'zod';

import { RefSchema } from './ref';

/** [select_option] ref select 요소에서 값 선택 */
export const SelectOptionInputSchema = z.strictObject({
  ref: RefSchema,
  valueList: z.array(z.string()).min(1).max(10),
});

export type TSelectOptionInput = z.infer<typeof SelectOptionInputSchema>;
