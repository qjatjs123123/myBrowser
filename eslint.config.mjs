// 프로세스 경계 규칙의 강제 지점 — 근거: .claude/rules/architecture.md §1
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const NODE_ONLY = ['electron', 'electron/*', 'node:*', 'fs', 'path', 'child_process', 'os'];

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'release/**',
      'coverage/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      '.claude/**',
      '.harness/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: [
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      'e2e/**/*.ts',
      'e2e-packaged/**/*.ts',
      'scripts/**/*.{ts,mjs}',
      'eval/**/*.{ts,mjs}',
      '*.config.ts',
      '*.config.mts',
      '*.config.mjs',
      'vitest.setup.main.ts',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright 픽스처는 의존 없는 픽스처를 `async ({}, use) =>` 로 선언해야 한다
    files: ['e2e/**/*.ts', 'e2e-packaged/**/*.ts', 'eval/**/*.ts'],
    rules: { 'no-empty-pattern': 'off' },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: NODE_ONLY,
              message:
                'renderer 는 electron·Node 를 쓸 수 없다 — window.api(preload) 를 거친다 (.claude/rules/architecture.md §1)',
            },
            {
              group: ['@main/*', '**/main/**', '**/preload/**'],
              message:
                'renderer 는 main·preload 를 import 할 수 없다 — 공유는 @shared/* (.claude/rules/architecture.md §1)',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: NODE_ONLY,
              message: 'shared 는 순수 TS — electron·Node import 금지 (.claude/rules/architecture.md §1)',
            },
            {
              group: ['@main/*', '@/*', '**/main/**', '**/renderer/**', '**/preload/**'],
              message: 'shared 는 다른 프로세스를 import 할 수 없다 (.claude/rules/architecture.md §1)',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/preload/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@main/*', '@/*', '**/main/**', '**/renderer/**'],
              message: 'preload 는 shared 와 electron 만 쓴다 (.claude/rules/electron/preload.md)',
            },
            {
              group: ['node:*', 'fs', 'path', 'child_process'],
              message: 'preload 에 Node API 를 두지 않는다 (.claude/rules/electron/preload.md)',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/main/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/*', '**/renderer/**', '**/preload/**'],
              message: 'main 은 renderer·preload 를 import 할 수 없다 (.claude/rules/architecture.md §1)',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/main/agent/**/*.ts', 'src/main/browser/**/*.ts', 'src/main/store/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'electron/*'],
              message:
                'agent·browser·store 는 electron 을 모른다 — 인터페이스로 주입받는다 (.claude/rules/electron/main.md)',
            },
          ],
        },
      ],
    },
  },
);
