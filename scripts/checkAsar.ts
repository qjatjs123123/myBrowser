/**
 * [asar 검사] 설치판 app.asar 에 들어가면 안 되는 파일이 있는지 본다 (spec 005 FR-1·SR-3).
 * - `.env*` 는 어느 위치든 금지
 * - `src/`·`e2e/`·`spec/` 는 asar 최상위만 금지 (production 의존성의 node_modules/x/src/ 는 허용)
 * 실행: `pnpm check:asar [asar 경로]` — Node type stripping 으로 바로 돈다. 위반이 있으면 종료 코드 1.
 */
import { listPackage } from '@electron/asar';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_ASAR_PATH = 'release/linux-unpacked/resources/app.asar';
const TOP_LEVEL_FORBIDDEN_DIR_LIST = ['src', 'e2e', 'spec'];
const ENV_FILE_PATTERN = /^\.env/;

/** asar 목록 경로를 `/a/b` 꼴로 맞춘다 — Windows 는 `\a\b` 로 나온다 */
function toPosixEntry(entry: string): string {
  const posix = entry.replaceAll('\\', '/');
  return posix.startsWith('/') ? posix : `/${posix}`;
}

/** 한 경로가 금지 대상인지 — 이유 문자열 또는 null */
function getForbiddenReason(entry: string): string | null {
  const segmentList = toPosixEntry(entry).split('/').filter(Boolean);
  if (segmentList.some((segment) => ENV_FILE_PATTERN.test(segment))) return '.env 파일';
  const top = segmentList[0];
  if (top && TOP_LEVEL_FORBIDDEN_DIR_LIST.includes(top)) return `최상위 ${top}/`;
  return null;
}

/** asar 목록에서 금지된 경로만 골라 `경로 (이유)` 로 돌려준다 — 비어 있으면 통과 */
export function filterForbiddenEntries(entryList: string[]): string[] {
  return entryList.flatMap((entry) => {
    const reason = getForbiddenReason(entry);
    return reason ? [`${toPosixEntry(entry)} (${reason})`] : [];
  });
}

/** CLI 진입 — 목록을 읽어 위반을 출력하고 종료 코드를 돌려준다 */
function runCli(asarPath: string): number {
  if (!existsSync(asarPath)) {
    console.error(`asar 파일이 없습니다: ${asarPath} — pnpm dist:linux 를 먼저 실행하세요`);
    return 1;
  }
  const violationList = filterForbiddenEntries(listPackage(asarPath, { isPack: false }));
  if (violationList.length === 0) {
    process.stdout.write(`asar 검사 통과: ${asarPath}\n`);
    return 0;
  }
  console.error(`설치판에 들어가면 안 되는 파일 ${violationList.length}개:\n${violationList.join('\n')}`);
  return 1;
}

const entryScript = process.argv[1];
if (entryScript && import.meta.url === pathToFileURL(resolve(entryScript)).href) {
  process.exitCode = runCli(resolve(process.argv[2] ?? DEFAULT_ASAR_PATH));
}
