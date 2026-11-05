import { z } from 'zod';

/** [snapshot] 입력 없음 — 현재 탭의 접근성 트리(ref 포함)를 읽는다 */
export const SnapshotInputSchema = z.strictObject({});

export type TSnapshotInput = z.infer<typeof SnapshotInputSchema>;
