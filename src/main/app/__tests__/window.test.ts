import { describe, expect, it } from 'vitest';

import { createWindowOptions } from '../window';

describe('createWindowOptions', () => {
  it('보안 기본값 — contextIsolation·sandbox 켜짐, nodeIntegration 꺼짐', () => {
    const { webPreferences } = createWindowOptions('/app/preload.js');
    expect(webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: '/app/preload.js',
    });
  });

  it('창은 준비될 때까지 숨겨 둔다', () => {
    expect(createWindowOptions('/p').show).toBe(false);
  });
});
