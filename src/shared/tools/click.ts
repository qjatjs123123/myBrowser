import { z } from 'zod';

import { RefSchema } from './ref';

/** [click] ref 요소 클릭 — 확정·결제 패턴이면 가드가 실행 전에 멈춘다(SR-1) */
export const ClickInputSchema = z.strictObject({ ref: RefSchema });

export type TClickInput = z.infer<typeof ClickInputSchema>;
