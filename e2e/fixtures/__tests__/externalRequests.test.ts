import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../..');
const OPTION_NAME = 'allowExternalRequests';

/** dir 아래의 파일 경로를 재귀로 모은다 (node_modules·결과 폴더 제외) */
function findFileList(dir: string, isTarget: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return ['node_modules', 'results'].includes(entry.name) ? [] : findFileList(path, isTarget);
    return isTarget(entry.name) ? [path] : [];
  });
}

/** 외부 요청 차단 옵션을 쓰는 파일 (ROOT 기준 상대 경로) */
function findOptionUserList(dir: string, isTarget: (name: string) => boolean): string[] {
  return findFileList(join(ROOT, dir), isTarget)
    .filter((path) => readFileSync(path, 'utf8').includes(OPTION_NAME))
    .map((path) => relative(ROOT, path));
}

describe('외부 요청 차단 끄기 옵션의 사용 위치 (spec 020 SR-3)', () => {
  it('e2e spec 은 외부 요청 차단을 끄지 않는다', () => {
    expect(findOptionUserList('e2e', (name) => name.endsWith('.spec.ts'))).toEqual([]);
  });

  it('평가 세트에서는 실제 사이트 러너만 외부 요청 차단을 끈다', () => {
    expect(findOptionUserList('eval', (name) => /\.(ts|mjs)$/.test(name) && !name.endsWith('.test.ts'))).toEqual([
      'eval/sites.eval.ts',
    ]);
  });
});
