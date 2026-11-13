/**
 * [평가 세트] `pnpm eval` 인자 해석 — 순수 함수 (spec 005 FR-8, SR-6 / spec 019 FR-3·FR-8).
 * `--real` 은 `--yes-spend` 를 함께 줘야만 실제 모델로 돈다. `--set sites` 는 실제 사이트 세트(`--real` 필수),
 * `--repeat N` 은 sites 세트의 시나리오당 반복 횟수. `eval/cli.mjs` 가 type stripping 으로 불러 쓴다
 * (지울 수 있는 TS 문법만, 로컬 import 없음).
 */

/** 사용자에게 보일 안내 문장 */
export const EVAL_MESSAGE = {
  needYesSpend: '실제 API 비용이 발생합니다. --yes-spend 를 붙여 다시 실행하세요',
  missingApiKey: 'ANTHROPIC_API_KEY 가 없습니다 — 환경변수나 .env 에 키를 넣고 다시 실행하세요',
  needRealForSites: '--set sites 는 실제 사이트·실제 모델 세트입니다. --real --yes-spend 와 함께 실행하세요',
  unknownSet: '--set 값은 sites 만 쓸 수 있습니다 (예: --set sites)',
  invalidRepeat: '--repeat 는 1~10 사이 정수입니다 (예: --repeat 3)',
  repeatNeedsSites: '--repeat 는 --set sites 와 함께만 쓸 수 있습니다',
} as const;

/** 실제 모델 평가를 켜는 env — eval/agent.eval.ts 가 읽는다 */
export const EVAL_REAL_ENV = 'MYBROWSER_EVAL_REAL';
/** 평가 세트 이름 env — `sites` 면 eval/sites.eval.ts 만 테스트를 만든다 */
export const EVAL_SET_ENV = 'MYBROWSER_EVAL_SET';
/** sites 세트의 시나리오당 반복 횟수 env */
export const EVAL_REPEAT_ENV = 'MYBROWSER_EVAL_REPEAT';
/** 실제 사이트 세트 이름 */
export const SITE_SET_NAME = 'sites';
/** `--repeat` 를 주지 않았을 때의 반복 횟수 */
export const DEFAULT_REPEAT = 3;

const MAX_REPEAT = 10;
/** .env 에서 자식 프로세스로 넘기는 키 — 이 두 키 외는 넘기지 않는다 (FR-8) */
const MODEL_ENV_KEY_LIST = ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL'] as const;

/** 해석 결과 — run 이면 playwright 를 부르고, exit 면 안내 후 그 코드로 끝낸다 */
export type TEvalCommand =
  | { kind: 'run'; isReal: boolean; env: Record<string, string>; playwrightArgList: string[] }
  | { kind: 'exit'; code: 1 | 2; message: string };

type TExitCommand = Extract<TEvalCommand, { kind: 'exit' }>;

/** `--set`·`--repeat` 를 걷어낸 결과 */
interface ISetOptions {
  set: string | null;
  repeat: string | null;
  restList: string[];
}

const OWN_FLAG_LIST = ['--real', '--yes-spend', '--'];
const VALUE_FLAG_LIST = ['--set', '--repeat'];

/**
 * 인자 → 실행 방법. 틀린 `--set`·`--repeat`·`--real` 단독은 2, 키가 없으면 1.
 * 나머지 인자는 playwright 에 그대로 넘긴다(예: `--grep`).
 * @param hasApiKey 환경변수 ANTHROPIC_API_KEY 또는 .env 파일이 있는지 — 호출부가 판정한다
 */
export function resolveEvalCommand({ argList, hasApiKey }: { argList: string[]; hasApiKey: boolean }): TEvalCommand {
  const isReal = argList.includes('--real');
  const { set, repeat, restList } = parseSetOptions(argList);
  const setError = getSetError({ set, repeat, isReal });
  if (setError) return setError;
  const playwrightArgList = restList.filter((arg) => !OWN_FLAG_LIST.includes(arg));
  if (!isReal) return { kind: 'run', isReal: false, env: {}, playwrightArgList };
  if (!argList.includes('--yes-spend')) return { kind: 'exit', code: 2, message: EVAL_MESSAGE.needYesSpend };
  if (!hasApiKey) return { kind: 'exit', code: 1, message: EVAL_MESSAGE.missingApiKey };
  const setEnv: Record<string, string> =
    set === null ? {} : { [EVAL_SET_ENV]: set, [EVAL_REPEAT_ENV]: repeat ?? String(DEFAULT_REPEAT) };
  return { kind: 'run', isReal: true, env: { [EVAL_REAL_ENV]: '1', ...setEnv }, playwrightArgList };
}

/** `--set`·`--repeat` 와 그 값을 꺼낸다 — 값이 없거나 다음이 플래그면 빈 문자열 */
function parseSetOptions(argList: string[]): ISetOptions {
  const found: Record<string, string> = {};
  const restList: string[] = [];
  for (let index = 0; index < argList.length; index += 1) {
    const arg = argList[index] ?? '';
    if (!VALUE_FLAG_LIST.includes(arg)) {
      restList.push(arg);
      continue;
    }
    const value = argList[index + 1];
    const hasValue = value !== undefined && !value.startsWith('--');
    found[arg] = hasValue ? value : '';
    if (hasValue) index += 1;
  }
  return { set: found['--set'] ?? null, repeat: found['--repeat'] ?? null, restList };
}

/** 세트·반복 인자 검사 — 맞으면 null */
function getSetError({ set, repeat, isReal }: { set: string | null; repeat: string | null; isReal: boolean }) {
  const exit = (message: string): TExitCommand => ({ kind: 'exit', code: 2, message });
  if (set !== null && set !== SITE_SET_NAME) return exit(EVAL_MESSAGE.unknownSet);
  if (repeat !== null && set === null) return exit(EVAL_MESSAGE.repeatNeedsSites);
  if (repeat !== null && !isValidRepeat(repeat)) return exit(EVAL_MESSAGE.invalidRepeat);
  if (set !== null && !isReal) return exit(EVAL_MESSAGE.needRealForSites);
  return null;
}

/** 1~10 정수 문자열인지 */
function isValidRepeat(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const count = Number(value);
  return count >= 1 && count <= MAX_REPEAT;
}

/**
 * `.env` 값 중 모델 접속 키 2개만, 셸 환경변수에 없을 때 고른다 (셸 값 우선, FR-8). 값은 호출부가 출력하지 않는다.
 * @param dotEnv `node:util` parseEnv 로 읽은 .env
 * @param processEnv 현재 셸 환경변수
 */
export function pickModelEnv({
  dotEnv,
  processEnv,
}: {
  dotEnv: Record<string, string | undefined>;
  processEnv: Record<string, string | undefined>;
}): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const key of MODEL_ENV_KEY_LIST) {
    const value = dotEnv[key];
    if (!processEnv[key] && value) picked[key] = value;
  }
  return picked;
}
