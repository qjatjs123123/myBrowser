import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from './fixtures';

const { version } = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as { version: string };

test('앱을 실행하면 브라우징 영역·에이전트 사이드바·앱 정보가 보인다', async ({ win }) => {
  await expect(win.getByRole('heading', { name: '새 탭' })).toBeVisible();
  await expect(win.getByRole('heading', { name: '에이전트' })).toBeVisible();
  await expect(win.getByText(`myBrowser v${version} · 테스트`)).toBeVisible();
});

test('renderer 에는 window.api 의 app·tabs·shortcut·agent·account·window·runs·skills·bookmarks·history 만 노출되고 Node 는 노출되지 않는다', async ({
  win,
}) => {
  const exposure = await win.evaluate(() => ({
    apiKeyList: Object.keys((globalThis as unknown as { api: object }).api),
    appKeyList: Object.keys((globalThis as unknown as { api: { app: object } }).api.app),
    hasRequire: typeof (globalThis as { require?: unknown }).require !== 'undefined',
    hasProcess: typeof (globalThis as { process?: unknown }).process !== 'undefined',
  }));
  expect(exposure).toEqual({
    apiKeyList: ['app', 'tabs', 'shortcut', 'agent', 'account', 'window', 'runs', 'skills', 'bookmarks', 'history'],
    appKeyList: ['getInfo'],
    hasRequire: false,
    hasProcess: false,
  });
});
