/**
 * [e2e 실행기] Playwright e2e 를 기본으로 가상 디스플레이(xvfb)에서 돌린다 (spec 008 FR-1·FR-2).
 * 데스크톱(WSLg)에 e2e 창이 뜨면 OS 포커스를 가져가 사용자의 실제 키보드·IME 입력이 테스트 창에 섞인다.
 * - Linux + xvfb-run 있음 + E2E_HEADED≠1 → `xvfb-run -a playwright test …` (WAYLAND_DISPLAY 제거)
 * - 그 외 → `playwright test …` 그대로
 * 실행: `node --experimental-strip-types scripts/e2eRun.ts [playwright 인자…]` — 종료 코드를 그대로 낸다.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface IE2eCommand {
  command: string;
  argList: string[];
  env: NodeJS.ProcessEnv;
}

export interface IBuildE2eCommandInput {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  hasXvfb: boolean;
  /** playwright test 뒤에 붙일 인자 (SPEC 경로, -c 설정 등) */
  argList: string[];
}

/** 실행할 명령 — 가상 디스플레이를 쓸지 판정해 감싼다 */
export function buildE2eCommand({ platform, env, hasXvfb, argList }: IBuildE2eCommandInput): IE2eCommand {
  const playwrightArgList = ['test', ...argList];
  if (platform !== 'linux' || !hasXvfb || env['E2E_HEADED'] === '1') {
    return { command: 'playwright', argList: playwrightArgList, env };
  }
  const { WAYLAND_DISPLAY: _wayland, ...headlessEnv } = env;
  return { command: 'xvfb-run', argList: ['-a', 'playwright', ...playwrightArgList], env: headlessEnv };
}

/** PATH 에 실행 파일이 있는지 */
function hasExecutable(name: string, pathValue: string | undefined): boolean {
  return (pathValue ?? '').split(delimiter).some((dir) => dir !== '' && existsSync(join(dir, name)));
}

function runCli(argList: string[]): number {
  const {
    command,
    argList: commandArgList,
    env,
  } = buildE2eCommand({
    platform: process.platform,
    env: process.env,
    hasXvfb: hasExecutable('xvfb-run', process.env['PATH']),
    argList,
  });
  const result = spawnSync(command, commandArgList, { stdio: 'inherit', env });
  if (result.error) console.error(`e2e 실행 실패: ${result.error.message}`);
  return result.status ?? 1;
}

const entryScript = process.argv[1];
if (entryScript && import.meta.url === pathToFileURL(resolve(entryScript)).href) {
  process.exitCode = runCli(process.argv.slice(2));
}
