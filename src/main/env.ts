import { existsSync } from 'node:fs';

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
  /** main 에서만 쓴다 — renderer·로그·DB·이벤트에 싣지 않는다 (SR-6) */
  anthropicApiKey?: string;
  /** 가짜 모델 시나리오 이름 — e2e/fixtures/model/{이름}.json */
  fakeScenario?: string;
  /** 모델 id — 날짜 접미사 금지 */
  model: string;
}

const DEFAULT_CDP_PORT = 9222;
const DEFAULT_MODEL = 'claude-opus-5-5';

const RawEnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  MYBROWSER_FAKE_MODEL: z.enum(['0', '1']).optional(),
  MYBROWSER_CDP_PORT: z.coerce.number().int().min(0).max(65535).optional(),
  MYBROWSER_USER_DATA: z.string().min(1).optional(),
  ELECTRON_RENDERER_URL: z.url().optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  MYBROWSER_FAKE_SCENARIO: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  MYBROWSER_MODEL: z
    .string()
    .min(1)
    .refine((value) => !/-\d{8}$/.test(value), '모델 id 에 날짜 접미사를 붙이지 않습니다')
    .optional(),
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
    anthropicApiKey: raw.ANTHROPIC_API_KEY,
    fakeScenario: raw.MYBROWSER_FAKE_SCENARIO,
    model: raw.MYBROWSER_MODEL ?? DEFAULT_MODEL,
  };
}

/** loadDotEnv 입력 — 테스트에서 source·exists·loadEnvFile 을 가짜로 주입한다 */
export interface ILoadDotEnvOptions {
  path: string;
  source?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  /** source 에 파일 값을 써 넣는다 — 기본 process.loadEnvFile (process.env 에 쓴다) */
  loadEnvFile?: (path: string) => void;
}

/**
 * `.env` 를 source 에 읽어 넣는다 — readEnv 는 source 만 읽으므로 그 전에 부른다.
 * 테스트·가짜 모델 모드에서는 아무 일도 하지 않고(실제 키 사용 방지), 이미 설정된 값은 덮어쓰지 않는다.
 */
export function loadDotEnv({
  path,
  source = process.env,
  exists = existsSync,
  loadEnvFile = (file) => process.loadEnvFile(file),
}: ILoadDotEnvOptions): void {
  if (source.NODE_ENV === 'test' || source.MYBROWSER_FAKE_MODEL === '1') return;
  if (!exists(path)) return;
  const presetList = Object.entries(source).filter(([, value]) => value !== undefined);
  loadEnvFile(path);
  for (const [key, value] of presetList) source[key] = value;
}
