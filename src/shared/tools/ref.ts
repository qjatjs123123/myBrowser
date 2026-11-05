import { z } from 'zod';

/**
 * [도구] 요소 지정 ref — 마지막 snapshot 이 준 `e12` 형식만 받는다.
 * index.ts 가 re-export 한다 (도구 스키마 파일 ↔ index 순환 import 를 피하려고 따로 둔다).
 */
export const RefSchema = z.string().regex(/^e\d+$/);

export type TRef = z.infer<typeof RefSchema>;
