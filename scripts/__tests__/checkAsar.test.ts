import { describe, expect, it } from 'vitest';

import { filterForbiddenEntries } from '../checkAsar';

describe('filterForbiddenEntries', () => {
  it('최상위 .env 는 금지한다', () => {
    expect(filterForbiddenEntries(['/.env'])).toEqual(['/.env (.env 파일)']);
  });

  it('의존성 안의 .env.local 도 금지한다', () => {
    expect(filterForbiddenEntries(['/node_modules/x/.env.local'])).toEqual(['/node_modules/x/.env.local (.env 파일)']);
  });

  it.each(['/src/main/index.ts', '/e2e/fixtures.ts', '/spec/005-packaging-account.md'])(
    '최상위 src·e2e·spec 아래 %s 는 금지한다',
    (entry) => {
      expect(filterForbiddenEntries([entry])).toHaveLength(1);
    },
  );

  it('최상위 src 폴더 항목 자체도 금지한다', () => {
    expect(filterForbiddenEntries(['/src'])).toEqual(['/src (최상위 src/)']);
  });

  it('의존성 안의 src 폴더는 허용한다', () => {
    expect(filterForbiddenEntries(['/node_modules/x/src/index.js'])).toEqual([]);
  });

  it('설치판에 들어가야 할 out·package.json 은 허용한다', () => {
    expect(filterForbiddenEntries(['/out/main/index.js', '/package.json', '/node_modules/zod/package.json'])).toEqual(
      [],
    );
  });

  it('.env 로 시작하지 않는 비슷한 이름은 허용한다', () => {
    expect(filterForbiddenEntries(['/out/environment.js', '/node_modules/dotenv/lib/main.js'])).toEqual([]);
  });

  it('Windows 구분자 경로도 같은 기준으로 판정한다', () => {
    expect(filterForbiddenEntries(['\\src\\main\\index.ts', '\\node_modules\\x\\src\\a.js'])).toEqual([
      '/src/main/index.ts (최상위 src/)',
    ]);
  });
});
