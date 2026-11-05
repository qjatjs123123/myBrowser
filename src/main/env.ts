import { existsSync } from 'node:fs';

import { z } from 'zod';

import type { TAppMode } from '@shared/ipc/app';

/**
 * 모델 호출 경로 (spec 005 FR-3) — fake: 가짜 fetch / gateway: 기기 토큰 + 게이트웨이 / direct: ANTHROPIC_API_KEY
 */
export type TModelMode = 'fake' | 'gateway' | 'direct';

/** 환경변수에서 읽은 실행 설정 — process.env 는 이 파일에서만 읽는다 (.claude/rules/electron/main.md) */
export interface IEnv {
  mode: TAppMode;
  isFakeModel: boolean;
  modelMode: TModelMode;
  /** 런타임 MYBROWSER_GATEWAY_URL → 없으면 빌드 상수(readEnv 의 defaultGatewayUrl) */
  gatewayUrl: string;
  cdpPort: number;
  isCdpPortExplicit: boolean;
  userDataDir?: string;
  /** electron-vite dev 가 넣어 주는 renderer 개발 서버 주소 — 없으면 빌드된 파일을 연다 */
  rendererDevUrl?: string;
  /** main 에서만 쓴다 — renderer·로그·DB·이벤트에 싣지 않는다 (SR-6) */
  anthropicApiKey?: string;
  /** 가짜 모델 시나리오 이름 — e2e/fixtures/model/{이름}.json */
  fakeScenario?: string;
  /** 가짜 시나리오 폴더 — test 모드에서만 (패키징된 앱에는 e2e/ 가 없다) */
  fakeScenarioDir?: string;
  /** 모델 id — 날짜 접미사 금지. gateway 모드는 GATEWAY_MODEL 고정 */
  model: string;
}

const DEFAULT_CDP_PORT = 9222;
const DEFAULT_MODEL = 'claude-opus-5-5';
/** 게이트웨이 허용 목록과 같은 모델 — gateway 모드는 MYBROWSER_MODEL 을 무시한다 */
const GATEWAY_MODEL = 'claude-opus-5-5';

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
  MYBROWSER_GATEWAY_URL: z.url({ protocol: /^https?$/ }).optional(),
  MYBROWSER_FAKE_SCENARIO_DIR: z.string().min(1).optional(),
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

/** 모델 호출 경로 판정 — 위에서부터 첫 일치 (spec 005 FR-3) */
function getModelMode({
  isFakeModel,
  hasGatewayUrl,
  isPackaged,
}: {
  isFakeModel: boolean;
  hasGatewayUrl: boolean;
  isPackaged: boolean;
}): TModelMode {
  if (isFakeModel) return 'fake';
  if (hasGatewayUrl || isPackaged) return 'gateway';
  return 'direct';
}

export interface IReadEnvOptions {
  isPackaged: boolean;
  /** 빌드 상수 __GATEWAY_URL__ — index.ts 만 읽어 넘긴다 */
  defaultGatewayUrl: string;
}

/**
 * 환경변수를 검증해 실행 설정을 만든다. 잘못된 값은 시작 시점에 바로 실패시킨다.
 * @param source 보통 process.env — 테스트에서 주입
 */
export function readEnv(source: NodeJS.ProcessEnv, { isPackaged, defaultGatewayUrl }: IReadEnvOptions): IEnv {
  const parsed = RawEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`환경변수가 올바르지 않습니다: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  }
  const raw = parsed.data;
  const isFakeModel = raw.MYBROWSER_FAKE_MODEL === '1';
  const mode = getMode(raw.NODE_ENV === 'test' || isFakeModel, isPackaged);
  const modelMode = getModelMode({ isFakeModel, hasGatewayUrl: raw.MYBROWSER_GATEWAY_URL !== undefined, isPackaged });
  return {
    mode,
    isFakeModel,
    modelMode,
    gatewayUrl: raw.MYBROWSER_GATEWAY_URL ?? defaultGatewayUrl,
    ...getCdpPort(raw.MYBROWSER_CDP_PORT, isPackaged),
    userDataDir: raw.MYBROWSER_USER_DATA,
    rendererDevUrl: raw.ELECTRON_RENDERER_URL,
    anthropicApiKey: raw.ANTHROPIC_API_KEY,
    fakeScenario: raw.MYBROWSER_FAKE_SCENARIO,
    fakeScenarioDir: mode === 'test' ? raw.MYBROWSER_FAKE_SCENARIO_DIR : undefined,
    model: modelMode === 'gateway' ? GATEWAY_MODEL : (raw.MYBROWSER_MODEL ?? DEFAULT_MODEL),
  };
}

/**
 * CDP 포트 — 명시하면 그 값, 패키징된 앱은 0(임의 포트, SR-4), 그 외 9222.
 * getCdpSwitches 와 resolveCdpEndpoint 가 같은 값을 쓴다 (spec 005 FR-2).
 */
function getCdpPort(
  explicitPort: number | undefined,
  isPackaged: boolean,
): Pick<IEnv, 'cdpPort' | 'isCdpPortExplicit'> {
  if (explicitPort !== undefined) return { cdpPort: explicitPort, isCdpPortExplicit: true };
  return { cdpPort: isPackaged ? 0 : DEFAULT_CDP_PORT, isCdpPortExplicit: false };
}

/** loadDotEnv 입력 — 테스트에서 source·exists·loadEnvFile 을 가짜로 주입한다 */
export interface ILoadDotEnvOptions {
  path: string;
  /** 패키징된 앱은 .env 를 읽지 않는다 (spec 005 SR-3) */
  isPackaged: boolean;
  source?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  /** source 에 파일 값을 써 넣는다 — 기본 process.loadEnvFile (process.env 에 쓴다) */
  loadEnvFile?: (path: string) => void;
}

/**
 * `.env` 를 source 에 읽어 넣는다 — readEnv 는 source 만 읽으므로 그 전에 부른다.
 * 패키징·테스트·가짜 모델 모드에서는 아무 일도 하지 않고(실제 키 사용 방지), 이미 설정된 값은 덮어쓰지 않는다.
 */
export function loadDotEnv({
  path,
  isPackaged,
  source = process.env,
  exists = existsSync,
  loadEnvFile = (file) => process.loadEnvFile(file),
}: ILoadDotEnvOptions): void {
  if (isPackaged || source.NODE_ENV === 'test' || source.MYBROWSER_FAKE_MODEL === '1') return;
  if (!exists(path)) return;
  const presetList = Object.entries(source).filter(([, value]) => value !== undefined);
  loadEnvFile(path);
  for (const [key, value] of presetList) source[key] = value;
}
