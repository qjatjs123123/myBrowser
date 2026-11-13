import { describe, expect, it } from 'vitest';

import { isAllowedTabUrl } from '../urlPolicy';

describe('isAllowedTabUrl', () => {
  it.each(['http://127.0.0.1:8080/a', 'https://www.naver.com/', 'about:blank'])('%s 는 허용한다', (url) => {
    expect(isAllowedTabUrl(url)).toBe(true);
  });

  it.each([
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,<h1>x</h1>',
    'chrome://settings',
    'about:config',
    'naver.com',
    '',
  ])('%s 는 거부한다', (url) => {
    expect(isAllowedTabUrl(url)).toBe(false);
  });
});
