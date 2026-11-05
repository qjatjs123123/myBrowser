import { defineConfig } from '@playwright/test';

// 실제 앱(Electron)을 _electron 으로 띄우는 e2e — 앱 실행은 e2e/fixtures.ts 가 맡는다
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'retain-on-failure' },
});
