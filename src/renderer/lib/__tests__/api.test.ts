import { describe, expect, it, vi } from 'vitest';

import { getApi } from '../api';

describe('getApi', () => {
  it('preload 가 노출한 window.api 를 그대로 돌려준다', async () => {
    vi.mocked(window.api.app.getInfo).mockResolvedValue({
      ok: true,
      data: { name: 'myBrowser', version: '0.1.0', mode: 'test' },
    });
    expect(getApi()).toBe(window.api);
    await expect(getApi().app.getInfo()).resolves.toMatchObject({ ok: true });
    expect(window.api.app.getInfo).toHaveBeenCalledTimes(1);
  });
});
