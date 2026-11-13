import { z } from 'zod';

import { RefSchema } from './ref';

/** [snapshot] 현재 탭의 접근성 트리(ref 포함)를 읽는다 — ref 를 주면 그 요소 하위만 (spec 015 FR-4) */
export const SnapshotInputSchema = z.strictObject({ ref: RefSchema.optional() });

export type TSnapshotInput = z.infer<typeof SnapshotInputSchema>;
