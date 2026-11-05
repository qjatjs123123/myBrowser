import { z } from 'zod';

import type { TAppMode } from '@shared/ipc/app';

/** 환경변수에서 읽은 실행 설정 — process.env 는 이 파일에서만 읽는다 (.claude/rules/electron/main.md) */
export interface IEnv {
  mode: TAppMode;
  isFakeModel: boolean;
  cdpPort: number;
  isCdpPortExplicit: boolean;
  userDataDir?: string;
  /** electron-vite dev 가 넣어 주는 renderer 개발 서버 주소 — 없으면 빌드된 파일을 연다 */
  rendererDevUrl?: string;
}

const DEFAULT_CDP_PORT = 9222;

const RawEnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  MYBROWSER_FAKE_MODEL: z.enum(['0', '1']).optional(),
  MYBROWSER_CDP_PORT: z.coerce.number().int().min(0).max(65535).optional(),
  MYBROWSER_USER_DATA: z.string().min(1).optional(),
  ELECTRON_RENDERER_URL: z.url().optional(),
});

/** 실행 모드 판정 — test 가 가장 우선, 그다음 패키징 여부 */
function getMode(isTest: boolean, isPackaged: boolean): TAppMode {
  if (isTest) return 'test';
  return isPackaged ? 'production' : 'development';
}

/**
 * 환경변수를 검증해 실행 설정을 만든다. 잘못된 값은 시작 시점에 바로 실패시킨다.
 * @param source 보통 process.env — 테스트에서 주입
 */
export function readEnv(source: NodeJS.ProcessEnv, { isPackaged }: { isPackaged: boolean }): IEnv {
  const parsed = RawEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`환경변수가 올바르지 않습니다: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  }
  const raw = parsed.data;
  const isFakeModel = raw.MYBROWSER_FAKE_MODEL === '1';
  return {
    mode: getMode(raw.NODE_ENV === 'test' || isFakeModel, isPackaged),
    isFakeModel,
    cdpPort: raw.MYBROWSER_CDP_PORT ?? DEFAULT_CDP_PORT,
    isCdpPortExplicit: raw.MYBROWSER_CDP_PORT !== undefined,
    userDataDir: raw.MYBROWSER_USER_DATA,
    rendererDevUrl: raw.ELECTRON_RENDERER_URL,
  };
}
