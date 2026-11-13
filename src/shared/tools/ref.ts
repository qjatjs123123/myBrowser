import { z } from 'zod';

/**
 * [도구] 요소 지정 ref — 마지막 snapshot 이 준 `e12` 또는 프레임 접두사가 붙은 `f2e5` 형식만 받는다.
 * Playwright 는 재이동한 메인 프레임·iframe 의 요소에 `f{n}` 접두사를 붙인다 (spec 015 FR-1).
 * index.ts 가 re-export 한다 (도구 스키마 파일 ↔ index 순환 import 를 피하려고 따로 둔다).
 */
export const RefSchema = z.string().regex(/^(f\d+)?e\d+$/);

export type TRef = z.infer<typeof RefSchema>;
