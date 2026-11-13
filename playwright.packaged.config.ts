import { defineConfig } from '@playwright/test';

// 설치판 e2e (spec 005 FR-9) — release/linux-unpacked/mybrowser 를 executablePath 로 띄운다.
// 기본 e2e 와 분리: `pnpm e2e:packaged` 가 dist:linux → check:asar → 이 설정 순서로 돈다
export default defineConfig({
  testDir: './e2e-packaged',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'retain-on-failure' },
});
