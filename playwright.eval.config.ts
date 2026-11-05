import { defineConfig } from '@playwright/test';

// 평가 세트 (spec 005 FR-8) — `pnpm eval` 이 eval/cli.mjs 를 거쳐 이 설정으로 eval/*.eval.ts 를 돌린다.
// 실제 모델(--real --yes-spend → MYBROWSER_EVAL_REAL=1)은 응답이 느려 시나리오당 시간을 늘린다
const isReal = process.env.MYBROWSER_EVAL_REAL === '1';

export default defineConfig({
  testDir: './eval',
  testMatch: '**/*.eval.ts',
  timeout: isReal ? 600_000 : 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
});
