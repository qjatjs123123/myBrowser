import { z } from 'zod';

/** [app:getInfo] 응답 — 앱 이름·버전·실행 모드 */
export const AppInfoSchema = z.strictObject({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+].+)?$/, 'semver 형식이어야 합니다'),
  mode: z.enum(['development', 'test', 'production']),
});

export type TAppInfo = z.infer<typeof AppInfoSchema>;
export type TAppMode = TAppInfo['mode'];
