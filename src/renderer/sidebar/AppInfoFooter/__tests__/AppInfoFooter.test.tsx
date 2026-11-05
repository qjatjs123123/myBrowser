import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppInfoFooter } from '..';

describe('AppInfoFooter', () => {
  it('이름·버전·모드 문구를 보여준다', async () => {
    vi.mocked(window.api.app.getInfo).mockResolvedValue({
      ok: true,
      data: { name: 'myBrowser', version: '0.1.0', mode: 'development' },
    });
    render(<AppInfoFooter />);
    expect(await screen.findByText('myBrowser v0.1.0 · 개발')).toBeInTheDocument();
  });

  it('불러오기에 실패하면 에러 문구를 보여준다', async () => {
    vi.mocked(window.api.app.getInfo).mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: '앱 내부 오류' },
    });
    render(<AppInfoFooter />);
    expect(await screen.findByText('앱 내부 오류')).toBeInTheDocument();
  });
});
