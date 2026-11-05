/**
 * [평가 세트] `pnpm eval` 인자 해석 — 순수 함수 (spec 005 FR-8, SR-6).
 * `--real` 은 `--yes-spend` 를 함께 줘야만 실제 모델로 돈다. `eval/cli.mjs` 가 type stripping 으로 불러 쓴다
 * (지울 수 있는 TS 문법만, 로컬 import 없음).
 */

/** 사용자에게 보일 안내 문장 */
export const EVAL_MESSAGE = {
  needYesSpend: '실제 API 비용이 발생합니다. --yes-spend 를 붙여 다시 실행하세요',
  missingApiKey: 'ANTHROPIC_API_KEY 가 없습니다 — 환경변수나 .env 에 키를 넣고 다시 실행하세요',
} as const;

/** 실제 모델 평가를 켜는 env — eval/agent.eval.ts 가 읽는다 */
export const EVAL_REAL_ENV = 'MYBROWSER_EVAL_REAL';

/** 해석 결과 — run 이면 playwright 를 부르고, exit 면 안내 후 그 코드로 끝낸다 */
export type TEvalCommand =
  | { kind: 'run'; isReal: boolean; env: Record<string, string>; playwrightArgList: string[] }
  | { kind: 'exit'; code: 1 | 2; message: string };

const OWN_FLAG_LIST = ['--real', '--yes-spend', '--'];

/**
 * 인자 → 실행 방법. `--real` 단독은 2, 키가 없으면 1. 나머지 인자는 playwright 에 그대로 넘긴다(예: `--grep`).
 * @param hasApiKey 환경변수 ANTHROPIC_API_KEY 또는 .env 파일이 있는지 — 호출부가 판정한다
 */
export function resolveEvalCommand({ argList, hasApiKey }: { argList: string[]; hasApiKey: boolean }): TEvalCommand {
  const isReal = argList.includes('--real');
  const playwrightArgList = argList.filter((arg) => !OWN_FLAG_LIST.includes(arg));
  if (!isReal) return { kind: 'run', isReal: false, env: {}, playwrightArgList };
  if (!argList.includes('--yes-spend')) return { kind: 'exit', code: 2, message: EVAL_MESSAGE.needYesSpend };
  if (!hasApiKey) return { kind: 'exit', code: 1, message: EVAL_MESSAGE.missingApiKey };
  return { kind: 'run', isReal: true, env: { [EVAL_REAL_ENV]: '1' }, playwrightArgList };
}
