import { z } from 'zod';

/** [app:getInfo] 응답 — 앱 이름·버전·실행 모드 */
export const AppInfoSchema = z.strictObject({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+].+)?$/, 'semver 형식이어야 합니다'),
  mode: z.enum(['development', 'test', 'production']),
});

export type TAppInfo = z.infer<typeof AppInfoSchema>;
export type TAppMode = TAppInfo['mode'];

/** [app:showMenu] 요청 — 툴바 [메뉴] 를 띄울 위치(창 콘텐츠 기준 DIP). 항목·동작은 main 이 정한다 (spec 023 SR-2) */
export const ShowMenuRequestSchema = z.strictObject({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});

export type TShowMenuRequest = z.infer<typeof ShowMenuRequestSchema>;
