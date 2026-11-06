import { describe, expect, it } from 'vitest';

import { isMacPlatform } from '../platform';

describe('isMacPlatform', () => {
  it('Mac userAgent 면 true 다', () => {
    expect(isMacPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 Electron/38.0.0')).toBe(true);
  });

  it.each([
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Electron/38.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Electron/38.0.0',
  ])('Linux·Windows userAgent 면 false 다 (%s)', (userAgent) => {
    expect(isMacPlatform(userAgent)).toBe(false);
  });
});
